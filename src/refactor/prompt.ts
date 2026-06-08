import type { RefactorContext } from "./context.js";

/** A proposed god-function split. `diff` is a unified diff the human applies by
 * hand; `newFunctions` names the extracted helpers; `rationale` explains the
 * split. necro never applies this — it is a suggestion only. */
export interface RefactorProposal {
  summary: string;
  newFunctions: string[];
  diff: string;
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
    diff: { type: "string" },
    rationale: { type: "string" },
  },
  required: ["summary", "newFunctions", "diff", "rationale"],
  additionalProperties: false,
} as const;

export const SYSTEM_PROMPT = [
  "You are refactoring a god function — a function flagged for being too long or",
  "taking too many parameters. Propose a behavior-preserving split into smaller,",
  "well-named functions by grouping related statements (callee clusters) into",
  "extracted helpers.",
  "",
  "Hard rules:",
  "  - Preserve the public call surface: the original function's name, signature,",
  "    and exported-ness must stay the same. Callers must not need to change.",
  "  - Do not change observable behavior — only restructure.",
  "  - Introduce new private helpers in the same file; do not invent new imports",
  "    unless they already appear in the provided context.",
  "",
  "Return a unified diff a human can apply by hand. Your proposal is ADVISORY:",
  "necro never applies it automatically. Give a one or two sentence rationale.",
].join("\n");

/** Build the per-finding user message from the function body + preservation context. */
export function buildRefactorPrompt(ctx: RefactorContext): RefactorPrompt {
  const { finding, snippet, imports } = ctx;
  const user = [
    `God function: ${finding.name}  (${finding.message})`,
    `Location: ${finding.file}:${finding.line}`,
    "",
    "File imports (already in scope):",
    imports.length > 0 ? imports.map((i) => `  ${i}`).join("\n") : "  (none)",
    "",
    `Source (lines ${snippet.startLine}-${snippet.endLine}):`,
    "```",
    snippet.code,
    "```",
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
  const stringFields = ["summary", "diff", "rationale"] as const;
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
      diff: obj.diff as string,
      rationale: obj.rationale as string,
    },
  };
}

function truncate(s: string | undefined, max = 120): string {
  const str = s ?? String(s);
  return str.length > max ? `${str.slice(0, max)}…` : str;
}
