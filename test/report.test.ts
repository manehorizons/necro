import { describe, expect, test } from "vitest";
import type { ClassifiedFinding, Tier, Verdict } from "../src/analyze/classify.js";
import { sortWorstFirst } from "../src/report/sort.js";
import { toJson } from "../src/report/json.js";
import { renderEntryCollapseBanner, renderTerminal } from "../src/report/terminal.js";

function finding(
  name: string,
  tier: Tier,
  opts: { verdict?: Verdict; file?: string; line?: number } = {},
): ClassifiedFinding {
  const file = opts.file ?? `src/${name}.ts`;
  const line = opts.line ?? 1;
  return {
    node: { id: `${file}:${line}:${name}`, name, file, line, exported: false },
    verdict: opts.verdict ?? "dead",
    tier,
    autoFixEligible: tier === "certain",
    evidence: [{ ok: true, text: "0 static references (TS compiler)" }],
  };
}

describe("sortWorstFirst", () => {
  test("orders certain → likely → maybe → test-only", () => {
    const sorted = sortWorstFirst([
      finding("c", "maybe", { verdict: "test-only" }),
      finding("a", "maybe"),
      finding("b", "certain"),
      finding("d", "likely"),
    ]);
    expect(sorted.map((f) => f.node.name)).toEqual(["b", "d", "a", "c"]);
  });

  test("breaks ties by file then line", () => {
    const sorted = sortWorstFirst([
      finding("y", "certain", { file: "src/z.ts", line: 5 }),
      finding("x", "certain", { file: "src/a.ts", line: 9 }),
      finding("w", "certain", { file: "src/a.ts", line: 2 }),
    ]);
    expect(sorted.map((f) => f.node.name)).toEqual(["w", "x", "y"]);
  });
});

describe("toJson", () => {
  test("emits valid JSON with findings and complexity axes (AC-6)", () => {
    const json = toJson({
      findings: [finding("oldHelper", "certain")],
      complexity: [
        {
          detector: "nesting",
          file: "src/deep.ts",
          line: 3,
          name: "tangled",
          value: 4,
          threshold: 3,
          message: "nesting depth 4 > 3",
        },
      ],
      hotspots: [],
      duplication: [{ tokens: 60, locations: [{ file: "a.ts", startLine: 1, endLine: 9 }] }],
    });
    const parsed = JSON.parse(json) as {
      findings: Array<Record<string, unknown>>;
      complexity: Array<Record<string, unknown>>;
      hotspots: Array<Record<string, unknown>>;
      duplication: Array<Record<string, unknown>>;
    };
    expect(parsed.duplication).toHaveLength(1);
    expect(parsed.findings).toHaveLength(1);
    expect(parsed.findings[0]).toMatchObject({
      name: "oldHelper",
      file: "src/oldHelper.ts",
      line: 1,
      tier: "certain",
      verdict: "dead",
      autoFixEligible: true,
    });
    expect(parsed.complexity).toHaveLength(1);
    expect(parsed.complexity[0]).toMatchObject({ detector: "nesting", name: "tangled", value: 4 });
  });

  test("emits diagnostics.entryResolution when provided (AC-2)", () => {
    const json = toJson({
      findings: [],
      complexity: [],
      hotspots: [],
      duplication: [],
      diagnostics: {
        entryResolution: {
          prodEntryCount: 1,
          sources: [{ file: "src/cli.ts", source: "mapped" }],
          collapsed: false,
        },
      },
    });
    const parsed = JSON.parse(json) as { diagnostics: { entryResolution: { prodEntryCount: number } } };
    expect(parsed.diagnostics.entryResolution.prodEntryCount).toBe(1);
  });
});

describe("renderTerminal", () => {
  test("says so when there are no findings", () => {
    expect(renderTerminal([], "/", false)).toBe("no findings");
  });

  test("renders a summary line and the evidence chains", () => {
    const text = renderTerminal([finding("a", "certain"), finding("b", "maybe")], "/", false);
    expect(text).toMatch(/2 findings/);
    expect(text).toContain("tier: certain");
    expect(text).toContain("tier: maybe");
    expect(text).toContain("✓ 0 static references");
  });
});

describe("renderEntryCollapseBanner (AC-3)", () => {
  test("renders nothing when reachability did not collapse", () => {
    expect(
      renderEntryCollapseBanner({ prodEntryCount: 1, sources: [], collapsed: false }),
    ).toBeNull();
  });

  test("renders one banner naming the three remedies when collapsed", () => {
    const banner = renderEntryCollapseBanner({ prodEntryCount: 0, sources: [], collapsed: true });
    expect(banner).not.toBeNull();
    expect(banner).toContain("0 production entry points resolved");
    expect(banner).toMatch(/main|module|bin|exports/);
    expect(banner).toMatch(/entries/);
    expect(banner).toMatch(/index\.ts|conventional/);
  });
});
