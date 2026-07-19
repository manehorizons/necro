/**
 * Runs knip (JSON reporter) against a corpus repo checkout and reduces its
 * per-file issue report into the flat {file, symbol} shape `score.ts` matches
 * corpus cases against. Parsing is pure and separately testable from fixture
 * JSON; only `runKnip` touches the filesystem/subprocess.
 */

import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { necroBinPath, necroPackageVersion } from "./tool-paths.js";
import type { CompetitorToolRun, RawUnusedExport } from "./types.js";

const run = promisify(execFile);

/** The subset of knip's `--reporter json` shape this parser reads. Each issue
 * is one file; `exports`/`types` are its unused top-level declarations. */
interface KnipReport {
  issues: Array<{
    file: string;
    exports?: Array<{ name: string }>;
    types?: Array<{ name: string }>;
  }>;
}

/** Reduce a knip JSON report into flat {file, symbol} entries. Unused exports
 * and unused types are both "an unused top-level declaration" for scoring
 * purposes — knip reports them in separate arrays only because it distinguishes
 * value- vs type-space exports internally. Pure. */
export function parseKnipJson(json: string): RawUnusedExport[] {
  const report = JSON.parse(json) as KnipReport;
  const out: RawUnusedExport[] = [];
  for (const issue of report.issues) {
    for (const e of issue.exports ?? []) out.push({ file: issue.file, symbol: e.name });
    for (const t of issue.types ?? []) out.push({ file: issue.file, symbol: t.name });
  }
  return out;
}

/** Run knip against `repoPath` (a corpus repo checkout root) and return its
 * flattened unused-export findings + the exact pinned version that ran. Knip
 * exits 1 when it finds issues (expected, not a failure) — only a missing
 * stdout (e.g. the process itself crashed) is treated as an error. */
export async function runKnip(repoPath: string): Promise<CompetitorToolRun> {
  const [version, stdout] = await Promise.all([
    necroPackageVersion("knip"),
    run(necroBinPath("knip"), ["--reporter", "json"], { cwd: repoPath, maxBuffer: 64 * 1024 * 1024 })
      .then((r) => r.stdout)
      .catch((err: unknown) => {
        const e = err as { stdout?: string };
        if (typeof e.stdout === "string" && e.stdout.length > 0) return e.stdout;
        throw err;
      }),
  ]);
  return { tool: "knip", version, unused: parseKnipJson(stdout) };
}
