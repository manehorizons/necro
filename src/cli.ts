import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { Command } from "commander";
import { loadConfig } from "./config.js";
import { VERSION } from "./version.js";
import { scan } from "./engine/index.js";
import { explain } from "./engine/explain.js";
import { verifyRemovals } from "./engine/verify-removal.js";
import { createNarrateClient, type NarrateClient } from "./explain/client.js";
import { MissingApiKeyError } from "./triage/client.js";
import { renderExplain } from "./report/explain.js";
import { renderVerifyRemoval } from "./report/verify-removal.js";
import { fixExitCode, runFix } from "./fix/index.js";
import { renderComplexity } from "./report/complexity.js";
import { renderDuplication } from "./report/duplication.js";
import { renderHotspots } from "./report/hotspots.js";
import { toJson } from "./report/json.js";
import { toSarif } from "./report/sarif.js";
import { gate, isSeverity, SEVERITIES } from "./report/severity.js";
import { renderEntryCollapseBanner, renderTerminal } from "./report/terminal.js";

interface ScanOptions {
  json?: boolean;
  top?: string;
  coverage?: string;
  /** Write a SARIF 2.1.0 report to this path (for CI / code-scanning). */
  sarif?: string;
  /** Exit non-zero if a finding at/above this severity exists (high|medium|low). */
  failOn?: string;
}

interface ExplainOptions {
  json?: boolean;
  narrate?: boolean;
}

interface VerifyRemovalOptions {
  json?: boolean;
  /** Comma-separated check commands to run in each worktree. */
  checks?: string;
}

interface FixOptions {
  write?: boolean;
  force?: boolean;
  coverage?: string;
}

interface TriageOptions {
  json?: boolean;
  /** Triage a prior `necro scan --json` document instead of re-scanning. */
  input?: string;
}

interface RefactorOptions {
  json?: boolean;
  /** Which refactor type to suggest (default `god-function`). */
  type?: string;
  /** Max findings to propose refactors for (default 1). */
  limit?: string;
  /** `--no-verify` sets this false; default runs scratch-worktree verification. */
  verify?: boolean;
}

const program = new Command();

program
  .name("necro")
  .description("Find anti-pattern code and propose LLM-assisted fixes.")
  .version(VERSION);

program
  .command("scan")
  .description("Scan a path for anti-pattern code")
  .argument("[path]", "directory or file to scan", ".")
  .option("--json", "emit findings as JSON")
  .option("--top <n>", "show only the worst N findings")
  .option("--coverage <path>", "path to an lcov report (default: coverage/lcov.info)")
  .option("--sarif <file>", "write a SARIF 2.1.0 report to <file> (for CI / code-scanning)")
  .option("--fail-on <severity>", "exit non-zero if a finding at/above high|medium|low exists")
  .action(async (path: string, opts: ScanOptions) => {
    const failOn = opts.failOn;
    if (failOn !== undefined && !isSeverity(failOn)) {
      console.error(`--fail-on must be one of: ${SEVERITIES.join(", ")}`);
      process.exitCode = 1;
      return;
    }

    const target = resolve(process.cwd(), path);
    const config = await loadConfig(process.cwd());
    if (opts.coverage) config.coveragePath = opts.coverage;
    const { findings, complexity, hotspots, duplication, diagnostics } = await scan(target, config);

    // SARIF and --fail-on consider the full result set, never the --top view.
    const full = { findings, complexity, hotspots, duplication, diagnostics };
    const top = opts.top ? Number.parseInt(opts.top, 10) : undefined;
    const shown = top && top > 0 ? findings.slice(0, top) : findings;

    if (opts.json) {
      console.log(toJson({ findings: shown, complexity, hotspots, duplication, diagnostics }));
    } else {
      const sections = [
        renderEntryCollapseBanner(diagnostics.entryResolution),
        renderTerminal(shown),
        renderComplexity(complexity),
        renderHotspots(hotspots),
        renderDuplication(duplication),
      ].filter(Boolean);
      console.log(sections.join("\n\n"));
    }

    if (opts.sarif) {
      const sarif = toSarif(full, { srcRoot: process.cwd() });
      await writeFile(resolve(process.cwd(), opts.sarif), `${JSON.stringify(sarif, null, 2)}\n`);
    }

    if (failOn !== undefined && gate(full, failOn)) {
      process.exitCode = 1;
    }
  });

