import { describe, expect, test } from "vitest";
import type { RefactorClient } from "../src/refactor/client.js";
import type { DuplicateProposal, RefactorProposal } from "../src/refactor/prompt.js";
import {
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

  test("fails when a clone site is left un-replaced (duplication remains) (AC-7)", async () => {
    const oneEdit = { ...goodDup(), edits: [goodDup().edits[0]!] };
    const cr = await evaluateDuplicateProposal(dupCase(), oneEdit);
    expect(cr.extractsSharedFunction).toBe(false); // edit count != location count
    expect(cr.collapsesDuplication).toBe(false); // the second site is still duplicated
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
