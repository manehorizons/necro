import { describe, expect, test } from "vitest";
import type { RefactorClient } from "../src/refactor/client.js";
import type { RefactorProposal } from "../src/refactor/prompt.js";
import {
  evaluateProposal,
  meetsThreshold,
  proposalPasses,
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
    };
    const m = await runRefactorEval([theCase()], client);
    expect(m.passRate).toBe(1);
    expect(meetsThreshold(m, 0.8)).toBe(true);
  });

  test("a deliberately bad mock fails the gate (AC-7)", async () => {
    const client: RefactorClient = {
      propose: async () => ({ ok: true as const, proposal: proposal(SINGLE_FN, []) }),
    };
    const m = await runRefactorEval([theCase()], client);
    expect(m.passRate).toBe(0);
    expect(meetsThreshold(m, 0.8)).toBe(false);
  });

  test("an unparseable response counts as a failed case, never throws (AC-7)", async () => {
    const client: RefactorClient = { propose: async () => ({ ok: false, reason: "unparseable" }) };
    const m = await runRefactorEval([theCase()], client);
    expect(m.passRate).toBe(0);
    expect(m.rows[0]?.pass).toBe(false);
  });
});
