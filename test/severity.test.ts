import { describe, expect, test } from "vitest";
import type { ClassifiedFinding, Tier, Verdict } from "../src/analyze/classify.js";
import type { HotspotEntry } from "../src/analyze/hotspots.js";
import type { JsonInput } from "../src/report/json.js";
import {
  complexitySeverity,
  deadCodeSeverity,
  duplicationSeverity,
  gate,
  hotspotSeverity,
  isSeverity,
  meetsThreshold,
} from "../src/report/severity.js";
import type { ComplexityFinding, DuplicationFinding } from "../src/syntactic/types.js";

function deadFinding(tier: Tier, verdict: Verdict = "dead"): ClassifiedFinding {
  return {
    node: { id: `src/x.ts:1:x`, name: "x", file: "src/x.ts", line: 1, exported: false },
    verdict,
    tier,
    autoFixEligible: tier === "certain",
    evidence: [],
  };
}

const complexity: ComplexityFinding = {
  detector: "god-function",
  file: "src/y.ts",
  line: 3,
  name: "y",
  value: 30,
  threshold: 15,
  message: "too big",
};

const duplication: DuplicationFinding = {
  tokens: 50,
  locations: [
    { file: "src/a.ts", startLine: 1, endLine: 9 },
    { file: "src/b.ts", startLine: 1, endLine: 9 },
  ],
};

const hotspot: HotspotEntry = {
  name: "z",
  file: "src/z.ts",
  line: 1,
  complexity: 20,
  coverage: null,
  crap: null,
  churn: null,
  risk: 20,
};

const empty: JsonInput = { findings: [], complexity: [], hotspots: [], duplication: [] };

describe("severity model (conservative)", () => {
  test("maps each dead-code tier/verdict to the conservative severity (AC-2)", () => {
    expect(deadCodeSeverity("certain", "dead")).toBe("high");
    expect(deadCodeSeverity("likely", "dead")).toBe("medium");
    expect(deadCodeSeverity("maybe", "dead")).toBe("low");
    // test-only is always low, regardless of tier
    expect(deadCodeSeverity("certain", "test-only")).toBe("low");
    expect(deadCodeSeverity("likely", "test-only")).toBe("low");
  });

  test("maps complexity/duplication/hotspots per the table (AC-2)", () => {
    expect(complexitySeverity()).toBe("medium");
    expect(duplicationSeverity()).toBe("low");
    expect(hotspotSeverity()).toBe("low");
  });

  test("meetsThreshold treats high ⊂ medium ⊂ low (AC-2)", () => {
    // at threshold high, only high qualifies
    expect(meetsThreshold("high", "high")).toBe(true);
    expect(meetsThreshold("medium", "high")).toBe(false);
    expect(meetsThreshold("low", "high")).toBe(false);
    // at threshold medium, high+medium qualify
    expect(meetsThreshold("high", "medium")).toBe(true);
    expect(meetsThreshold("medium", "medium")).toBe(true);
    expect(meetsThreshold("low", "medium")).toBe(false);
    // at threshold low, everything qualifies
    expect(meetsThreshold("high", "low")).toBe(true);
    expect(meetsThreshold("low", "low")).toBe(true);
  });

  test("isSeverity validates the --fail-on vocabulary (AC-2)", () => {
    expect(isSeverity("high")).toBe(true);
    expect(isSeverity("medium")).toBe(true);
    expect(isSeverity("low")).toBe(true);
    expect(isSeverity("error")).toBe(false);
    expect(isSeverity("")).toBe(false);
  });

  test("gate fails iff a finding at or above the threshold exists (AC-2)", () => {
    expect(gate(empty, "low")).toBe(false);

    const certainOnly: JsonInput = { ...empty, findings: [deadFinding("certain")] };
    expect(gate(certainOnly, "high")).toBe(true); // certain == high
    expect(gate(certainOnly, "medium")).toBe(true);

    const likelyOnly: JsonInput = { ...empty, findings: [deadFinding("likely")] };
    expect(gate(likelyOnly, "high")).toBe(false); // likely is below high
    expect(gate(likelyOnly, "medium")).toBe(true);

    const complexityOnly: JsonInput = { ...empty, complexity: [complexity] };
    expect(gate(complexityOnly, "high")).toBe(false);
    expect(gate(complexityOnly, "medium")).toBe(true); // complexity == medium

    const lowStuff: JsonInput = {
      ...empty,
      findings: [deadFinding("maybe")],
      duplication: [duplication],
      hotspots: [hotspot],
    };
    expect(gate(lowStuff, "medium")).toBe(false); // all low
    expect(gate(lowStuff, "low")).toBe(true);
  });
});
