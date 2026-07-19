import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { EvidenceSignal } from "../analyze/classify.js";
import { findingsFromScanJson } from "./load.js";
import { extractSnippet } from "./snippet.js";

/** Where a captured case came from — enough to re-derive and audit it. */
export interface CaseProvenance {
  /** Source repository identifier (e.g. `owner/name`). */
  repo: string;
  /** Pinned commit SHA the scan was run against. */
  sha: string;
  /** File path within the source repo. */
  file: string;
  /** 1-based declaration line. */
  line: number;
  /** Symbol name. */
  symbol: string;
}

/** A captured eval case awaiting a human ground-truth label. `truth` and
 * `rationale` are intentionally empty — only a human fills them. Everything
 * else (snippet + evidence) is the verbatim output of necro's own scan. */
export interface EvalCaseSkeleton {
  name: string;
  /** null until a human applies ground truth. */
  truth: null;
  /** The production snippet (same format `necro triage` sends — line-prefixed). */
  code: string;
  /** The verbatim `EvidenceSignal[]` necro emitted — never re-authored. */
  evidence: EvidenceSignal[];
  provenance: CaseProvenance;
  /** Empty until a human records why the label was chosen. */
  rationale: "";
}

export interface CaptureOptions {
  /** Source repository identifier recorded in provenance. */
  repo: string;
  /** Pinned commit SHA recorded in provenance. */
  sha: string;
  /** Local checkout root the scan's relative file paths resolve against. */
  sourceRoot: string;
  /** Snippet radius — defaults to production triage's (`snippetRadius: 20`). */
  radius?: number;
}

/**
 * Turn a `necro scan --json` document into eval-case skeletons — one per
 * `maybe` (likely-dead) finding, the tier `necro triage` resolves. Each skeleton
 * carries the finding's **verbatim** evidence and a production-format snippet
 * (re-read via the same snippet machinery `necro triage` uses), plus provenance.
 * Deterministic: no LLM, no network. Ground truth is left empty for a human.
 */
export async function captureEvalSkeletons(
  scanJson: string,
  opts: CaptureOptions,
): Promise<EvalCaseSkeleton[]> {
  const radius = opts.radius ?? 20;
  const maybes = findingsFromScanJson(scanJson).filter(
    (f) => f.tier === "maybe",
  );

  const skeletons: EvalCaseSkeleton[] = [];
  for (const f of maybes) {
    const text = await readFile(join(opts.sourceRoot, f.node.file), "utf8");
    const { code } = extractSnippet(text, f.node.line, radius);
    skeletons.push({
      name: f.node.name,
      truth: null,
      code,
      evidence: f.evidence,
      provenance: {
        repo: opts.repo,
        sha: opts.sha,
        file: f.node.file,
        line: f.node.line,
        symbol: f.node.name,
      },
      rationale: "",
    });
  }
  return skeletons;
}
