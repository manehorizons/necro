import { describe, expect, test } from "vitest";
import type { RefactorClient } from "../src/refactor/client.js";
import type { EvalCase } from "../src/triage/eval.js";
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
    expect(r.methodologyVersion).toBe(2);
    expect(r.generatedAt).toBe("2026-06-11T12:00:00.000Z");
    expect(r.model).toBe("stub-model");
    expect(r.necroVersion).toBe("9.9.9");

    expect(r.corpora.map((c) => c.id)).toEqual(["triage", "dup"]);

    const triage = r.corpora.find((c) => c.id === "triage");
    expect(triage?.metricKind).toBe("precision-recall");
    expect(triage?.n).toBe(63);
    expect(triage?.sources.map((s) => s.repo)).toEqual(["honojs/hono", "trpc/trpc"]);
    expect(triage?.sources.reduce((a, s) => a + s.cases, 0)).toBe(63);

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

describe("runBench — triage N-run variance (AC-2)", () => {
  const syntheticCases: EvalCase[] = [
    { name: "deadOne", truth: "dead", code: "1\tfunction deadOne() {}", evidence: [] },
    { name: "aliveOne", truth: "alive", code: "1\tfunction aliveOne() {}", evidence: [] },
  ];

  test("runs the triage eval `triageRuns` times and aggregates min/mean/max (AC-2)", async () => {
    // Run 0 and run 2 classify both cases correctly; run 1 misses the dead case
    // (predicts it alive) — a deliberate dip so min < mean < max is provable.
    let callIndex = 0;
    const varyingStub: TriageClient = {
      classify: async () => {
        const runIndex = Math.floor(callIndex / syntheticCases.length);
        const c = syntheticCases[callIndex % syntheticCases.length]!;
        callIndex++;
        if (runIndex === 1 && c.truth === "dead") {
          return { verdict: "likely-alive", reasoning: "stub" };
        }
        return { verdict: c.truth === "dead" ? "likely-dead" : "likely-alive", reasoning: "stub" };
      },
    };

    const r = await runBench(
      { triageClient: varyingStub, refactorClient: refactorStub },
      { ...base, corpus: "triage", triageRuns: 3, loadTriageCases: async () => syntheticCases },
    );

    expect(callIndex).toBe(3 * syntheticCases.length);
    const triage = r.corpora.find((c) => c.id === "triage")!;
    const m = triage.metrics as Extract<typeof triage.metrics, { precision: number }>;

    // recall: run0=1, run1=0, run2=1 → min 0, mean 0.667, max 1
    expect(m.variance).toBeDefined();
    expect(m.variance?.recall.min).toBe(0);
    expect(m.variance?.recall.max).toBe(1);
    expect(m.variance?.recall.mean).toBeCloseTo(0.6667, 3);
    // top-level recall is the mean, matching variance.recall.mean
    expect(m.recall).toBeCloseTo(m.variance!.recall.mean, 10);
    expect(m.variance?.precision.min).toBe(1);
    expect(m.variance?.precision.max).toBe(1);
  });

  test("a single run (triageRuns=1) omits variance (methodologyVersion-1-compatible shape) (AC-2)", async () => {
    const r = await runBench(
      { triageClient: triageStub, refactorClient: refactorStub },
      { ...base, corpus: "triage", triageRuns: 1, loadTriageCases: async () => syntheticCases },
    );
    const triage = r.corpora.find((c) => c.id === "triage")!;
    const m = triage.metrics as Extract<typeof triage.metrics, { precision: number }>;
    expect(m.variance).toBeUndefined();
  });
});
