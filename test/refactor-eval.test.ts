import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";
import type { RefactorClient } from "../src/refactor/client.js";
import type { DuplicateProposal, RefactorProposal } from "../src/refactor/prompt.js";
import {
  COLLAPSE_RATIO,
  type DuplicateEvalCase,
  duplicatePasses,
  evaluateDuplicateProposal,
  evaluateProposal,
  meetsThreshold,
  proposalPasses,
  runDuplicateEval,
  runRefactorEval,
  type RefactorEvalCase,
} from "../src/refactor/eval.js";

const SIGNATURE = "export function bigHandler(req, res) {";

const theCase = (): RefactorEvalCase => ({
  name: "bigHandler",
  file: "src/svc.ts",
  source: `${SIGNATURE}\n  return req.a + req.b + req.c;\n}\n`,
  signature: SIGNATURE,
  threshold: 5,
});

const proposal = (replacement: string, newFunctions: string[]): RefactorProposal => ({
  summary: "split",
  newFunctions,
  replacement,
  rationale: "clusters",
});

const GOOD = [
  "export function bigHandler(req, res) {",
  "  return res.send(computeParts(req));",
  "}",
  "function computeParts(req) {",
  "  return req.a + req.b + req.c;",
  "}",
].join("\n");

const SINGLE_FN = ["export function bigHandler(req, res) {", "  return res.send(req.a + req.b);", "}"].join("\n");

const SIG_CHANGED = GOOD.replace("export function bigHandler(req, res) {", "export function bigHandler(req, res, opts) {");

const STILL_BIG = [
  "export function bigHandler(req, res) {",
  "  return res.send(computeParts(req));",
  "}",
  "function computeParts(req) {",
  "  const a = req.a;",
  "  const b = req.b;",
  "  const c = req.c;",
  "  const d = req.d;",
  "  const e = req.e;",
  "  return a + b + c + d + e;",
  "}",
].join("\n");

describe("evaluateProposal (AC-7)", () => {
  test("a real behavior-preserving split clears all three criteria (AC-7)", async () => {
    const cr = await evaluateProposal(theCase(), proposal(GOOD, ["computeParts"]));
    expect(cr.splitsIntoMultiple).toBe(true);
    expect(cr.preservesCallSurface).toBe(true);
    expect(cr.reducesComplexity).toBe(true);
    expect(proposalPasses(cr)).toBe(true);
  });

  test("fails 'splitsIntoMultiple' when only one function remains (AC-7)", async () => {
    const cr = await evaluateProposal(theCase(), proposal(SINGLE_FN, []));
    expect(cr.splitsIntoMultiple).toBe(false);
    expect(proposalPasses(cr)).toBe(false);
  });

  test("fails 'preservesCallSurface' when the public signature changed (AC-7)", async () => {
    const cr = await evaluateProposal(theCase(), proposal(SIG_CHANGED, ["computeParts"]));
    expect(cr.preservesCallSurface).toBe(false);
    expect(proposalPasses(cr)).toBe(false);
  });

  test("fails 'reducesComplexity' when an extracted function is still oversized (AC-7)", async () => {
    const cr = await evaluateProposal(theCase(), proposal(STILL_BIG, ["computeParts"]));
    expect(cr.splitsIntoMultiple).toBe(true);
    expect(cr.reducesComplexity).toBe(false);
    expect(proposalPasses(cr)).toBe(false);
  });
});

describe("runRefactorEval gate against a mock client (AC-7)", () => {
  test("a good mock clears the 0.8 pass-rate gate (AC-7)", async () => {
    const client: RefactorClient = {
      propose: async () => ({ ok: true as const, proposal: proposal(GOOD, ["computeParts"]) }),
      proposeDuplicate: async () => ({ ok: false as const, reason: "n/a" }),
    };
    const m = await runRefactorEval([theCase()], client);
    expect(m.passRate).toBe(1);
    expect(meetsThreshold(m, 0.8)).toBe(true);
  });

  test("a deliberately bad mock fails the gate (AC-7)", async () => {
    const client: RefactorClient = {
      propose: async () => ({ ok: true as const, proposal: proposal(SINGLE_FN, []) }),
      proposeDuplicate: async () => ({ ok: false as const, reason: "n/a" }),
    };
    const m = await runRefactorEval([theCase()], client);
    expect(m.passRate).toBe(0);
    expect(meetsThreshold(m, 0.8)).toBe(false);
  });

  test("an unparseable response counts as a failed case, never throws (AC-7)", async () => {
    const client: RefactorClient = {
      propose: async () => ({ ok: false, reason: "unparseable" }),
      proposeDuplicate: async () => ({ ok: false, reason: "n/a" }),
    };
    const m = await runRefactorEval([theCase()], client);
    expect(m.passRate).toBe(0);
    expect(m.rows[0]?.pass).toBe(false);
  });
});

