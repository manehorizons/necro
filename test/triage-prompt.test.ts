import { describe, expect, test } from "vitest";
import type { ClassifiedFinding } from "../src/analyze/classify.js";
import { buildPrompt, parseVerdict, VERDICT_SCHEMA } from "../src/triage/prompt.js";
import type { Snippet } from "../src/triage/snippet.js";

const finding: ClassifiedFinding = {
  node: { id: "src/api/fmt.ts:42:formatPayload", name: "formatPayload", file: "src/api/fmt.ts", line: 42, exported: true },
  verdict: "dead",
  tier: "maybe",
  autoFixEligible: false,
  evidence: [
    { ok: true, text: "0 static references (TS compiler)" },
    { ok: false, text: "dynamic-import taint in scope — target unresolvable" },
  ],
};

const snippet: Snippet = {
  file: "src/api/fmt.ts",
  startLine: 41,
  endLine: 44,
  code: "41\texport function formatPayload() {\n42\t  return 1;\n43\t}",
};

describe("buildPrompt (AC-3)", () => {
  test("payload carries the symbol, location, evidence chain, and snippet (AC-3)", () => {
    const { system, user } = buildPrompt(finding, snippet);
    expect(system).toContain("ADVISORY");
    expect(user).toContain("formatPayload");
    expect(user).toContain("src/api/fmt.ts:42");
    expect(user).toContain("dynamic-import taint in scope"); // evidence text
    expect(user).toContain("export function formatPayload() {"); // snippet code
  });
});

describe("VERDICT_SCHEMA (AC-3)", () => {
  test("constrains verdict to the three enum values (AC-3)", () => {
    expect(VERDICT_SCHEMA.properties.verdict.enum).toEqual(["likely-dead", "likely-alive", "unsure"]);
    expect(VERDICT_SCHEMA.required).toEqual(["verdict", "reasoning"]);
    expect(VERDICT_SCHEMA.additionalProperties).toBe(false);
  });
});

describe("parseVerdict (AC-3)", () => {
  test("accepts a well-formed response (AC-3)", () => {
    const r = parseVerdict({ verdict: "likely-dead", reasoning: "only a test mock references it" });
    expect(r.verdict).toBe("likely-dead");
    expect(r.reasoning).toBe("only a test mock references it");
  });

  test("maps malformed responses to unsure without throwing (AC-3)", () => {
    for (const bad of [null, undefined, "nope", 42, {}, { verdict: "dead" }, { verdict: "likely-dead" }, { reasoning: "x" }, { verdict: "maybe", reasoning: "x" }]) {
      const r = parseVerdict(bad);
      expect(r.verdict).toBe("unsure");
      expect(typeof r.reasoning).toBe("string");
    }
  });
});
