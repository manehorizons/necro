import type { FunctionUnit } from "./ir.js";

/** Raw, threshold-independent metrics for one function. */
export interface Metrics {
  /** Max block-nesting level reached (a structure at `depth` sits at level `depth + 1`). */
  nesting: number;
  /** Cyclomatic complexity: 1 + one per branch / loop / case / catch / ternary / boolean-op. */
  cyclomatic: number;
  /** Cognitive complexity (Sonar): nesting structures cost `1 + depth`; boolean-ops a flat 1. */
  cognitive: number;
  loc: number;
  params: number;
}

/** Compute all raw metrics from the IR — the single source of truth shared by
 * the detectors and the CRAP/hotspot ranking. */
export function metrics(unit: FunctionUnit): Metrics {
  let nesting = 0;
  let cognitive = 0;
  for (const c of unit.controlNodes) {
    if (c.nests) {
      nesting = Math.max(nesting, c.depth + 1);
      cognitive += 1 + c.depth;
    } else {
      cognitive += 1;
    }
  }
  return {
    nesting,
    cyclomatic: 1 + unit.controlNodes.length,
    cognitive,
    loc: unit.loc,
    params: unit.params,
  };
}