// ── extract-duplicate ───────────────────────────────────────────────────────

const dupCase = (): DuplicateEvalCase => ({
  name: "report-mean-same-file",
  files: [
    {
      path: "src/metrics.ts",
      source: [
        'import { round } from "./math.js";',
        "export function reportA(values) {",
        "  const total = values.reduce((s, v) => s + v, 0);",
        "  const mean = total / values.length;",
        "  return round(mean, 2);",
        "}",
        "export function reportB(values) {",
        "  const total = values.reduce((s, v) => s + v, 0);",
        "  const mean = total / values.length;",
        "  return round(mean, 2);",
        "}",
        "",
      ].join("\n"),
    },
  ],
  locations: [
    { file: "src/metrics.ts", startLine: 3, endLine: 5 },
    { file: "src/metrics.ts", startLine: 8, endLine: 10 },
  ],
  tokens: 18,
  minTokens: 10,
  signatures: ["export function reportA(values) {", "export function reportB(values) {"],
});

const SHARED_FN =
  "export function meanOf(values) {\n  const total = values.reduce((s, v) => s + v, 0);\n  const mean = total / values.length;\n  return round(mean, 2);\n}";

const goodDup = (): DuplicateProposal => ({
  summary: "extract meanOf",
  sharedFunction: SHARED_FN,
  sharedFunctionFile: "src/metrics.ts",
  edits: [
    { file: "src/metrics.ts", startLine: 3, endLine: 5, replacement: "  return meanOf(values);" },
    { file: "src/metrics.ts", startLine: 8, endLine: 10, replacement: "  return meanOf(values);" },
  ],
  rationale: "lifted the shared mean computation",
});

const dupClient = (proposal: DuplicateProposal): RefactorClient => ({
  propose: async () => ({ ok: false as const, reason: "n/a" }),
  proposeDuplicate: async () => ({ ok: true as const, proposal }),
});

describe("evaluateDuplicateProposal (AC-7)", () => {
  test("a real extraction clears all three criteria (AC-7)", async () => {
    const cr = await evaluateDuplicateProposal(dupCase(), goodDup());
    expect(cr.extractsSharedFunction).toBe(true);
    expect(cr.collapsesDuplication).toBe(true);
    expect(cr.preservesCallSurface).toBe(true);
    expect(duplicatePasses(cr)).toBe(true);
  });

  test("fails when no shared function is introduced (AC-7)", async () => {
    const cr = await evaluateDuplicateProposal(dupCase(), { ...goodDup(), sharedFunction: "const meanOf = 1;" });
    expect(cr.extractsSharedFunction).toBe(false);
    expect(duplicatePasses(cr)).toBe(false);
  });

  test("fails when a clone site is left un-replaced (wrong edit count) (AC-7)", async () => {
    const oneEdit = { ...goodDup(), edits: [goodDup().edits[0]!] };
    const cr = await evaluateDuplicateProposal(dupCase(), oneEdit);
    // A dropped edit is caught structurally (edit count != location count). The
    // edited-site collapse metric only inspects the edits the model did make, so
    // a single trivial call leaves no residual clone — the failure is correctly
    // attributed to extractsSharedFunction, not collapsesDuplication.
    expect(cr.extractsSharedFunction).toBe(false);
    expect(duplicatePasses(cr)).toBe(false);
  });

  test("fails when an edit changes a site's call surface (signature) (AC-7)", async () => {
    const sigChanged: DuplicateProposal = {
      ...goodDup(),
      edits: [
        // spans the signature line and rewrites it
        { file: "src/metrics.ts", startLine: 2, endLine: 5, replacement: "export function reportA(values, opts) {\n  return meanOf(values);" },
        { file: "src/metrics.ts", startLine: 8, endLine: 10, replacement: "  return meanOf(values);" },
      ],
    };
    const cr = await evaluateDuplicateProposal(dupCase(), sigChanged);
    expect(cr.preservesCallSurface).toBe(false);
    expect(duplicatePasses(cr)).toBe(false);
  });
});

// ── edited-site partial-collapse boundary (phase 16) ─────────────────────────

// Captured live-model proposals + their case inputs are snapshotted under
// proposals/ so these scorer-regression tests stay hermetic — independent of
// which cases remain in the live corpus (count-L24 / query-builder-L90 are
// dropped from cases.json but kept here as genuinely-uncollapsible references).
const CORPUS_DIR = join(dirname(fileURLToPath(import.meta.url)), "fixtures/refactor-dup-realrepo");
const loadFixture = (name: string): DuplicateProposal =>
  JSON.parse(readFileSync(join(CORPUS_DIR, "proposals", `${name}.json`), "utf8")) as DuplicateProposal;
