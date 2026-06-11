import { describe, expect, test } from "vitest";
import type { RefactorClient } from "../src/refactor/client.js";
import type { TriageClient } from "../src/triage/client.js";
import { runBench } from "../src/bench/run.js";

/**
 * Deterministic orchestration test — stub clients, zero live model calls. Runs
 * against the real in-repo corpora (the snapshot must cover them in full), so it
 * also guards the corpus case counts.
 */

// Always predicts "alive": no positive predictions, fully deterministic.
const triageStub: TriageClient = {
  classify: async () => ({ verdict: "likely-alive", reasoning: "stub" }),
};

// Never produces a usable proposal: every dup case scores as a non-pass.
const refactorStub: RefactorClient = {
  propose: async () => ({ ok: false, reason: "stub" }),
  proposeDuplicate: async () => ({ ok: false, reason: "stub" }),
};

const base = {
  now: "2026-06-11T12:00:00.000Z",
  model: "stub-model",
  necroVersion: "9.9.9",
};

describe("runBench orchestration (AC-1, AC-3)", () => {
  test("corpus=all assembles both corpora with provenance header (AC-1, AC-3)", async () => {
    const r = await runBench(
      { triageClient: triageStub, refactorClient: refactorStub },
      { ...base, corpus: "all" },
    );

    expect(r.schemaVersion).toBe(1);
    expect(r.methodologyVersion).toBe(1);
    expect(r.generatedAt).toBe("2026-06-11T12:00:00.000Z");
    expect(r.model).toBe("stub-model");
    expect(r.necroVersion).toBe("9.9.9");

    expect(r.corpora.map((c) => c.id)).toEqual(["triage", "dup"]);

    const triage = r.corpora.find((c) => c.id === "triage");
    expect(triage?.metricKind).toBe("precision-recall");
    expect(triage?.n).toBe(48);
    expect(triage?.sources.map((s) => s.repo)).toEqual(["honojs/hono", "trpc/trpc"]);
    expect(triage?.sources.reduce((a, s) => a + s.cases, 0)).toBe(48);

    const dup = r.corpora.find((c) => c.id === "dup");
    expect(dup?.metricKind).toBe("pass-rate");
    expect(dup?.n).toBe(12);
    expect(dup?.sources.map((s) => s.repo)).toEqual(["trpc/trpc", "drizzle-team/drizzle-orm"]);
    expect(dup?.sources.reduce((a, s) => a + s.cases, 0)).toBe(12);
  });

  test("corpus=triage emits only the triage corpus (AC-1, AC-3)", async () => {
    const r = await runBench(
      { triageClient: triageStub, refactorClient: refactorStub },
      { ...base, corpus: "triage" },
    );
    expect(r.corpora.map((c) => c.id)).toEqual(["triage"]);
  });

  test("corpus=dup emits only the dup corpus (AC-1, AC-3)", async () => {
    const r = await runBench(
      { triageClient: triageStub, refactorClient: refactorStub },
      { ...base, corpus: "dup" },
    );
    expect(r.corpora.map((c) => c.id)).toEqual(["dup"]);
  });
});
