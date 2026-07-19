import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";
import type { EvalCase } from "../src/triage/eval.js";
import { deriveCorpusRepos } from "../src/bench/competitors/repos.js";
import { predictCases, scorePredictions, scoreTool } from "../src/bench/competitors/score.js";
import { parseKnipJson } from "../src/bench/competitors/knip-runner.js";
import { parseTsPruneOutput } from "../src/bench/competitors/ts-prune-runner.js";

/**
 * Deterministic, offline tests for the competitor-bench mapping/scoring
 * logic and raw-output parsers. Fixtures under `test/fixtures/bench-competitors/`
 * are trimmed excerpts of real knip/ts-prune output — no live tool
 * invocation, no repo checkout, no network calls.
 */

function makeCase(name: string, truth: "dead" | "alive", file: string, symbol: string): EvalCase {
  return {
    name,
    truth,
    code: "1\t// stub",
    evidence: [],
    provenance: { repo: "trpc/trpc", sha: "aaa", file, symbol, line: 1 },
  };
}

describe("deriveCorpusRepos (AC-1, AC-3)", () => {
  test("dedups by repo+sha, in first-appearance order (AC-1, AC-3)", () => {
    const cases: EvalCase[] = [
      makeCase("a", "dead", "src/a.ts", "a"),
      makeCase("b", "alive", "src/b.ts", "b"),
      { ...makeCase("c", "dead", "src/c.ts", "c"), provenance: { repo: "honojs/hono", sha: "bbb", file: "src/c.ts", symbol: "c", line: 1 } },
    ];
    const repos = deriveCorpusRepos(cases);
    expect(repos).toEqual([
      { repo: "trpc/trpc", sha: "aaa", dirName: "trpc__trpc", cloneUrl: "https://github.com/trpc/trpc.git" },
      { repo: "honojs/hono", sha: "bbb", dirName: "honojs__hono", cloneUrl: "https://github.com/honojs/hono.git" },
    ]);
  });

  test("skips cases without provenance (AC-1, AC-3)", () => {
    const synthetic: EvalCase = { name: "s", truth: "dead", code: "1\t//", evidence: [] };
    expect(deriveCorpusRepos([synthetic])).toEqual([]);
  });
});

describe("predictCases (AC-1, AC-3)", () => {
  const cases = [
    makeCase("deadHit", "dead", "src/a.ts", "foo"),
    makeCase("deadMiss", "dead", "src/b.ts", "bar"),
    makeCase("aliveHit", "alive", "src/c.ts", "baz"),
    makeCase("aliveMiss", "alive", "src/d.ts", "qux"),
  ];
  const unused = [{ file: "src/a.ts", symbol: "foo" }, { file: "src/c.ts", symbol: "baz" }];

  test("predicts dead iff the exact file+symbol is in the tool's unused list (AC-1, AC-3)", () => {
    const predictions = predictCases(cases, unused);
    expect(predictions).toEqual([
      { name: "deadHit", truth: "dead", predictedDead: true },
      { name: "deadMiss", truth: "dead", predictedDead: false },
      { name: "aliveHit", truth: "alive", predictedDead: true },
      { name: "aliveMiss", truth: "alive", predictedDead: false },
    ]);
  });

  test("a matching symbol in a different file is not a match (AC-1, AC-3)", () => {
    const predictions = predictCases([makeCase("x", "dead", "src/other.ts", "foo")], unused);
    expect(predictions[0]?.predictedDead).toBe(false);
  });

  test("skips cases without provenance (synthetic corpus entries) (AC-1, AC-3)", () => {
    const synthetic: EvalCase = { name: "s", truth: "dead", code: "1\t//", evidence: [] };
    expect(predictCases([synthetic, ...cases], unused)).toHaveLength(cases.length);
  });
});

describe("scorePredictions (AC-1, AC-3)", () => {
  test("counts TP/FP/FN and derives precision/recall/F1 (AC-1, AC-3)", () => {
    const m = scorePredictions([
      { name: "a", truth: "dead", predictedDead: true }, // TP
      { name: "b", truth: "dead", predictedDead: false }, // FN
      { name: "c", truth: "alive", predictedDead: true }, // FP
      { name: "d", truth: "alive", predictedDead: false }, // TN
    ]);
    expect(m).toMatchObject({ total: 4, truePositives: 1, falsePositives: 1, falseNegatives: 1, precision: 0.5, recall: 0.5 });
    expect(m.f1).toBeCloseTo(0.5, 5);
  });

  test("no positive predictions ⇒ precision 1 (avoids 0/0) (AC-1, AC-3)", () => {
    const m = scorePredictions([{ name: "a", truth: "dead", predictedDead: false }]);
    expect(m.precision).toBe(1);
    expect(m.recall).toBe(0);
  });

  test("no actual positives ⇒ recall 1 (avoids 0/0) (AC-1, AC-3)", () => {
    const m = scorePredictions([{ name: "a", truth: "alive", predictedDead: false }]);
    expect(m.recall).toBe(1);
  });

  test("scoreTool composes predictCases + scorePredictions (AC-1, AC-3)", () => {
    const cases = [makeCase("deadHit", "dead", "src/a.ts", "foo")];
    const m = scoreTool(cases, [{ file: "src/a.ts", symbol: "foo" }]);
    expect(m).toMatchObject({ total: 1, truePositives: 1, precision: 1, recall: 1 });
  });
});

describe("parseKnipJson (AC-3)", () => {
  const fixture = readFileSync("test/fixtures/bench-competitors/knip-sample.json", "utf8");

  test("flattens exports and types into {file, symbol} entries (AC-3)", () => {
    const result = parseKnipJson(fixture);
    expect(result).toEqual(
      expect.arrayContaining([
        { file: "packages/server/src/observable/index.ts", symbol: "distinctUntilChanged" },
        { file: "packages/server/src/observable/index.ts", symbol: "map" },
        { file: "packages/server/src/observable/index.ts", symbol: "TeardownLogic" },
        { file: "packages/server/src/observable/index.ts", symbol: "UnsubscribeFn" },
        { file: "packages/client/src/links/localLink.ts", symbol: "localLink" },
      ]),
    );
  });

  test("a file with empty exports and types contributes nothing (AC-3)", () => {
    const result = parseKnipJson(fixture);
    expect(result.filter((r) => r.file === "packages/react-query/src/shared.ts")).toHaveLength(0);
  });
});

describe("parseTsPruneOutput (AC-3)", () => {
  const fixture = readFileSync("test/fixtures/bench-competitors/ts-prune-sample.txt", "utf8");

  test("parses plain unused-export lines (AC-3)", () => {
    const result = parseTsPruneOutput(fixture);
    expect(result).toEqual(
      expect.arrayContaining([
        { file: "packages/server/src/http.ts", symbol: "getHTTPStatusCode" },
        { file: "packages/server/src/http.ts", symbol: "getHTTPStatusCodeFromError" },
      ]),
    );
  });

  test("keeps `(used in module)` entries — used-only-within-own-file is exactly the corpus's dead pattern (AC-3)", () => {
    const result = parseTsPruneOutput(fixture);
    expect(result).toEqual(
      expect.arrayContaining([
        { file: "packages/react-query/src/createTRPCReact.tsx", symbol: "ProcedureUseQuery" },
        { file: "packages/react-query/src/createTRPCReact.tsx", symbol: "ProcedureUsePrefetchQuery" },
      ]),
    );
  });

  test("blank lines and malformed input are ignored, not thrown (AC-3)", () => {
    expect(parseTsPruneOutput("\n\nnot a valid line\n")).toEqual([]);
  });
});