const loadCase = (name: string): DuplicateEvalCase =>
  JSON.parse(readFileSync(join(CORPUS_DIR, "proposals", `${name}.case.json`), "utf8")) as DuplicateEvalCase;

/** A "lazy" extraction: declares a real shared function (so it clears the
 * structural check) but leaves the full duplicated body inline at every site
 * instead of replacing it with a call — the duplication is not actually lifted. */
const lazyDup = (): DuplicateProposal => {
  const body = "  const total = values.reduce((s, v) => s + v, 0);\n  const mean = total / values.length;\n  return round(mean, 2);";
  return { ...goodDup(), edits: goodDup().edits.map((e) => ({ ...e, replacement: body })) };
};

describe("collapsesDuplication is measured on the edited sites (AC-1, AC-2)", () => {
  test("a genuine extraction the live model produced collapses the duplication — utils-L303 (AC-1)", async () => {
    const cr = await evaluateDuplicateProposal(loadCase("utils-L303"), loadFixture("utils-L303"));
    // The shared typeof-guard was lifted into isAllowedType; the edited sites no
    // longer clone one another (residual < minTokens). The OLD whole-file metric
    // failed this case on unrelated near-identical config code — the bug this fixes.
    expect(cr.extractsSharedFunction).toBe(true);
    expect(cr.collapsesDuplication).toBe(true);
    expect(cr.preservesCallSurface).toBe(true);
    expect(duplicatePasses(cr)).toBe(true);
  });

  test("a class-structural 'extraction' that can't lift the body still fails (AC-2)", async () => {
    // count-L24 / query-builder-L90: the live model returns a real exported helper
    // and one edit per site, but the duplicated constructor / select-overload block
    // remains cloned across the edits (~87% of the group) — genuinely not deduped.
    for (const name of ["count-L24", "query-builder-L90"]) {
      const cr = await evaluateDuplicateProposal(loadCase(name), loadFixture(name));
      expect(cr.extractsSharedFunction, `${name}: extracts shared function`).toBe(true);
      expect(cr.collapsesDuplication, `${name}: duplication NOT collapsed`).toBe(false);
      expect(duplicatePasses(cr), `${name}: fails overall`).toBe(false);
    }
  });

  test("a lazy extraction that leaves the body inline fails the partial-collapse margin (AC-2)", async () => {
    const cr = await evaluateDuplicateProposal(dupCase(), lazyDup());
    // A real shared function is declared and call surfaces survive, but the edits
    // still clone the whole body — collapse must reject it.
    expect(cr.extractsSharedFunction).toBe(true);
    expect(cr.preservesCallSurface).toBe(true);
    expect(cr.collapsesDuplication).toBe(false);
    expect(duplicatePasses(cr)).toBe(false);
  });

  test("the collapse margin sits strictly between a real extraction (≈0) and a non-extraction (≈0.87) (AC-1)", () => {
    // Pins COLLAPSE_RATIO away from both ends: a value at 0 would reject good
    // partial extractions; a value at/above the captured non-extraction residual
    // (~0.87) would credit them. The boundary tests above fail if it drifts there.
    expect(COLLAPSE_RATIO).toBeGreaterThan(0);
    expect(COLLAPSE_RATIO).toBeLessThan(0.87);
  });
});

describe("runDuplicateEval gate against a mock client (AC-7)", () => {
  test("a good mock clears the 0.8 pass-rate gate (AC-7)", async () => {
    const m = await runDuplicateEval([dupCase()], dupClient(goodDup()));
    expect(m.passRate).toBe(1);
    expect(meetsThreshold(m, 0.8)).toBe(true);
  });

  test("a deliberately bad mock fails the gate (AC-7)", async () => {
    const m = await runDuplicateEval([dupCase()], dupClient({ ...goodDup(), edits: [goodDup().edits[0]!] }));
    expect(m.passRate).toBe(0);
    expect(meetsThreshold(m, 0.8)).toBe(false);
  });

  test("an unparseable response counts as a failed case, never throws (AC-7)", async () => {
    const client: RefactorClient = {
      propose: async () => ({ ok: false, reason: "n/a" }),
      proposeDuplicate: async () => ({ ok: false, reason: "unparseable" }),
    };
    const m = await runDuplicateEval([dupCase()], client);
    expect(m.passRate).toBe(0);
    expect(m.rows[0]?.pass).toBe(false);
  });
});
