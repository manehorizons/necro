import { describe, expect, test } from "vitest";
import { classify } from "../src/analyze/classify.js";
import type { ReachabilityResult } from "../src/analyze/reachability.js";
import type { SymbolNode } from "../src/graph/types.js";
import { renderEvidenceChain, renderFindings } from "../src/report/evidence.js";

function node(name: string, exported: boolean): SymbolNode {
  return { id: `src/${name}.ts:42:${name}`, name, file: `src/${name}.ts`, line: 42, exported };
}

function reach(
  id: string,
  reachability: ReachabilityResult["reachability"],
  tainted = false,
): ReachabilityResult {
  return { id, reachability, tainted };
}

describe("renderEvidenceChain", () => {
  test("renders a certain finding: header, passing signals, safe verdict", () => {
    const n = node("oldHelper", false);
    const [finding] = classify({ nodes: [n], reachability: [reach(n.id, "dead")] });
    const text = renderEvidenceChain(finding!);

    expect(text).toContain("oldHelper");
    expect(text).toContain("src/oldHelper.ts:42");
    expect(text).toContain("tier: certain");
    expect(text).toContain("✓ 0 static references");
    expect(text).toContain("not in package.json exports");
    expect(text).toMatch(/→ .*safe to remove/i);
  });

  test("renders a maybe finding: failing taint signal and quarantine verdict", () => {
    const n = node("formatPayload", false);
    const [finding] = classify({
      nodes: [n],
      reachability: [reach(n.id, "dead", true)],
    });
    const text = renderEvidenceChain(finding!);

    expect(text).toContain("tier: maybe");
    expect(text).toContain("✗");
    expect(text).toMatch(/dynamic-import taint/i);
    expect(text).toMatch(/→ .*NOT auto-removed/i);
    // Must not advertise unbuilt features (LLM triage is not implemented).
    expect(text).not.toMatch(/LLM triage/i);
    expect(text).toMatch(/needs (human )?review/i);
  });
});

describe("renderFindings", () => {
  test("renders multiple findings as separate boxes", () => {
    const a = node("oldHelper", false);
    const b = node("formatPayload", false);
    const findings = classify({
      nodes: [a, b],
      reachability: [reach(a.id, "dead"), reach(b.id, "dead", true)],
    });
    const text = renderFindings(findings);

    expect(text).toContain("oldHelper");
    expect(text).toContain("formatPayload");
    expect(text).toContain("tier: certain");
    expect(text).toContain("tier: maybe");
  });
});
