import type { SymbolNode } from "../graph/types.js";
import type { ReachabilityResult } from "./reachability.js";

/** Confidence tier for a dead-code finding (§5). */
export type Tier = "certain" | "likely" | "maybe";

/** What the finding asserts about the symbol. */
export type Verdict = "dead" | "test-only";

/**
 * One checked signal in a finding's evidence chain.
 * `ok`: true = supports the verdict (✓), false = contradicts it (✗), null = unknown/not-checked (•).
 */
export interface EvidenceSignal {
  ok: boolean | null;
  text: string;
}

export interface ClassifiedFinding {
  node: SymbolNode;
  verdict: Verdict;
  tier: Tier;
  /** Only `certain`-dead findings are eligible for `--fix-safe`; everything else needs a human. */
  autoFixEligible: boolean;
  /** The signals evaluated to reach this verdict — rendered as the evidence chain (§5). */
  evidence: EvidenceSignal[];
}

export interface ClassifyInput {
  nodes: SymbolNode[];
  reachability: ReachabilityResult[];
  /** Symbols exported as package public API — quarantined to `maybe` (external consumers invisible). */
  publicApiIds?: Set<string>;
}

/**
 * Assign each non-alive node exactly one tier (§5):
 *   - `certain` — private, 0 refs, no taint            → auto-fix eligible
 *   - `likely`  — exported, 0 ref, not entry, no taint → suggest, human y/n
 *   - `maybe`   — taint nearby OR public API           → never auto-fixed
 * `test-only` symbols get the `test-only` verdict (report-only, locked decision #10).
 * Alive symbols are not findings.
 */
export function classify(input: ClassifyInput): ClassifiedFinding[] {
  const publicApiIds = input.publicApiIds ?? new Set<string>();
  const nodeById = new Map(input.nodes.map((n) => [n.id, n]));
  const findings: ClassifiedFinding[] = [];

  for (const result of input.reachability) {
    const node = nodeById.get(result.id);
    if (!node || result.reachability === "alive") continue;

    if (result.reachability === "test-only") {
      findings.push({
        node,
        verdict: "test-only",
        tier: "maybe",
        autoFixEligible: false,
        evidence: testOnlyEvidence(),
      });
      continue;
    }

    const isPublicApi = publicApiIds.has(node.id);
    const tier = deadTier(node, result, isPublicApi);
    findings.push({
      node,
      verdict: "dead",
      tier,
      autoFixEligible: tier === "certain",
      evidence: deadEvidence(node, result, isPublicApi),
    });
  }

  return findings;
}

const COVERAGE_UNAVAILABLE: EvidenceSignal = {
  ok: null,
  text: "coverage: not available",
};

function deadEvidence(
  node: SymbolNode,
  result: ReachabilityResult,
  isPublicApi: boolean,
): EvidenceSignal[] {
  return [
    { ok: true, text: "0 static references (TS compiler)" },
    COVERAGE_UNAVAILABLE,
    isPublicApi
      ? { ok: false, text: "in package.json exports — external consumers invisible" }
      : { ok: true, text: "not in package.json exports" },
    result.tainted
      ? { ok: false, text: "dynamic-import taint in scope — target unresolvable" }
      : { ok: true, text: "no dynamic-import taint in scope" },
  ];
}

function testOnlyEvidence(): EvidenceSignal[] {
  return [
    { ok: true, text: "0 production references" },
    { ok: false, text: "referenced only in test files" },
    COVERAGE_UNAVAILABLE,
  ];
}

function deadTier(
  node: SymbolNode,
  result: ReachabilityResult,
  isPublicApi: boolean,
): Tier {
  if (result.tainted || isPublicApi) return "maybe";
  if (node.exported) return "likely";
  return "certain";
}