program
  .command("explain")
  .description("Explain why a symbol is alive, test-only, or dead (reachability trace)")
  .argument("<symbol>", "symbol to explain: name, file:name, or file:line:name")
  .option("--json", "emit the explanation as JSON")
  .option("--narrate", "add an LLM plain-English explanation of the verdict (needs an API key)")
  .action(async (symbol: string, opts: ExplainOptions) => {
    const target = resolve(process.cwd(), ".");
    const config = await loadConfig(process.cwd());

    // --narrate is additive: if no key (or the client can't be built), note it
    // and fall back to the deterministic trace rather than failing.
    let narrate: NarrateClient | undefined;
    if (opts.narrate) {
      try {
        narrate = createNarrateClient(config.llm);
      } catch (err) {
        if (err instanceof MissingApiKeyError) {
          console.error(`narrate skipped: ${err.message}`);
        } else throw err;
      }
    }

    const result = await explain(target, config, symbol, { narrate });

    if (opts.json) {
      console.log(JSON.stringify(result, null, 2));
    } else {
      console.log(renderExplain(result, process.cwd()));
    }

    // Non-zero when the query could not be pinned to a single symbol.
    if (result.status !== "resolved") process.exitCode = 1;
  });

program
  .command("verify-removal")
  .description("Verify whether deleting each symbol keeps the build green (isolated worktree per symbol)")
  .argument("<symbols...>", "symbols to test-remove: name, file:name, or file:line:name")
  .option("--json", "emit the per-symbol verdicts as JSON")
  .option("--checks <list>", "comma-separated check commands (default: typecheck + tests)")
  .action(async (symbols: string[], opts: VerifyRemovalOptions) => {
    const target = resolve(process.cwd(), ".");
    const config = await loadConfig(process.cwd());
    const checks = opts.checks
      ? opts.checks.split(",").map((c) => c.trim()).filter(Boolean)
      : undefined;
    const results = await verifyRemovals(target, config, symbols, {
      repoRoot: process.cwd(),
      checks,
    });

    if (opts.json) {
      console.log(JSON.stringify(results, null, 2));
    } else {
      console.log(renderVerifyRemoval(results));
    }
  });

program
  .command("fix")
  .description("Safely remove certain-dead code (preview by default)")
  .argument("[path]", "directory or file to fix", ".")
  .option("--write", "apply the removals to disk (default: preview only)")
  .option("--force", "bypass the dirty git-tree guard")
  .option("--coverage <path>", "path to an lcov report (default: coverage/lcov.info)")
  .action(async (path: string, opts: FixOptions) => {
    const target = resolve(process.cwd(), path);
    const config = await loadConfig(process.cwd());
    if (opts.coverage) config.coveragePath = opts.coverage;

    const result = await runFix(target, config, { write: opts.write, force: opts.force });
    switch (result.status) {
      case "nothing-to-fix":
        console.log("Nothing to fix — no certain-dead code found.");
        break;
      case "preview":
        console.log(result.diff);
        console.log(
          `\n${result.count} symbol(s) would be removed. Re-run with --write to apply.`,
        );
        break;
      case "refused-dirty":
        console.error(
          "Refused: the git working tree has uncommitted changes. Commit or stash first, or pass --force.",
        );
        break;
      case "refused-no-entries":
        console.error(
          "Refused: 0 production entry points resolved — reachability is unseeded, so nothing is auto-fix eligible. " +
            "Run `necro scan` for remedies (fix package.json main/bin/exports, add an \"entries\" config, or use a conventional entry filename).",
        );
        break;
      case "written":
        console.log(`Removed ${result.count} symbol(s) across ${result.files.length} file(s).`);
        break;
    }
    process.exitCode = fixExitCode(result.status);
  });

