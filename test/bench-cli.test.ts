import { describe, expect, test } from "vitest";
import { parseArgs } from "../src/bench/cli-bench.js";

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
});
