import { describe, expect, test } from "vitest";
import {
  deriveSources,
  parse,
  serialize,
  summarizeDup,
  summarizeTriage,
  type BenchResults,
} from "../src/bench/snapshot.js";

describe("bench snapshot — sources derivation (AC-1, AC-3)", () => {
  test("aggregates per-case provenance into repo+sha sources with counts (AC-1, AC-3)", () => {
    const cases = [
      { provenance: { repo: "honojs/hono", sha: "aaa" } },
      { provenance: { repo: "honojs/hono", sha: "aaa" } },
      { provenance: { repo: "trpc/trpc", sha: "bbb" } },
    ];
    expect(deriveSources(cases)).toEqual([
      { repo: "honojs/hono", sha: "aaa", cases: 2 },
      { repo: "trpc/trpc", sha: "bbb", cases: 1 },
    ]);
  });
});

describe("bench snapshot — triage summary (AC-1, AC-3)", () => {
  test("carries precision/recall/TP-FP-FN and derives F1 (AC-1, AC-3)", () => {
    const metrics = {
      total: 48,
      truePositives: 7,
      falsePositives: 0,
      falseNegatives: 8,
      precision: 1,
      recall: 0.4667,
    };
    const sources = [{ repo: "honojs/hono", sha: "aaa", cases: 48 }];
    const result = summarizeTriage(metrics, sources);
    expect(result.id).toBe("triage");
    expect(result.metricKind).toBe("precision-recall");
    expect(result.n).toBe(48);
    expect(result.sources).toBe(sources);
    const m = result.metrics as Extract<typeof result.metrics, { precision: number }>;
    expect(m.precision).toBe(1);
    expect(m.recall).toBe(0.4667);
    expect(m.truePositives).toBe(7);
    expect(m.falsePositives).toBe(0);
    expect(m.falseNegatives).toBe(8);
    // F1 = 2pr/(p+r) = 2*1*0.4667/1.4667
    expect(m.f1).toBeCloseTo(0.6363, 3);
  });

  test("F1 is 0 when precision and recall are both 0 (no divide-by-zero) (AC-1, AC-3)", () => {
    const result = summarizeTriage(
      { total: 1, truePositives: 0, falsePositives: 0, falseNegatives: 1, precision: 0, recall: 0 },
      [],
    );
    const m = result.metrics as Extract<typeof result.metrics, { precision: number }>;
    expect(m.f1).toBe(0);
  });

  test("a single run (not wrapped in an array) omits variance (AC-2)", () => {
    const result = summarizeTriage(
      { total: 48, truePositives: 7, falsePositives: 0, falseNegatives: 8, precision: 1, recall: 0.4667 },
      [],
    );
    const m = result.metrics as Extract<typeof result.metrics, { precision: number }>;
    expect(m.variance).toBeUndefined();
  });

  test("an array of one run also omits variance (AC-2)", () => {
    const result = summarizeTriage(
      [{ total: 48, truePositives: 7, falsePositives: 0, falseNegatives: 8, precision: 1, recall: 0.4667 }],
      [],
    );
    const m = result.metrics as Extract<typeof result.metrics, { precision: number }>;
    expect(m.variance).toBeUndefined();
  });

  test("N runs aggregate min/mean/max per metric and mean the top-level fields (AC-2)", () => {
    const runs = [
      { total: 48, truePositives: 6, falsePositives: 0, falseNegatives: 9, precision: 1, recall: 0.4 },
      { total: 48, truePositives: 9, falsePositives: 0, falseNegatives: 6, precision: 1, recall: 0.6 },
      { total: 48, truePositives: 8, falsePositives: 1, falseNegatives: 7, precision: 0.8889, recall: 0.5333 },
    ];
    const result = summarizeTriage(runs, [{ repo: "honojs/hono", sha: "aaa", cases: 48 }]);
    expect(result.n).toBe(48);
    const m = result.metrics as Extract<typeof result.metrics, { precision: number }>;

    expect(m.variance).toBeDefined();
    expect(m.variance?.recall).toEqual({ min: 0.4, mean: expect.closeTo(0.5111, 3), max: 0.6 });
    expect(m.variance?.precision.min).toBeCloseTo(0.8889, 3);
    expect(m.variance?.precision.max).toBe(1);
    // top-level precision/recall/TP/FP/FN are the mean across runs (TP/FP/FN rounded — they're counts)
    expect(m.recall).toBeCloseTo((0.4 + 0.6 + 0.5333) / 3, 3);
    expect(m.truePositives).toBe(Math.round((6 + 9 + 8) / 3));
    expect(m.falsePositives).toBe(Math.round((0 + 0 + 1) / 3));
    expect(m.falseNegatives).toBe(Math.round((9 + 6 + 7) / 3));
  });
});

describe("bench snapshot — dup summary (AC-1, AC-3)", () => {
  test("computes passed/total from rows and carries passRate (AC-1, AC-3)", () => {
    const metrics = {
      passRate: 0.75,
      rows: [{ pass: true }, { pass: true }, { pass: true }, { pass: false }],
    };
    const sources = [{ repo: "trpc/trpc", sha: "bbb", cases: 4 }];
    const result = summarizeDup(metrics, sources);
    expect(result.id).toBe("dup");
    expect(result.metricKind).toBe("pass-rate");
    expect(result.n).toBe(4);
    const m = result.metrics as Extract<typeof result.metrics, { passRate: number }>;
    expect(m.passRate).toBe(0.75);
    expect(m.passed).toBe(3);
    expect(m.total).toBe(4);
  });
});

describe("bench snapshot — serialize/parse (AC-1, AC-3)", () => {
  const sample: BenchResults = {
    schemaVersion: 1,
    methodologyVersion: 1,
    generatedAt: "2026-06-11T00:00:00.000Z",
    necroVersion: "1.1.0",
    model: "claude-opus-4-8",
    corpora: [
      {
        id: "triage",
        metricKind: "precision-recall",
        sources: [{ repo: "honojs/hono", sha: "aaa", cases: 48 }],
        n: 48,
        metrics: {
          precision: 1,
          recall: 0.4667,
          f1: 0.6363,
          truePositives: 7,
          falsePositives: 0,
          falseNegatives: 8,
        },
      },
    ],
  };

  test("round-trips through serialize/parse (AC-1, AC-3)", () => {
    expect(parse(serialize(sample))).toEqual(sample);
  });

  test("serialize is stable and ends with a trailing newline (AC-1, AC-3)", () => {
    const once = serialize(sample);
    expect(once.endsWith("\n")).toBe(true);
    expect(serialize(parse(once))).toBe(once);
  });
});
