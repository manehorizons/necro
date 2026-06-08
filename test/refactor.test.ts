import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { DEFAULT_LLM } from "../src/config.js";
import type { RefactorClient } from "../src/refactor/client.js";
import type { RefactorProposal } from "../src/refactor/prompt.js";
import { runRefactor } from "../src/refactor/index.js";
import type { VerifyRunner } from "../src/refactor/verify.js";
import type { ComplexityFinding, Detector } from "../src/syntactic/types.js";

const PROPOSAL: RefactorProposal = {
  summary: "split",
  newFunctions: ["a", "b"],
  diff: "--- a\n+++ b\n@@\n-x\n+y\n",
  rationale: "clusters",
};

const okClient = (): RefactorClient => ({
  propose: vi.fn(async () => ({ ok: true as const, proposal: PROPOSAL })),
});

const greenRunner = (): VerifyRunner => ({
  createWorktree: async () => "/wt",
  applyDiff: async () => true,
  runCheck: async () => ({ ok: true, output: "" }),
  removeWorktree: async () => {},
});

const finding = (file: string, name: string, detector: Detector = "god-function"): ComplexityFinding => ({
  detector,
  file,
  line: 1,
  name,
  value: 80,
  threshold: 50,
  message: `${detector} — flagged`,
});

describe("runRefactor (AC-1, AC-4)", () => {
  let dir: string;
  let file: string;
  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "necro-refrun-"));
    file = join(dir, "svc.ts");
    await writeFile(file, "export function big() {\n  return 1;\n}\n");
  });
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  test("proposes only for god-function findings, never others (AC-1)", async () => {
    const client = okClient();
    const res = await runRefactor(
      [finding(file, "big", "god-function"), finding(file, "tangled", "cyclomatic")],
      DEFAULT_LLM,
      client,
      { limit: 10, verifyRunner: greenRunner() },
    );
    expect(client.propose).toHaveBeenCalledTimes(1);
    expect(res.outcomes.map((o) => o.finding.name)).toEqual(["big"]);
    expect(res.consideredGodFunctions).toBe(1);
  });

  test("zero god-function findings makes no client call and returns empty (AC-1)", async () => {
    const client = okClient();
    const res = await runRefactor([finding(file, "tangled", "cyclomatic")], DEFAULT_LLM, client, {
      verifyRunner: greenRunner(),
    });
    expect(client.propose).not.toHaveBeenCalled();
    expect(res.outcomes).toEqual([]);
    expect(res.consideredGodFunctions).toBe(0);
  });

  test("respects the limit (AC-1)", async () => {
    const client = okClient();
    const res = await runRefactor(
      [finding(file, "a"), finding(file, "b"), finding(file, "c")],
      DEFAULT_LLM,
      client,
      { limit: 1, verifyRunner: greenRunner() },
    );
    expect(client.propose).toHaveBeenCalledTimes(1);
    expect(res.outcomes).toHaveLength(1);
  });

  test("does not mutate the finding (AC-4)", async () => {
    const f = finding(file, "big");
    const snapshot = structuredClone(f);
    await runRefactor([f], DEFAULT_LLM, okClient(), { verifyRunner: greenRunner() });
    expect(f).toEqual(snapshot);
  });

  test("never writes to the source file — suggest-only (AC-4)", async () => {
    const before = await readFile(file, "utf8");
    await runRefactor([finding(file, "big")], DEFAULT_LLM, okClient(), { verifyRunner: greenRunner() });
    expect(await readFile(file, "utf8")).toBe(before);
  });

  test("attaches the verification badge from the injected runner (AC-4)", async () => {
    const res = await runRefactor([finding(file, "big")], DEFAULT_LLM, okClient(), {
      verifyRunner: greenRunner(),
    });
    expect(res.outcomes[0]?.badge?.status).toBe("green");
    expect(res.outcomes[0]?.proposal?.newFunctions).toEqual(["a", "b"]);
  });

  test("records a failure (no throw) when the model response can't be parsed (AC-4)", async () => {
    const client: RefactorClient = { propose: async () => ({ ok: false, reason: "unparseable" }) };
    const res = await runRefactor([finding(file, "big")], DEFAULT_LLM, client, {
      verifyRunner: greenRunner(),
    });
    expect(res.outcomes[0]?.proposal).toBeNull();
    expect(res.outcomes[0]?.failure).toMatch(/unparseable/);
    expect(res.outcomes[0]?.badge).toBeNull();
  });
});
