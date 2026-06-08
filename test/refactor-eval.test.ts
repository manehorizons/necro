import { execFile } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import type { RefactorClient } from "../src/refactor/client.js";
import type { RefactorProposal } from "../src/refactor/prompt.js";
import {
  evaluateProposal,
  meetsThreshold,
  proposalPasses,
  runRefactorEval,
  type RefactorEvalCase,
} from "../src/refactor/eval.js";

const exec = promisify(execFile);

const FILE = "src/svc.ts";
const SIGNATURE = "export function bigHandler(req, res) {";

const ORIGINAL = [
  "export function bigHandler(req, res) {",
  "  const a = req.a;",
  "  const b = req.b;",
  "  const c = req.c;",
  "  const x = a + b;",
  "  const y = b + c;",
  "  const z = x + y;",
  "  const r1 = x * 2;",
  "  const r2 = y * 2;",
  "  const r3 = z * 2;",
  "  return res.send(r1 + r2 + r3);",
  "}",
  "",
].join("\n");

// A behavior-preserving split: bigHandler stays, work moves to a helper.
const SPLIT = [
  "export function bigHandler(req, res) {",
  "  return res.send(computeParts(req));",
  "}",
  "",
  "function computeParts(req) {",
  "  const x = req.a + req.b;",
  "  const y = req.b + req.c;",
  "  const z = x + y;",
  "  return x * 2 + y * 2 + z * 2;",
  "}",
  "",
].join("\n");

// A "split" that changed the public signature (added a param).
const SPLIT_SIG_CHANGED = SPLIT.replace(
  "export function bigHandler(req, res) {",
  "export function bigHandler(req, res, opts) {",
);

// A no-op edit: one big function remains, nothing extracted.
const NOT_SPLIT = ORIGINAL.replace("return res.send(r1 + r2 + r3);", "return res.send(r1 + r2 + r3); // noop");

const theCase = (): RefactorEvalCase => ({
  name: "bigHandler",
  file: FILE,
  source: ORIGINAL,
  signature: SIGNATURE,
  threshold: 10,
});

/** Produce a real unified diff from `before` → `after` for `file`, via git. */
async function makeDiff(before: string, after: string): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "necro-eval-diff-"));
  try {
    const git = (args: string[]) => exec("git", args, { cwd: dir });
    await git(["init", "-q"]);
    await git(["config", "user.email", "t@t.t"]);
    await git(["config", "user.name", "t"]);
    await exec("mkdir", ["-p", join(dir, "src")]);
    await writeFile(join(dir, FILE), before);
    await git(["add", "."]);
    await git(["commit", "-q", "-m", "x"]);
    await writeFile(join(dir, FILE), after);
    return (await git(["diff"])).stdout;
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

const proposal = (diff: string, newFunctions: string[]): RefactorProposal => ({
  summary: "split",
  newFunctions,
  diff,
  rationale: "clusters",
});

describe("evaluateProposal (AC-7)", () => {
  let goodDiff: string;
  beforeEach(async () => {
    goodDiff = await makeDiff(ORIGINAL, SPLIT);
  });

  test("a real behavior-preserving split clears all three criteria (AC-7)", async () => {
    const cr = await evaluateProposal(theCase(), proposal(goodDiff, ["computeParts"]));
    expect(cr.splitsIntoMultiple).toBe(true);
    expect(cr.preservesCallSurface).toBe(true);
    expect(cr.reducesComplexity).toBe(true);
    expect(proposalPasses(cr)).toBe(true);
  });

  test("fails 'splitsIntoMultiple' when no helper functions are extracted (AC-7)", async () => {
    const cr = await evaluateProposal(theCase(), proposal(goodDiff, []));
    expect(cr.splitsIntoMultiple).toBe(false);
    expect(proposalPasses(cr)).toBe(false);
  });

  test("fails 'preservesCallSurface' when the public signature changed (AC-7)", async () => {
    const diff = await makeDiff(ORIGINAL, SPLIT_SIG_CHANGED);
    const cr = await evaluateProposal(theCase(), proposal(diff, ["computeParts"]));
    expect(cr.preservesCallSurface).toBe(false);
    expect(proposalPasses(cr)).toBe(false);
  });

  test("fails 'reducesComplexity' when one oversized function remains (AC-7)", async () => {
    const diff = await makeDiff(ORIGINAL, NOT_SPLIT);
    const cr = await evaluateProposal(theCase(), proposal(diff, ["computeParts"]));
    expect(cr.reducesComplexity).toBe(false);
    expect(proposalPasses(cr)).toBe(false);
  });
});

describe("runRefactorEval gate against a mock client (AC-7)", () => {
  let goodDiff: string;
  beforeEach(async () => {
    goodDiff = await makeDiff(ORIGINAL, SPLIT);
  });

  test("a good mock clears the 0.8 pass-rate gate (AC-7)", async () => {
    const client: RefactorClient = {
      propose: async () => ({ ok: true as const, proposal: proposal(goodDiff, ["computeParts"]) }),
    };
    const m = await runRefactorEval([theCase()], client);
    expect(m.passRate).toBe(1);
    expect(meetsThreshold(m, 0.8)).toBe(true);
  });

  test("a deliberately bad mock fails the gate (AC-7)", async () => {
    const notSplit = await makeDiff(ORIGINAL, NOT_SPLIT);
    const client: RefactorClient = {
      propose: async () => ({ ok: true as const, proposal: proposal(notSplit, []) }),
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
