import { fileURLToPath } from "node:url";
import { dirname, join, relative } from "node:path";
import { readFile } from "node:fs/promises";
import { describe, expect, test } from "vitest";
import { loadConfig } from "../src/config.js";
import { scan } from "../src/engine/index.js";
import type { ClassifiedFinding } from "../src/analyze/classify.js";
import { meetsFloors, scoreRealrepoCases, type RealrepoCase, type RealrepoPair } from "../src/python/realrepo-eval.js";

/**
 * The CI accuracy gate (AC-5): runs necro's real `scan()` pipeline directly
 * against the vendored pip/httpie fixtures — no API key, no LLM, no mocking —
 * and asserts precision/recall over the whole corpus clear design doc §3's
 * floors. Deterministic; participates in ordinary `npm test`.
 */
const FIXTURES_ROOT = join(dirname(fileURLToPath(import.meta.url)), "fixtures/python-realrepo");
const CORPUS_PATH = join(FIXTURES_ROOT, "cases.json");

const PRECISION_FLOOR = 0.85;
const RECALL_FLOOR = 0.5;

async function loadCases(): Promise<RealrepoCase[]> {
  return JSON.parse(await readFile(CORPUS_PATH, "utf8")) as RealrepoCase[];
}

/** Scan one vendored fixture root and index its findings by the same
 * `{file, line, name}` key a corpus case's provenance carries — `file`
 * relative to the fixture root, matching `provenance.file`'s shape. */
async function scanFixture(repoDir: string): Promise<Map<string, ClassifiedFinding>> {
  const config = await loadConfig(repoDir);
  const result = await scan(repoDir, config, { complexity: false });
  const byKey = new Map<string, ClassifiedFinding>();
  for (const finding of result.findings) {
    const relFile = relative(repoDir, finding.node.file).split("\\").join("/");
    byKey.set(`${relFile}:${finding.node.line}:${finding.node.name}`, finding);
  }
  return byKey;
}

describe("python real-repo accuracy gate (AC-5)", () => {
  test("scan()'s findings meet the precision/recall floors over the whole corpus (AC-5)", async () => {
    const cases = await loadCases();
    const pipFindings = await scanFixture(join(FIXTURES_ROOT, "pip"));
    const httpieFindings = await scanFixture(join(FIXTURES_ROOT, "httpie"));

    const pairs: RealrepoPair[] = cases.map((c) => {
      const byKey = c.provenance.repo === "pypa/pip" ? pipFindings : httpieFindings;
      const key = `${c.provenance.file}:${c.provenance.line}:${c.provenance.symbol}`;
      return { case: c, finding: byKey.get(key) ?? null };
    });

    const metrics = scoreRealrepoCases(pairs);

    expect(
      metrics.precision,
      `precision ${metrics.precision.toFixed(3)} below floor ${PRECISION_FLOOR} — misclassified: ${JSON.stringify(
        metrics.breakdown.misclassified.filter((r) => r.truth === "alive").map((r) => r.name),
      )}`,
    ).toBeGreaterThanOrEqual(PRECISION_FLOOR);
    expect(
      metrics.recall,
      `recall ${metrics.recall.toFixed(3)} below floor ${RECALL_FLOOR} — misclassified: ${JSON.stringify(
        metrics.breakdown.misclassified.filter((r) => r.truth === "dead").map((r) => r.name),
      )}`,
    ).toBeGreaterThanOrEqual(RECALL_FLOOR);
    expect(meetsFloors(metrics, PRECISION_FLOOR, RECALL_FLOOR)).toBe(true);
  });

  test("a corpus with every truth label flipped breaches both floors — the gate discriminates real signal from noise, not a tautology (AC-6)", async () => {
    const cases = await loadCases();
    const pipFindings = await scanFixture(join(FIXTURES_ROOT, "pip"));
    const httpieFindings = await scanFixture(join(FIXTURES_ROOT, "httpie"));

    // Same real scan(), same scoring path — only the ground truth is
    // corrupted (every case's truth inverted). If this still passed, the
    // assertion above wouldn't be measuring anything.
    const corrupted: RealrepoCase[] = cases.map((c) => ({ ...c, truth: c.truth === "dead" ? "alive" : "dead" }));
    const pairs: RealrepoPair[] = corrupted.map((c) => {
      const byKey = c.provenance.repo === "pypa/pip" ? pipFindings : httpieFindings;
      const key = `${c.provenance.file}:${c.provenance.line}:${c.provenance.symbol}`;
      return { case: c, finding: byKey.get(key) ?? null };
    });

    const metrics = scoreRealrepoCases(pairs);
    expect(metrics.precision).toBeLessThan(PRECISION_FLOOR);
    expect(metrics.recall).toBeLessThan(RECALL_FLOOR);
    expect(meetsFloors(metrics, PRECISION_FLOOR, RECALL_FLOOR)).toBe(false);
  });

  test("every case's provenance resolves to a real declared symbol in its fixture (no stale line numbers) (AC-5)", async () => {
    const cases = await loadCases();
    const pipConfig = await loadConfig(join(FIXTURES_ROOT, "pip"));
    const httpieConfig = await loadConfig(join(FIXTURES_ROOT, "httpie"));
    const pipResult = await scan(join(FIXTURES_ROOT, "pip"), pipConfig, { complexity: false });
    const httpieResult = await scan(join(FIXTURES_ROOT, "httpie"), httpieConfig, { complexity: false });

    // Findings only cover suspect (non-alive) symbols — resolve against the
    // full declared-symbol id space via each finding's own node plus a
    // second pass reading the raw source line to confirm the symbol name
    // actually appears there, so an "alive" case (no finding) isn't silently
    // pointing at a line that was refactored away.
    const findingIds = new Set(
      [...pipResult.findings, ...httpieResult.findings].map((f) => `${f.node.file}:${f.node.line}:${f.node.name}`),
    );
    for (const c of cases) {
      const repoRoot = c.provenance.repo === "pypa/pip" ? join(FIXTURES_ROOT, "pip") : join(FIXTURES_ROOT, "httpie");
      const absFile = join(repoRoot, c.provenance.file);
      const source = await readFile(absFile, "utf8");
      const lines = source.split("\n");
      const declLine = lines[c.provenance.line - 1] ?? "";
      const isFinding = findingIds.has(`${absFile}:${c.provenance.line}:${c.provenance.symbol}`);
      // Either this exact line is where necro flagged the finding, or (for
      // an unflagged "alive" case) the symbol name literally appears on
      // that source line — catches a stale/renamed provenance line either way.
      expect(isFinding || declLine.includes(c.provenance.symbol), `case "${c.name}": line ${c.provenance.line} of ${c.provenance.file} is "${declLine.trim()}"`).toBe(
        true,
      );
    }
  });
});
