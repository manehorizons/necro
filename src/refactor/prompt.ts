import type { DuplicationFinding } from "../syntactic/types.js";
import type { DuplicateRefactorContext, RefactorContext } from "./context.js";

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

// ── extract-duplicate ───────────────────────────────────────────────────────

/** One call-site replacement: lines `[startLine, endLine]` of `file` (a clone
 * location) become `replacement` — the call to the extracted shared function.
 * `replacement` is code, never a diff; necro splices it in. */
export interface DuplicateEdit {
  file: string;
  startLine: number;
  endLine: number;
  replacement: string;
}

/** A proposed extract-duplicate refactor: one shared function plus a call-site
 * replacement at every clone location. necro inserts `sharedFunction` into
 * `sharedFunctionFile`, wires the import into any other file, applies each edit,
 * and computes the diff — the model supplies only code. Advisory: never applied. */
export interface DuplicateProposal {
  summary: string;
  /** Source of the new shared function (an `export function NAME(…)`). */
  sharedFunction: string;
  /** Which clone-group file the shared function is inserted into. */
  sharedFunctionFile: string;
  /** One replacement per clone location (the call to `sharedFunction`). */
  edits: DuplicateEdit[];
  rationale: string;
}

/** Parsing a duplicate response either yields a proposal or a recorded failure. */
export type DuplicateProposalResult =
  | { ok: true; proposal: DuplicateProposal }
  | { ok: false; reason: string };

/** JSON Schema for `output_config.format` — constrains the model to a valid
 * extract-duplicate proposal. */
export const DUP_PROPOSAL_SCHEMA = {
  type: "object",
  properties: {
    summary: { type: "string" },
    sharedFunction: { type: "string" },
    sharedFunctionFile: { type: "string" },
    edits: {
      type: "array",
      items: {
        type: "object",
        properties: {
          file: { type: "string" },
          startLine: { type: "number" },
          endLine: { type: "number" },
          replacement: { type: "string" },
        },
        required: ["file", "startLine", "endLine", "replacement"],
        additionalProperties: false,
      },
    },
    rationale: { type: "string" },
  },
  required: ["summary", "sharedFunction", "sharedFunctionFile", "edits", "rationale"],
  additionalProperties: false,
} as const;

export const DUP_SYSTEM_PROMPT = [
  "You are removing duplication — a block of near-identical code that appears at",
  "two or more locations. Extract the shared logic into ONE new function and",
  "replace each duplicated site with a call to it.",
  "",
  "Hard rules:",
  "  - Introduce exactly one shared function. Make it an `export function NAME(…)`",
  "    so it can be imported across files; necro wires up the import.",
  "  - Replace EACH provided location with a call to the shared function. Parameterize",
  "    over whatever differs between the sites; do not change observable behavior.",
  "  - Preserve each site's surrounding call surface — the enclosing function's name,",
  "    signature, and returned value must be unchanged.",
  "  - Do not invent new imports beyond the shared-function call; reuse what the",
  "    provided context already imports.",
  "",
  "Put the shared function in one of the provided files via `sharedFunctionFile`.",
  "For each location, return an edit with the EXACT `file`, `startLine`, and",
  "`endLine` given to you, and `replacement` = the call code for that range — plain",
  "code only, no line-number prefixes, no diff, no markdown fences. Return exactly",
  "one edit per location. necro inserts the shared function, adds any cross-file",
  "import, splices each replacement, and computes the diff. Your proposal is",
  "ADVISORY: necro never applies it automatically. Give a one or two sentence rationale.",
].join("\n");

/** Build the per-clone-group user message: every location's slice + its file's
 * imports, with the exact ranges the model must echo back in its edits. */
export function buildDuplicatePrompt(ctx: DuplicateRefactorContext): RefactorPrompt {
  const { finding, locations } = ctx;
  const sites = locations
    .map((l, i) => {
      const imports = l.imports.length > 0 ? l.imports.map((s) => `  ${s}`).join("\n") : "  (none)";
      return [
        `Location ${i + 1}: ${l.location.file}  lines ${l.location.startLine}-${l.location.endLine}`,
        "File imports (already in scope):",
        imports,
        "Duplicated source (with line numbers):",
        "```",
        l.snippet.code,
        "```",
      ].join("\n");
    })
    .join("\n\n");

  const user = [
    `Clone group: ${finding.tokens} duplicated tokens across ${locations.length} locations.`,
    "",
    sites,
    "",
    "Extract the shared logic into one exported function and replace each location",
    "with a call. Return exactly one edit per location, echoing each location's exact",
    "file/startLine/endLine, with `replacement` = the call code for that range.",
  ].join("\n");

  return { system: DUP_SYSTEM_PROMPT, user };
}

/**
 * Validate a model response into a {@link DuplicateProposal} against the
 * `finding` it answers. Beyond shape checks, this enforces that the proposal
 * deduplicates the actual clone group: `sharedFunctionFile` is one of the
 * group's files, and there is exactly one edit per location echoing that
 * location's file + line range. Any mismatch degrades to `{ ok: false, reason }`
 * — never throws.
 */
export function parseDuplicateProposal(raw: unknown, finding: DuplicationFinding): DuplicateProposalResult {
  if (!raw || typeof raw !== "object") {
    return { ok: false, reason: `unparseable model response: ${truncate(JSON.stringify(raw))}` };
  }
  const obj = raw as Record<string, unknown>;
  for (const f of ["summary", "sharedFunction", "sharedFunctionFile", "rationale"] as const) {
    if (typeof obj[f] !== "string") {
      return { ok: false, reason: `invalid proposal: "${f}" is not a string` };
    }
  }
  if (!Array.isArray(obj.edits)) {
    return { ok: false, reason: 'invalid proposal: "edits" is not an array' };
  }
  const edits: DuplicateEdit[] = [];
  for (const e of obj.edits) {
    if (!e || typeof e !== "object") return { ok: false, reason: "invalid proposal: edit is not an object" };
    const ed = e as Record<string, unknown>;
    if (
      typeof ed.file !== "string" ||
      typeof ed.startLine !== "number" ||
      typeof ed.endLine !== "number" ||
      typeof ed.replacement !== "string"
    ) {
      return { ok: false, reason: "invalid proposal: edit has a malformed field" };
    }
    edits.push({ file: ed.file, startLine: ed.startLine, endLine: ed.endLine, replacement: ed.replacement });
  }

  const files = new Set(finding.locations.map((l) => l.file));
  if (!files.has(obj.sharedFunctionFile as string)) {
    return { ok: false, reason: `invalid proposal: sharedFunctionFile "${obj.sharedFunctionFile}" is not a clone-group file` };
  }
  if (edits.length !== finding.locations.length) {
    return {
      ok: false,
      reason: `invalid proposal: ${edits.length} edits for ${finding.locations.length} clone locations`,
    };
  }
  // Every location must be covered by exactly one edit echoing its exact range.
  const remaining = [...edits];
  for (const loc of finding.locations) {
    const idx = remaining.findIndex(
      (e) => e.file === loc.file && e.startLine === loc.startLine && e.endLine === loc.endLine,
    );
    if (idx === -1) {
      return {
        ok: false,
        reason: `invalid proposal: no edit matches location ${loc.file}:${loc.startLine}-${loc.endLine}`,
      };
    }
    remaining.splice(idx, 1);
  }

  return {
    ok: true,
    proposal: {
      summary: obj.summary as string,
      sharedFunction: obj.sharedFunction as string,
      sharedFunctionFile: obj.sharedFunctionFile as string,
      edits,
      rationale: obj.rationale as string,
    },
  };
}