program
  .command("triage")
  .description("LLM-resolve the quarantined `maybe` findings (advisory; opt-in; uses the Anthropic API)")
  .argument("[path]", "directory or file to scan, then triage", ".")
  .option("--input <file>", "triage a prior `necro scan --json` document instead of re-scanning")
  .option("--json", "emit triaged findings as JSON")
  .action(async (path: string, opts: TriageOptions) => {
    const config = await loadConfig(process.cwd());

    // Lazy: only loaded on the triage path, never by scan/fix.
    const { createTriageClient, MissingApiKeyError } = await import("./triage/client.js");
    const { runTriage } = await import("./triage/index.js");
    const { renderTriage, toTriageJson } = await import("./report/triage.js");

    let client: import("./triage/client.js").TriageClient;
    try {
      client = createTriageClient(config.llm); // throws before any network call if no key
    } catch (err) {
      if (err instanceof MissingApiKeyError) {
        console.error(err.message);
        process.exitCode = 1;
        return;
      }
      throw err;
    }

    let findings;
    if (opts.input) {
      const { loadScanJson } = await import("./triage/load.js");
      findings = await loadScanJson(resolve(process.cwd(), opts.input));
    } else {
      // Triage only needs dead-code findings — skip the tree-sitter axis.
      const result = await scan(resolve(process.cwd(), path), config, { complexity: false });
      findings = result.findings;
    }

    const res = await runTriage(findings, config.llm, client);
    console.log(opts.json ? toTriageJson(res) : renderTriage(res));
  });

program
  .command("refactor")
  .description(
    "Suggest LLM-assisted refactors — god-function splits or extract-duplicate (advisory; opt-in; uses the Anthropic API). Prints proposals — never edits your files.",
  )
  .argument("[path]", "directory or file to scan, then refactor", ".")
  .option("--type <type>", "refactor type: god-function | extract-duplicate (default god-function)", "god-function")
  .option("--json", "emit proposals as JSON")
  .option("--limit <n>", "max findings to propose refactors for (default 1)")
  .option("--no-verify", "skip scratch-worktree verification (typecheck + tests)")
  .action(async (path: string, opts: RefactorOptions) => {
    const target = resolve(process.cwd(), path);
    const config = await loadConfig(process.cwd());

    const type = opts.type ?? "god-function";
    if (type !== "god-function" && type !== "extract-duplicate") {
      console.error(`unknown --type "${type}" (expected god-function | extract-duplicate)`);
      process.exitCode = 1;
      return;
    }

    // Lazy: only loaded on the refactor path, never by scan/fix.
    const { createRefactorClient } = await import("./refactor/client.js");
    const { MissingApiKeyError } = await import("./triage/client.js");

    let client: import("./refactor/client.js").RefactorClient;
    try {
      client = createRefactorClient(config.llm); // throws before any network call if no key
    } catch (err) {
      if (err instanceof MissingApiKeyError) {
        console.error(err.message);
        process.exitCode = 1;
        return;
      }
      throw err;
    }

    const scanResult = await scan(target, config);

    let verifyRunner: import("./refactor/verify.js").VerifyRunner | undefined;
    if (opts.verify !== false) {
      const { workingTreeState } = await import("./fix/git-guard.js");
      if ((await workingTreeState(process.cwd())) === "unknown") {
        console.error("note: not a git repository — skipping scratch-worktree verification.");
      } else {
        const { gitWorktreeRunner } = await import("./refactor/verify.js");
        verifyRunner = gitWorktreeRunner(process.cwd());
      }
    }

    const limit = opts.limit ? Number.parseInt(opts.limit, 10) : undefined;

    if (type === "extract-duplicate") {
      const { runExtractDuplicate } = await import("./refactor/index.js");
      const { renderExtractDuplicate, toExtractDuplicateJson } = await import("./report/refactor.js");
      const res = await runExtractDuplicate(scanResult.duplication, config.llm, client, { limit, verifyRunner });
      console.log(opts.json ? toExtractDuplicateJson(res) : renderExtractDuplicate(res));
      return;
    }

    const { runRefactor } = await import("./refactor/index.js");
    const { renderRefactor, toRefactorJson } = await import("./report/refactor.js");
    const res = await runRefactor(scanResult.complexity, config.llm, client, { limit, verifyRunner });
    console.log(opts.json ? toRefactorJson(res) : renderRefactor(res));
  });

program
  .command("mcp")
  .description(
    "Run necro as a read-only MCP server over stdio (agent-callable scan + verify). Never edits your files.",
  )
  .action(async () => {
    const { runStdio } = await import("./mcp/server.js");
    await runStdio(); // serves until stdin closes
  });

program.parseAsync().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exitCode = 1;
});
