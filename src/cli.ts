import { resolve } from "node:path";
import { Command } from "commander";
import { loadConfig } from "./config.js";
import { scan } from "./engine/index.js";
import { runFix } from "./fix/index.js";
import { renderComplexity } from "./report/complexity.js";
import { renderDuplication } from "./report/duplication.js";
import { renderHotspots } from "./report/hotspots.js";
import { toJson } from "./report/json.js";
import { renderTerminal } from "./report/terminal.js";

interface ScanOptions {
  json?: boolean;
  top?: string;
  coverage?: string;
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

const program = new Command();

program
  .name("necro")
  .description("Find anti-pattern code and propose LLM-assisted fixes.")
  .version("0.0.0");

program
  .command("scan")
  .description("Scan a path for anti-pattern code")
  .argument("[path]", "directory or file to scan", ".")
  .option("--json", "emit findings as JSON")
  .option("--top <n>", "show only the worst N findings")
  .option("--coverage <path>", "path to an lcov report (default: coverage/lcov.info)")
  .action(async (path: string, opts: ScanOptions) => {
    const target = resolve(process.cwd(), path);
    const config = await loadConfig(process.cwd());
    if (opts.coverage) config.coveragePath = opts.coverage;
    const { findings, complexity, hotspots, duplication } = await scan(target, config);

    const top = opts.top ? Number.parseInt(opts.top, 10) : undefined;
    const shown = top && top > 0 ? findings.slice(0, top) : findings;

    if (opts.json) {
      console.log(toJson({ findings: shown, complexity, hotspots, duplication }));
    } else {
      const sections = [
        renderTerminal(shown),
        renderComplexity(complexity),
        renderHotspots(hotspots),
        renderDuplication(duplication),
      ].filter(Boolean);
      console.log(sections.join("\n\n"));
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
      case "written":
        console.log(`Removed ${result.count} symbol(s) across ${result.files.length} file(s).`);
        break;
    }
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

program.parseAsync().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exitCode = 1;
});
