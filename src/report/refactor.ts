import type { RefactorOutcome, RefactorRunResult } from "../refactor/index.js";
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
  if (res.consideredGodFunctions === 0) return "no god-function findings to refactor";
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
