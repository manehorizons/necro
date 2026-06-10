import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";
import type { RefactorClient } from "../src/refactor/client.js";
import { buildCasePrompt, evaluateProposal, loadEvalCases, proposalPasses, runRefactorEval } from "../src/refactor/eval.js";
import type { RefactorProposal } from "../src/refactor/prompt.js";

/**
 * Deterministic CI guard for the real-repo refactor corpus — runs with NO API
 * key and makes NO network call. Validates corpus integrity (so a bad/edited
 * corpus fails loudly) and the structural scoring math against synthetic
 * proposals on a real corpus case.
 */
const corpusPath = join(dirname(fileURLToPath(import.meta.url)), "fixtures/refactor-realrepo/cases.json");

describe("real-repo refactor corpus integrity (AC-2)", () => {
  test("loads ≥12 cases spanning ≥2 source repos (AC-1)", async () => {
    const cases = await loadEvalCases(corpusPath);
    expect(cases.length).toBeGreaterThanOrEqual(12);
    // multi-repo: the gate must not silently collapse onto a single source's style.
    const repos = new Set(cases.map((c) => c.provenance?.repo).filter(Boolean));
    expect(repos.size).toBeGreaterThanOrEqual(2);
  });

  test("every case carries verbatim source, signature, threshold, and complete provenance (AC-2)", async () => {
    const cases = await loadEvalCases(corpusPath);
    for (const c of cases) {
      // raw source (NOT line-prefixed — buildCasePrompt numbers it) whose first line is the signature
      expect(typeof c.source).toBe("string");
      expect(c.source.length).toBeGreaterThan(0);
      expect(c.source).not.toMatch(/^\d+\t/m);
      expect(c.source).toContain(c.signature);
      expect(c.source.split("\n")[0]).toBe(c.signature);
      // a real god function: its body exceeds the LOC threshold the split must bring units under
      expect(c.threshold).toBeGreaterThan(0);
      expect(c.source.split("\n").length).toBeGreaterThan(c.threshold);
      // provenance present and complete (auditable back to the pinned checkout)
      expect(c.provenance).toBeDefined();
      expect(c.provenance?.repo).toBeTruthy();
      expect(c.provenance?.sha).toBeTruthy();
      expect(c.provenance?.file).toBeTruthy();
      expect(typeof c.provenance?.line).toBe("number");
      expect(c.provenance?.symbol).toBe(c.name);
    }
  });

  test("every case builds a production refactor prompt carrying its source (AC-2)", async () => {
    const cases = await loadEvalCases(corpusPath);
    for (const c of cases) {
      const p = buildCasePrompt(c);
      expect(p.user).toContain(`God function: ${c.name}`);
      expect(p.user).toContain(c.signature);
    }
  });
});

describe("structural scoring math on a real corpus case (AC-2)", () => {
  // A real corpus case (hono's getKeyAlgorithm) with a clean single-line signature.
  const SIG = "function getKeyAlgorithm(name: SignatureAlgorithm): KeyAlgorithm {";
  const findKey = async () => {
    const c = (await loadEvalCases(corpusPath)).find((c) => c.name === "getKeyAlgorithm");
    if (!c) throw new Error("expected getKeyAlgorithm in the corpus");
    return c;
  };

  // A genuine split: original keeps its signature and delegates to a small helper.
  const goodSplit: RefactorProposal = {
    summary: "extract algorithm lookup",
    newFunctions: ["pickAlgorithm"],
    rationale: "lift the per-name lookup into a helper",
    replacement: [SIG, "  return pickAlgorithm(name);", "}", "function pickAlgorithm(name: SignatureAlgorithm): KeyAlgorithm {", "  return {} as KeyAlgorithm;", "}"].join("\n"),
  };
  const singleFn: RefactorProposal = { ...goodSplit, replacement: [SIG, "  return {} as KeyAlgorithm;", "}"].join("\n") };
  const sigChanged: RefactorProposal = { ...goodSplit, replacement: goodSplit.replacement.replace(SIG, "function getKeyAlgorithm(name: SignatureAlgorithm, opts: unknown): KeyAlgorithm {") };

  const mock = (proposal: RefactorProposal): RefactorClient => ({
    propose: async () => ({ ok: true as const, proposal }),
    proposeDuplicate: async () => ({ ok: false as const, reason: "n/a" }),
  });

  test("a genuine split clears all three structural criteria (AC-2)", async () => {
    const cr = await evaluateProposal(await findKey(), goodSplit);
    expect(cr.splitsIntoMultiple).toBe(true);
    expect(cr.preservesCallSurface).toBe(true);
    expect(cr.reducesComplexity).toBe(true);
    expect(proposalPasses(cr)).toBe(true);
  });

  test("a perfect oracle yields pass-rate 1; degenerate proposals fail the same case (AC-2)", async () => {
    const c = await findKey();
    expect((await runRefactorEval([c], mock(goodSplit))).passRate).toBe(1);
    // single function — no split
    expect((await runRefactorEval([c], mock(singleFn))).passRate).toBe(0);
    // changed public signature — call surface broken
    expect((await runRefactorEval([c], mock(sigChanged))).passRate).toBe(0);
    // unparseable response — a failed case, never throws
    const dead: RefactorClient = { propose: async () => ({ ok: false, reason: "unparseable" }), proposeDuplicate: async () => ({ ok: false, reason: "n/a" }) };
    const m = await runRefactorEval([c], dead);
    expect(m.passRate).toBe(0);
    expect(m.rows[0]?.pass).toBe(false);
  });
});
