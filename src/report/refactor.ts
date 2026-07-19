import type {
  ExtractDuplicateOutcome,
  ExtractDuplicateRunResult,
  RefactorOutcome,
  RefactorRunResult,
} from "../refactor/index.js";
import type { VerifyBadge } from "../refactor/verify.js";

/** A one-line badge label for the terminal. */
function badgeLabel(badge: VerifyBadge | null): string {
  if (!badge) return "(not verified)";
  switch (badge.status) {
    case "green":
      return "✓ verified — typecheck + tests pass";
    case "red":
      return "✗ verification failed — review before applying";
  }
}

/**
 * Human-readable refactor report: for each god function, the suggested split,
 * its rationale, the verification badge, and the diff to apply by hand. necro
 * never applies these — the report is the whole output.
 */
export function renderRefactor(res: RefactorRunResult): string {
  if (res.consideredGodFunctions === 0)
    return "no god-function findings to refactor";
  if (res.outcomes.length === 0) return "nothing to refactor";

  const header = `suggested split(s) for ${res.outcomes.length} god function(s) — apply by hand`;
  const body = res.outcomes.map(renderOutcome).join("\n\n");
  return `${header}\n\n${body}`;
}

function renderOutcome(o: RefactorOutcome): string {
  const { finding } = o;
  const loc = `${finding.name}  ${finding.file}:${finding.line}`;
  if (!o.proposal) {
    return `  ${loc}\n    no proposal — ${o.failure ?? "unknown error"}`;
  }
  return [
    `  ${loc}`,
    `    ${badgeLabel(o.badge)}`,
    `    ${o.proposal.summary}`,
    `    new functions: ${o.proposal.newFunctions.join(", ")}`,
    `    ${o.proposal.rationale}`,
    "",
    // necro-computed diff to apply by hand; fall back to the raw replacement code.
    o.diff ?? o.proposal.replacement,
  ].join("\n");
}

// ── extract-duplicate ───────────────────────────────────────────────────────

/**
 * Human-readable extract-duplicate report: for each clone group, the suggested
 * shared-function extraction, its rationale, the verification badge, and the
 * per-file diffs to apply by hand. Suggest-only — necro never applies these.
 */
export function renderExtractDuplicate(res: ExtractDuplicateRunResult): string {
  if (res.consideredCloneGroups === 0)
    return "no duplication findings to refactor";
  if (res.outcomes.length === 0) return "nothing to refactor";

  const header = `suggested extraction(s) for ${res.outcomes.length} clone group(s) — apply by hand`;
  const body = res.outcomes.map(renderDuplicateOutcome).join("\n\n");
  return `${header}\n\n${body}`;
}

function renderDuplicateOutcome(o: ExtractDuplicateOutcome): string {
  const locs = o.finding.locations
    .map((l) => `${l.file}:${l.startLine}-${l.endLine}`)
    .join(", ");
  const head = `  ${o.finding.tokens} tokens duplicated: ${locs}`;
  if (!o.proposal) {
    return `${head}\n    no proposal — ${o.failure ?? "unknown error"}`;
  }
  const diffs = (o.files ?? []).map((f) => f.diff ?? f.newContent).join("\n");
  return [
    head,
    `    ${badgeLabel(o.badge)}`,
    `    ${o.proposal.summary}`,
    `    shared function in ${o.proposal.sharedFunctionFile}`,
    `    ${o.proposal.rationale}`,
    "",
    // necro-computed diffs (one per affected file) to apply by hand.
    diffs || (o.failure ?? "(no diff)"),
  ].join("\n");
}

/** Extract-duplicate proposals as JSON — independent of scan/fix JSON. */
export function toExtractDuplicateJson(res: ExtractDuplicateRunResult): string {
  const extractDuplicate = res.outcomes.map((o) => ({
    tokens: o.finding.tokens,
    locations: o.finding.locations,
    model: o.model,
    proposal: o.proposal,
    files: o.files,
    verification: o.badge,
    ...(o.failure ? { failure: o.failure } : {}),
  }));
  return JSON.stringify({ extractDuplicate }, null, 2);
}

/** Refactor proposals as JSON — independent of scan/fix JSON. */
export function toRefactorJson(res: RefactorRunResult): string {
  const refactor = res.outcomes.map((o) => ({
    name: o.finding.name,
    file: o.finding.file,
    line: o.finding.line,
    detector: o.finding.detector,
    model: o.model,
    proposal: o.proposal,
    diff: o.diff,
    verification: o.badge,
    ...(o.failure ? { failure: o.failure } : {}),
  }));
  return JSON.stringify({ refactor }, null, 2);
}
