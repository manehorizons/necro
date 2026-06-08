import type { RefactorContext } from "./context.js";

/** A proposed god-function split. `replacement` is the rewritten code for the
 * function's line range — necro splices it in and computes the diff itself, so a
 * model that writes good code but imprecise diffs can't break application.
 * `newFunctions` names the extracted helpers; `rationale` explains the split.
 * necro never applies this — it is a suggestion only. */
export interface RefactorProposal {
  summary: string;
  newFunctions: string[];
  replacement: string;
  rationale: string;
}

/** Parsing a model response either yields a proposal or a recorded failure —
 * a malformed response never throws. */
export type ProposalResult =
  | { ok: true; proposal: RefactorProposal }
  | { ok: false; reason: string };

/** The request payload — frozen system instruction + per-finding user message,
 * split so the system text can be prompt-cached. */
export interface RefactorPrompt {
  system: string;
  user: string;
}

/** JSON Schema for `output_config.format` — constrains the model to a valid proposal. */
export const PROPOSAL_SCHEMA = {
  type: "object",
  properties: {
    summary: { type: "string" },
    newFunctions: { type: "array", items: { type: "string" } },
    replacement: { type: "string" },
    rationale: { type: "string" },
  },
  required: ["summary", "newFunctions", "replacement", "rationale"],
  additionalProperties: false,
} as const;

export const SYSTEM_PROMPT = [
  "You are refactoring a god function — a function flagged for being too long or",
  "taking too many parameters. Rewrite it as a behavior-preserving split into",
  "smaller, well-named functions by grouping related statements (callee clusters)",
  "into extracted helpers.",
  "",
  "Hard rules:",
  "  - Preserve the public call surface: the original function's name, signature,",
  "    and exported-ness must stay the same. Callers must not need to change.",
  "  - Do not change observable behavior — only restructure.",
  "  - Introduce new private helpers in the same file; do not invent new imports",
  "    unless they already appear in the provided context.",
  "  - Keep EVERY resulting function small — the original and each extracted",
  "    helper should be well under the size that flagged it. If a cluster is still",
  "    large, split it further rather than leaving one big helper.",
  "",
  "Return the full rewritten source for the requested line range as `replacement`",
  "— plain code only, no line-number prefixes, no diff, no markdown fences. necro",
  "splices it in and computes the diff itself. Your proposal is ADVISORY: necro",
  "never applies it automatically. Give a one or two sentence rationale.",
].join("\n");

/** Build the per-finding user message from the function body + preservation
 * context. The model is asked to rewrite exactly the function's line range; necro
 * knows that range (declaration line → matched block end) and splices the result. */
export function buildRefactorPrompt(ctx: RefactorContext): RefactorPrompt {
  const { finding, snippet, imports } = ctx;
  const user = [
    `God function: ${finding.name}  (${finding.message})`,
    `Location: ${finding.file}:${finding.line}`,
    "",
    "File imports (already in scope):",
    imports.length > 0 ? imports.map((i) => `  ${i}`).join("\n") : "  (none)",
    "",
    `Source (lines ${snippet.startLine}-${snippet.endLine}, with line numbers):`,
    "```",
    snippet.code,
    "```",
    "",
    `Rewrite lines ${finding.line}-${snippet.endLine} (the function), returning only`,
    "the replacement code for that range — no line numbers, no surrounding context.",
  ].join("\n");

  return { system: SYSTEM_PROMPT, user };
}

/**
 * Validate a model response into a {@link RefactorProposal}. Anything that isn't
 * an object with a string `summary`/`diff`/`rationale` and a string[]
 * `newFunctions` degrades to `{ ok: false, reason }` — never throws.
 */
export function parseProposal(raw: unknown): ProposalResult {
  if (!raw || typeof raw !== "object") {
    return { ok: false, reason: `unparseable model response: ${truncate(JSON.stringify(raw))}` };
  }
  const obj = raw as Record<string, unknown>;
  const stringFields = ["summary", "replacement", "rationale"] as const;
  for (const f of stringFields) {
    if (typeof obj[f] !== "string") {
      return { ok: false, reason: `invalid proposal: "${f}" is not a string` };
    }
  }
  if (!Array.isArray(obj.newFunctions) || !obj.newFunctions.every((n) => typeof n === "string")) {
    return { ok: false, reason: 'invalid proposal: "newFunctions" is not a string array' };
  }
  return {
    ok: true,
    proposal: {
      summary: obj.summary as string,
      newFunctions: obj.newFunctions as string[],
      replacement: obj.replacement as string,
      rationale: obj.rationale as string,
    },
  };
}

function truncate(s: string | undefined, max = 120): string {
  const str = s ?? String(s);
  return str.length > max ? `${str.slice(0, max)}…` : str;
}
