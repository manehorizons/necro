import type { SymbolNode } from "../graph/types.js";
import { isPythonFile } from "../graph/python/language.js";
import type { CoverageStatus } from "./coverage/lookup.js";
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
  /**
   * Optional per-symbol coverage resolver. When absent, every finding renders
   * `coverage: not available` and tiers are unaffected — identical to phase 01.
   */
  coverage?: (node: SymbolNode) => CoverageStatus;
  /**
   * Zero production entry points resolved on a non-empty graph (§2.1) —
   * reachability is unseeded, so every `dead` finding is demoted to `maybe`,
   * never auto-fix eligible, with a truthful evidence signal prepended.
   * `test-only` findings are unaffected (they were reached via test entries,
   * which don't depend on prod-entry resolution).
   */
  entryCollapse?: boolean;
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
  const coverageOf = (node: SymbolNode): CoverageStatus =>
    input.coverage ? input.coverage(node) : { kind: "unavailable" };
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
        evidence: testOnlyEvidence(coverageOf(node)),
      });
      continue;
    }

    const cov = coverageOf(node);
    const isPublicApi = publicApiIds.has(node.id);
    const collapse = input.entryCollapse ?? false;
    // Python dead-code findings are hard-capped at `likely` (AC-6, phase 45):
    // the resolver's recall/precision hasn't been corpus-validated yet
    // (Phase D), so a Python symbol never earns `certain`/auto-fix eligible.
    const rawTier = collapse ? "maybe" : deadTier(node, result, isPublicApi, cov);
    const tier = rawTier === "certain" && isPythonFile(node.file) ? "likely" : rawTier;
    const evidence = deadEvidence(node, result, isPublicApi, cov);
    findings.push({
      node,
      verdict: "dead",
      tier,
      autoFixEligible: collapse ? false : tier === "certain",
      evidence: collapse ? [ENTRY_COLLAPSE_SIGNAL, ...evidence] : evidence,
    });
  }

  return findings;
}

const COVERAGE_UNAVAILABLE: EvidenceSignal = {
  ok: null,
  text: "coverage: not available",
};

const ENTRY_COLLAPSE_SIGNAL: EvidenceSignal = {
  ok: false,
  text: "0 production entry points resolved — reachability unseeded",
};

/**
 * The coverage signal for a dead candidate. A runtime hit on a 0-static-ref
 * symbol is a contradiction (✗) — it was reached dynamically; a coverage-miss
 * supports the dead verdict (✓); no record degrades to "not available".
 */
function deadCoverageSignal(cov: CoverageStatus): EvidenceSignal {
  switch (cov.kind) {
    case "hit":
      return {
        ok: false,
        text: `executed at runtime (${cov.hits} hits) despite 0 static refs — reached dynamically`,
      };
    case "miss":
      return { ok: true, text: "0 coverage hits (lcov)" };
    case "unavailable":
      return COVERAGE_UNAVAILABLE;
  }
}

/**
 * The coverage signal for a `test-only` finding. Hits here are expected (the
 * tests exercise it), so they are neutral information, not a dynamic-reach flag.
 */
function testOnlyCoverageSignal(cov: CoverageStatus): EvidenceSignal {
  switch (cov.kind) {
    case "hit":
      return { ok: null, text: `${cov.hits} coverage hits (lcov)` };
    case "miss":
      return { ok: true, text: "0 coverage hits (lcov)" };
    case "unavailable":
      return COVERAGE_UNAVAILABLE;
  }
}

function deadEvidence(
  node: SymbolNode,
  result: ReachabilityResult,
  isPublicApi: boolean,
  cov: CoverageStatus,
): EvidenceSignal[] {
  return [
    { ok: true, text: "0 static references (TS compiler)" },
    deadCoverageSignal(cov),
    isPublicApi
      ? { ok: false, text: "in package.json exports — external consumers invisible" }
      : { ok: true, text: "not in package.json exports" },
    result.tainted
      ? { ok: false, text: "dynamic-import taint in scope — target unresolvable" }
      : { ok: true, text: "no dynamic-import taint in scope" },
  ];
}

function testOnlyEvidence(cov: CoverageStatus): EvidenceSignal[] {
  return [
    { ok: true, text: "0 production references" },
    { ok: false, text: "referenced only in test files" },
    testOnlyCoverageSignal(cov),
  ];
}

function deadTier(
  node: SymbolNode,
  result: ReachabilityResult,
  isPublicApi: boolean,
  cov: CoverageStatus,
): Tier {
  // Runtime execution despite 0 static refs = dynamic reach → never `certain`.
  if (cov.kind === "hit") return "maybe";
  if (result.tainted || isPublicApi) return "maybe";
  if (node.exported) return "likely";
  return "certain";
}
