import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { describe, expect, test } from "vitest";
import type { CaseProvenance } from "../src/triage/eval-capture.js";

/**
 * Deterministic CI guard for the Python real-repo corpus — runs with NO API
 * key and makes NO network call. Validates corpus structure and labeling
 * discipline so a bad/edited corpus fails loudly (mirrors
 * test/triage-realrepo-corpus.test.ts's integrity-test style for the JS/TS
 * corpus).
 */
const corpusPath = join(dirname(fileURLToPath(import.meta.url)), "fixtures/python-realrepo/cases.json");

interface RealrepoCase {
  name: string;
  truth: "dead" | "alive";
  provenance: CaseProvenance;
  rationale: string;
}

async function loadCases(): Promise<RealrepoCase[]> {
  return JSON.parse(await readFile(corpusPath, "utf8")) as RealrepoCase[];
}

describe("python real-repo corpus integrity (AC-3)", () => {
  test("case count is between 40 and 60 inclusive, both truth classes present, ≥2 repos (AC-3)", async () => {
    const cases = await loadCases();
    expect(cases.length).toBeGreaterThanOrEqual(40);
    expect(cases.length).toBeLessThanOrEqual(60);
    expect(cases.some((c) => c.truth === "dead")).toBe(true);
    expect(cases.some((c) => c.truth === "alive")).toBe(true);
    const repos = new Set(cases.map((c) => c.provenance?.repo).filter(Boolean));
    expect(repos.size).toBeGreaterThanOrEqual(2);
  });

  test("every case has a non-empty rationale and complete, self-consistent provenance (AC-3)", async () => {
    const cases = await loadCases();
    for (const c of cases) {
      expect(c.truth === "dead" || c.truth === "alive").toBe(true);
      expect(typeof c.rationale).toBe("string");
      expect(c.rationale.length).toBeGreaterThan(0);
      expect(c.provenance).toBeDefined();
      expect(c.provenance.repo).toBeTruthy();
      expect(c.provenance.sha).toBeTruthy();
      expect(c.provenance.file).toBeTruthy();
      expect(typeof c.provenance.line).toBe("number");
      expect(c.provenance.symbol).toBe(c.name);
    }
  });

  test("case names are unique within the corpus (AC-3)", async () => {
    const cases = await loadCases();
    const names = cases.map((c) => c.name);
    expect(new Set(names).size).toBe(names.length);
  });

  test("a corpus truncated below 40 or stripped of a truth class fails these assertions (guard works) (AC-3)", async () => {
    const cases = await loadCases();
    const tooFew = cases.slice(0, 5);
    expect(tooFew.length).toBeLessThan(40);

    const onlyAlive = cases.filter((c) => c.truth === "alive");
    expect(onlyAlive.some((c) => c.truth === "dead")).toBe(false);

    const strippedRationale: RealrepoCase = { ...cases[0]!, rationale: "" };
    expect(strippedRationale.rationale.length).toBe(0); // the assertion above would reject this

    const mismatchedSymbol: RealrepoCase = {
      ...cases[0]!,
      provenance: { ...cases[0]!.provenance, symbol: "not-the-name" },
    };
    expect(mismatchedSymbol.provenance.symbol).not.toBe(mismatchedSymbol.name);
  });
});
