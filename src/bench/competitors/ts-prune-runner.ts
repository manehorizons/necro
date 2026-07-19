/**
 * Runs ts-prune against a corpus repo checkout and parses its line-oriented
 * `<file>:<line> - <symbol> [(used in module)]` output into the flat
 * {file, symbol} shape `score.ts` matches corpus cases against. Parsing is
 * pure and separately testable from fixture text; only `runTsPrune` touches
 * the filesystem/subprocess.
 */

import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { necroBinPath, necroPackageVersion } from "./tool-paths.js";
import type { CompetitorToolRun, RawUnusedExport } from "./types.js";

const run = promisify(execFile);

const LINE = /^(.+):\d+\s+-\s+(\S+)/;

/** Parse ts-prune's plain-text output into flat {file, symbol} entries.
 * `(used in module)` entries are kept — an export used only within its own
 * declaring file (never externally) is exactly the "dead" pattern this
 * corpus's ground truth labels (e.g. a helper only referenced by its own
 * test file). Pure. */
export function parseTsPruneOutput(text: string): RawUnusedExport[] {
  const out: RawUnusedExport[] = [];
  for (const line of text.split("\n")) {
    const m = LINE.exec(line.trim());
    if (!m) continue;
    const [, file, symbol] = m as unknown as [string, string, string];
    out.push({ file, symbol });
  }
  return out;
}

/** Run ts-prune against `repoPath` (a corpus repo checkout root) and return
 * its flattened unused-export findings + the exact pinned version that ran.
 * ts-prune exits non-zero whenever it finds anything (expected, not a
 * failure) — only a missing stdout is treated as an error. */
export async function runTsPrune(repoPath: string): Promise<CompetitorToolRun> {
  const [version, stdout] = await Promise.all([
    necroPackageVersion("ts-prune"),
    run(necroBinPath("ts-prune"), [], {
      cwd: repoPath,
      maxBuffer: 64 * 1024 * 1024,
    })
      .then((r) => r.stdout)
      .catch((err: unknown) => {
        const e = err as { stdout?: string };
        if (typeof e.stdout === "string" && e.stdout.length > 0)
          return e.stdout;
        throw err;
      }),
  ]);
  return { tool: "ts-prune", version, unused: parseTsPruneOutput(stdout) };
}
