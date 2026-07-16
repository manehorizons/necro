import { describe, expect, test } from "vitest";
import type { ClassifiedFinding, Tier, Verdict } from "../src/analyze/classify.js";
import type { HotspotEntry } from "../src/analyze/hotspots.js";
import type { JsonInput } from "../src/report/json.js";
import { toSarif } from "../src/report/sarif.js";
import type { ComplexityFinding, DuplicationFinding } from "../src/syntactic/types.js";

const SRC = "/repo";

function dead(tier: Tier, verdict: Verdict = "dead", file = "/repo/src/x.ts", line = 7): ClassifiedFinding {
  return {
    node: { id: `${file}:${line}:x`, name: "x", file, line, exported: false },
    verdict,
    tier,
    autoFixEligible: tier === "certain",
    evidence: [{ ok: true, text: "0 static references (TS compiler)" }],
  };
}

const complexity: ComplexityFinding = {
  detector: "god-function",
  file: "/repo/src/y.ts",
  line: 12,
  name: "huge",
  value: 30,
  threshold: 15,
  message: "god-function: 30 > 15",
};

const duplication: DuplicationFinding = {
  tokens: 60,
  locations: [
    { file: "/repo/src/a.ts", startLine: 3, endLine: 20 },
    { file: "/repo/src/b.ts", startLine: 5, endLine: 22 },
  ],
};

const hotspot: HotspotEntry = {
  name: "risky",
  file: "/repo/src/z.ts",
  line: 4,
  complexity: 18,
  coverage: null,
  crap: null,
  churn: null,
  risk: 18,
};

const empty: JsonInput = { findings: [], complexity: [], hotspots: [], duplication: [] };

/* eslint-disable @typescript-eslint/no-explicit-any */
function results(log: any): any[] {
  return log.runs[0].results;
}

describe("SARIF 2.1.0 reporter", () => {
  test("produces a structurally valid SARIF 2.1.0 log (AC-2)", () => {
    const log: any = toSarif({ ...empty, findings: [dead("certain")] }, { srcRoot: SRC });
    expect(log.version).toBe("2.1.0");
    expect(typeof log.$schema).toBe("string");
    expect(log.$schema).toMatch(/sarif.*2\.1\.0/);
    expect(Array.isArray(log.runs)).toBe(true);
    const driver = log.runs[0].tool.driver;
    expect(driver.name).toBe("necro");
    expect(typeof driver.semanticVersion).toBe("string");
    expect(Array.isArray(driver.rules)).toBe(true);
    expect(driver.rules.length).toBeGreaterThan(0);
    // every result's ruleId is declared in driver.rules
    const ruleIds = new Set(driver.rules.map((r: any) => r.id));
    for (const r of results(log)) expect(ruleIds.has(r.ruleId)).toBe(true);
  });

  test("maps each category's severity to the SARIF level (AC-2)", () => {
    const log: any = toSarif(
      {
        findings: [dead("certain"), dead("likely"), dead("maybe"), dead("certain", "test-only")],
        complexity: [complexity],
        duplication: [duplication],
        hotspots: [hotspot],
      },
      { srcRoot: SRC },
    );
    const levels = results(log).map((r: any) => r.level);
    // certain → error, likely → warning, maybe/test-only → note
    expect(levels.filter((l: string) => l === "error").length).toBe(1); // certain only
    // warning: likely + complexity
    expect(levels.filter((l: string) => l === "warning").length).toBe(2);
    // note: maybe + test-only + duplication + hotspot
    expect(levels.filter((l: string) => l === "note").length).toBe(4);
  });

  test("emits repo-relative artifact URIs and 1-based startLine (AC-2)", () => {
    const log: any = toSarif({ ...empty, findings: [dead("certain", "dead", "/repo/src/deep/x.ts", 42)] }, { srcRoot: SRC });
    const loc = results(log)[0].locations[0].physicalLocation;
    expect(loc.artifactLocation.uri).toBe("src/deep/x.ts"); // relative, forward slashes
    expect(loc.region.startLine).toBe(42);
    expect(loc.region.startColumn).toBe(1); // no column data → default 1
  });

  test("duplication group → one result with primary + related locations (AC-2)", () => {
    const log: any = toSarif({ ...empty, duplication: [duplication] }, { srcRoot: SRC });
    const dup = results(log).filter((r: any) => r.ruleId === "duplication");
    expect(dup.length).toBe(1);
    expect(dup[0].locations[0].physicalLocation.artifactLocation.uri).toBe("src/a.ts");
    expect(dup[0].relatedLocations[0].physicalLocation.artifactLocation.uri).toBe("src/b.ts");
  });

  test("empty scan → valid run with zero results (AC-2)", () => {
    const log: any = toSarif(empty, { srcRoot: SRC });
    expect(log.version).toBe("2.1.0");
    expect(results(log)).toEqual([]);
  });

  test("entryResolution diagnostics surface as run properties (AC-2)", () => {
    const log: any = toSarif(
      {
        ...empty,
        diagnostics: {
          entryResolution: {
            prodEntryCount: 1,
            sources: [{ file: "src/cli.ts", source: "mapped" }],
            collapsed: false,
          },
        },
      },
      { srcRoot: SRC },
    );
    expect(log.runs[0].properties.entryResolution.prodEntryCount).toBe(1);
    expect(log.runs[0].properties.entryResolution.sources[0].source).toBe("mapped");
  });
});
