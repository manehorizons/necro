import { describe, expect, test } from "vitest";
import type { RefactorContext } from "../src/refactor/context.js";
import type { ComplexityFinding } from "../src/syntactic/types.js";
import { buildRefactorPrompt, parseProposal, PROPOSAL_SCHEMA } from "../src/refactor/prompt.js";

const ctx = (): RefactorContext => ({
  finding: {
    detector: "god-function",
    file: "/src/svc.ts",
    line: 3,
    name: "bigHandler",
    value: 80,
    threshold: 50,
    message: "god function — 80 lines > 50",
  } satisfies ComplexityFinding,
  snippet: {
    file: "/src/svc.ts",
    startLine: 1,
    endLine: 5,
    code: "1\timport { step1 } from './steps.js';\n2\t\n3\texport function bigHandler(req, res) {\n4\t  return step1(req);\n5\t}",
  },
  imports: ["import { step1 } from './steps.js';"],
});

describe("buildRefactorPrompt (AC-3)", () => {
  test("asks for rewritten code (not a diff) of the function's line range (AC-3)", () => {
    const p = buildRefactorPrompt(ctx());
    expect(p.system).toMatch(/rewrit|replace/i);
    expect(p.system).toContain("replacement"); // returns code as `replacement`, not a diff
    expect(p.user).toContain("bigHandler");
    expect(p.user).toContain("export function bigHandler(req, res) {");
    // tells the model exactly which lines it is replacing (function decl .. end)
    expect(p.user).toMatch(/lines?\s*3\D+5/);
  });
});

describe("parseProposal (AC-3)", () => {
  test("accepts a well-formed proposal with replacement code (AC-3)", () => {
    const res = parseProposal({
      summary: "split bigHandler",
      newFunctions: ["handleStep1", "handleStep2"],
      replacement: "export function bigHandler(req, res) {\n  return handleStep1(req);\n}",
      rationale: "each cluster became its own function",
    });
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.proposal.newFunctions).toEqual(["handleStep1", "handleStep2"]);
      expect(res.proposal.replacement).toContain("export function bigHandler");
    }
  });

  test("maps a non-object response to a failed proposal, never throws (AC-3)", () => {
    const res = parseProposal("not json at all");
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason).toMatch(/unparseable|invalid/i);
  });

  test("rejects a proposal missing the replacement code (AC-3)", () => {
    const res = parseProposal({ summary: "x", newFunctions: ["a"], rationale: "r" }); // no replacement
    expect(res.ok).toBe(false);
  });

  test("rejects newFunctions that is not a string array (AC-3)", () => {
    const res = parseProposal({ summary: "x", newFunctions: "a", replacement: "code", rationale: "r" });
    expect(res.ok).toBe(false);
  });
});

describe("PROPOSAL_SCHEMA (AC-3)", () => {
  test("constrains the four proposal fields incl. replacement (AC-3)", () => {
    expect(PROPOSAL_SCHEMA.required).toEqual(["summary", "newFunctions", "replacement", "rationale"]);
    expect(PROPOSAL_SCHEMA.additionalProperties).toBe(false);
  });
});
