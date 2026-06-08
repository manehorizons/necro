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
    endLine: 7,
    code: "3\texport function bigHandler(req, res) {\n4\t  return step1(req);\n5\t}",
  },
  imports: ['import { step1 } from "./steps.js";'],
});

describe("buildRefactorPrompt (AC-3)", () => {
  test("includes the function body, the finding, and the file imports (AC-3)", () => {
    const p = buildRefactorPrompt(ctx());
    expect(p.system).toMatch(/split/i);
    expect(p.user).toContain("bigHandler");
    expect(p.user).toContain("export function bigHandler(req, res) {");
    expect(p.user).toContain('import { step1 } from "./steps.js";');
  });
});

describe("parseProposal (AC-3)", () => {
  test("accepts a well-formed proposal (AC-3)", () => {
    const res = parseProposal({
      summary: "split bigHandler into step1/step2 callers",
      newFunctions: ["handleStep1", "handleStep2"],
      diff: "--- a/svc.ts\n+++ b/svc.ts\n@@\n-old\n+new\n",
      rationale: "each cluster became its own function",
    });
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.proposal.newFunctions).toEqual(["handleStep1", "handleStep2"]);
      expect(res.proposal.diff).toContain("@@");
    }
  });

  test("maps a non-object response to a failed proposal, never throws (AC-3)", () => {
    const res = parseProposal("not json at all");
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason).toMatch(/unparseable|invalid/i);
  });

  test("rejects a proposal missing required fields (AC-3)", () => {
    const res = parseProposal({ summary: "x", newFunctions: ["a"] }); // no diff/rationale
    expect(res.ok).toBe(false);
  });

  test("rejects newFunctions that is not a string array (AC-3)", () => {
    const res = parseProposal({ summary: "x", newFunctions: "a", diff: "d", rationale: "r" });
    expect(res.ok).toBe(false);
  });
});

describe("PROPOSAL_SCHEMA (AC-3)", () => {
  test("constrains the four proposal fields (AC-3)", () => {
    expect(PROPOSAL_SCHEMA.required).toEqual(["summary", "newFunctions", "diff", "rationale"]);
    expect(PROPOSAL_SCHEMA.additionalProperties).toBe(false);
  });
});
