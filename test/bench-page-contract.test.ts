import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";
import { parse } from "../src/bench/snapshot.js";

/**
 * Guards the contract between the committed benchmark snapshot and the Accuracy
 * docs page (website/src/content/docs/guide/accuracy.mdx). Every field the page
 * reads is asserted present here, so a schema change that would silently break the
 * published page fails the suite instead. Reads only the committed JSON — no model.
 *
 * `BENCH_SNAPSHOT` overrides the path (used to prove the guard bites against a
 * corrupted copy); by default it reads the real committed snapshot.
 */
const here = dirname(fileURLToPath(import.meta.url));
const snapshotPath = process.env.BENCH_SNAPSHOT ?? join(here, "../bench/results.json");

async function loadSnapshot() {
  return parse(await readFile(snapshotPath, "utf8"));
}

describe("Accuracy page ↔ snapshot contract (AC-2, AC-3)", () => {
  test("provenance header the page renders is present and typed (AC-2, AC-3)", async () => {
    const s = await loadSnapshot();
    expect(s.schemaVersion).toBe(1);
    expect(typeof s.necroVersion).toBe("string");
    expect(typeof s.model).toBe("string");
    // The page slices generatedAt to YYYY-MM-DD, so it must be an ISO date string.
    expect(s.generatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  test("triage corpus exposes every precision/recall field the page reads (AC-2, AC-3)", async () => {
    const s = await loadSnapshot();
    const triage = s.corpora.find((c) => c.id === "triage");
    expect(triage).toBeDefined();
    expect(triage?.metricKind).toBe("precision-recall");
    expect(typeof triage?.n).toBe("number");
    expect(triage?.sources.length).toBeGreaterThan(0);
    for (const src of triage?.sources ?? []) {
      expect(typeof src.repo).toBe("string");
      expect(typeof src.sha).toBe("string");
    }
    const m = triage?.metrics as unknown as Record<string, number>;
    for (const field of ["precision", "recall", "f1", "truePositives", "falsePositives", "falseNegatives"]) {
      expect(typeof m[field]).toBe("number");
    }
  });

  test("dup corpus exposes every pass-rate field the page reads (AC-2, AC-3)", async () => {
    const s = await loadSnapshot();
    const dup = s.corpora.find((c) => c.id === "dup");
    expect(dup).toBeDefined();
    expect(dup?.metricKind).toBe("pass-rate");
    expect(typeof dup?.n).toBe("number");
    expect(dup?.sources.length).toBeGreaterThan(0);
    const m = dup?.metrics as unknown as Record<string, number>;
    for (const field of ["passRate", "passed", "total"]) {
      expect(typeof m[field]).toBe("number");
    }
  });
});
