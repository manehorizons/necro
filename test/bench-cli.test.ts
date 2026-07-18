import { describe, expect, test } from "vitest";
import { mergeCorpora, parseArgs } from "../src/bench/cli-bench.js";
import type { BenchResults } from "../src/bench/snapshot.js";

describe("bench CLI arg parsing (AC-1, AC-3)", () => {
  test("defaults to all corpora, the standard out path, and a real write (AC-1, AC-3)", () => {
    expect(parseArgs([])).toEqual({ corpus: "all", out: "bench/results.json", dryRun: false });
  });

  test("honours --corpus, --out, and --dry-run (AC-1, AC-3)", () => {
    expect(parseArgs(["--corpus", "dup", "--out", "tmp/x.json", "--dry-run"])).toEqual({
      corpus: "dup",
      out: "tmp/x.json",
      dryRun: true,
    });
  });

  test("rejects an unknown corpus (AC-1, AC-3)", () => {
    expect(() => parseArgs(["--corpus", "bogus"])).toThrow(/corpus/i);
  });

  test("honours --provider host-cli and --host-cli-bin (AC-1)", () => {
    expect(parseArgs(["--provider", "host-cli", "--host-cli-bin", "/usr/local/bin/claude"])).toEqual({
      corpus: "all",
      out: "bench/results.json",
      dryRun: false,
      provider: "host-cli",
      hostCliBin: "/usr/local/bin/claude",
    });
  });

  test("rejects an unknown provider (AC-1)", () => {
    expect(() => parseArgs(["--provider", "bogus"])).toThrow(/provider/i);
  });
});

function dupCorpus(): BenchResults["corpora"][number] {
  return {
    id: "dup",
    metricKind: "pass-rate",
    sources: [{ repo: "trpc/trpc", sha: "abc", cases: 4 }],
    n: 4,
    metrics: { passRate: 1, passed: 4, total: 4 },
  };
}

function triageCorpus(n: number): BenchResults["corpora"][number] {
  return {
    id: "triage",
    metricKind: "precision-recall",
    sources: [{ repo: "honojs/hono", sha: "def", cases: n }],
    n,
    metrics: { precision: 1, recall: 0.8, f1: 0.89, truePositives: n, falsePositives: 0, falseNegatives: 0 },
  };
}

function results(corpora: BenchResults["corpora"]): BenchResults {
  return { schemaVersion: 1, methodologyVersion: 2, generatedAt: "t", necroVersion: "1.2.0", model: "m", corpora };
}

describe("mergeCorpora (AC-1)", () => {
  test("no existing snapshot: the fresh (possibly partial) result is used as-is (AC-1)", () => {
    const fresh = results([triageCorpus(63)]);
    expect(mergeCorpora(undefined, fresh)).toEqual(fresh);
  });

  test("a partial re-run carries the other corpus forward instead of dropping it (AC-1)", () => {
    const existing = results([dupCorpus(), triageCorpus(48)]);
    const fresh = results([triageCorpus(63)]);
    const merged = mergeCorpora(existing, fresh);
    expect(merged.corpora.map((c) => c.id).sort()).toEqual(["dup", "triage"]);
    expect(merged.corpora.find((c) => c.id === "triage")).toEqual(triageCorpus(63));
    expect(merged.corpora.find((c) => c.id === "dup")).toEqual(dupCorpus());
  });

  test("re-running the same corpus id replaces the stale entry, not both (AC-1)", () => {
    const existing = results([triageCorpus(48)]);
    const fresh = results([triageCorpus(63)]);
    const merged = mergeCorpora(existing, fresh);
    expect(merged.corpora).toHaveLength(1);
    expect(merged.corpora[0]).toEqual(triageCorpus(63));
  });

  test("top-level metadata (generatedAt, model, methodologyVersion) comes from the fresh run (AC-1)", () => {
    const existing = { ...results([dupCorpus()]), generatedAt: "old", model: "old-model" };
    const fresh = results([triageCorpus(63)]);
    const merged = mergeCorpora(existing, fresh);
    expect(merged.generatedAt).toBe(fresh.generatedAt);
    expect(merged.model).toBe(fresh.model);
  });
});
