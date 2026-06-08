import { describe, expect, test } from "vitest";
import type { ClassifiedFinding } from "../src/analyze/classify.js";
import { toJson } from "../src/report/json.js";
import { renderTriage, toTriageJson } from "../src/report/triage.js";
import { findingsFromScanJson } from "../src/triage/load.js";
import type { TriageRunResult, TriagedFinding } from "../src/triage/index.js";
import type { TriageVerdict } from "../src/triage/prompt.js";

function finding(name: string, file: string, line: number): ClassifiedFinding {
  return {
    node: { id: `${file}:${line}:${name}`, name, file, line, exported: true },
    verdict: "dead",
    tier: "maybe",
    autoFixEligible: false,
    evidence: [{ ok: true, text: "0 static references (TS compiler)" }],
  };
}

function triagedItem(name: string, verdict: TriageVerdict, line = 1): TriagedFinding {
  return { finding: finding(name, "src/x.ts", line), verdict, reasoning: `${name} reasoning`, model: "claude-opus-4-8" };
}

function runResult(triaged: TriagedFinding[], consideredMaybe = triaged.length, dropped = 0): TriageRunResult {
  return { triaged, consideredMaybe, dropped };
}

describe("renderTriage (AC-6)", () => {
  test("orders likely-dead → unsure → likely-alive, with reasoning (AC-6)", () => {
    const out = renderTriage(
      runResult([
        triagedItem("aliveFn", "likely-alive", 3),
        triagedItem("deadFn", "likely-dead", 1),
        triagedItem("unsureFn", "unsure", 2),
      ]),
    );
    const deadPos = out.indexOf("deadFn");
    const unsurePos = out.indexOf("unsureFn");
    const alivePos = out.indexOf("aliveFn");
    expect(deadPos).toBeLessThan(unsurePos);
    expect(unsurePos).toBeLessThan(alivePos);
    expect(out).toContain("deadFn reasoning");
    expect(out).toContain("triaged 3 maybe finding(s)");
  });

  test("zero maybe findings → a clear no-op message (AC-6)", () => {
    expect(renderTriage(runResult([], 0))).toBe("no maybe findings to triage");
  });
});

describe("toTriageJson (AC-6)", () => {
  test("attaches a triage field per finding, worst-first (AC-6)", () => {
    const json = JSON.parse(
      toTriageJson(runResult([triagedItem("aliveFn", "likely-alive", 2), triagedItem("deadFn", "likely-dead", 1)])),
    ) as { triage: Array<{ name: string; triage: { verdict: string; model: string } }> };

    expect(json.triage[0]?.name).toBe("deadFn"); // worst-first
    expect(json.triage[0]?.triage.verdict).toBe("likely-dead");
    expect(json.triage[0]?.triage.model).toBe("claude-opus-4-8");
  });
});

describe("scan/fix JSON unchanged (AC-6)", () => {
  test("toJson output carries no triage field (AC-6)", () => {
    const out = JSON.parse(
      toJson({ findings: [finding("f", "src/x.ts", 1)], complexity: [], hotspots: [], duplication: [] }),
    ) as Record<string, unknown> & { findings: Array<Record<string, unknown>> };
    expect(Object.keys(out)).toEqual(["findings", "complexity", "hotspots", "duplication"]);
    expect(out.findings[0]).not.toHaveProperty("triage");
  });
});

describe("findingsFromScanJson (AC-6)", () => {
  test("reconstructs findings from a prior scan --json document (AC-6)", () => {
    const scanJson = toJson({
      findings: [finding("maybeFn", "src/api.ts", 9)],
      complexity: [],
      hotspots: [],
      duplication: [],
    });
    const restored = findingsFromScanJson(scanJson);
    expect(restored).toHaveLength(1);
    expect(restored[0]?.node.name).toBe("maybeFn");
    expect(restored[0]?.node.file).toBe("src/api.ts");
    expect(restored[0]?.node.line).toBe(9);
    expect(restored[0]?.tier).toBe("maybe");
  });
});
