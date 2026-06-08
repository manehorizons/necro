import type { ClassifiedFinding } from "../analyze/classify.js";
import type { Snippet } from "./snippet.js";

/** The advisory verdict the LLM returns for one `maybe` finding. */
export type TriageVerdict = "likely-dead" | "likely-alive" | "unsure";

export const VERDICTS: readonly TriageVerdict[] = ["likely-dead", "likely-alive", "unsure"];

/** A parsed triage result. On a malformed response, `verdict` is `unsure` and
 * `reasoning` records the parse failure (never thrown). */
export interface TriageResult {
  verdict: TriageVerdict;
  reasoning: string;
}

/** The request payload for one finding — a frozen system instruction and a
 * per-finding user message. Kept split so the system text can be prompt-cached. */
export interface TriagePrompt {
  system: string;
  user: string;
}

/** JSON Schema for `output_config.format` — constrains the model to a valid verdict. */
export const VERDICT_SCHEMA = {
  type: "object",
  properties: {
    verdict: { type: "string", enum: ["likely-dead", "likely-alive", "unsure"] },
    reasoning: { type: "string" },
  },
  required: ["verdict", "reasoning"],
  additionalProperties: false,
} as const;

export const SYSTEM_PROMPT = [
  "You are triaging a dead-code candidate that a static analyzer quarantined as",
  '"maybe" — it could not safely decide whether the symbol is dead. Reasons a',
  "symbol lands here: it is part of a package's public API, a dynamic import is",
  "in scope (so a reference may be unresolvable statically), or runtime coverage",
  "shows it executing despite zero static references.",
  "",
  "Given the symbol, the analyzer's evidence chain, and a source snippet, judge",
  "whether the symbol is actually unused:",
  "  - likely-dead   — you are confident nothing reaches it (e.g. the only",
  "                    reference is a test mock; the dynamic import resolves elsewhere).",
  "  - likely-alive  — there is a plausible live use (public API consumed externally,",
  "                    reached via the dynamic import, framework entry point).",
  "  - unsure        — the evidence is genuinely ambiguous.",
  "",
  "Your verdict is ADVISORY: a human reviews it and no code is deleted on your",
  "word. Prefer 'unsure' over a confident wrong call. Give one or two sentences of",
  "reasoning grounded in the snippet and evidence.",
].join("\n");

/** Build the per-finding user message from its evidence chain and source snippet. */
export function buildPrompt(finding: ClassifiedFinding, snippet: Snippet): TriagePrompt {
  const { node, verdict, evidence } = finding;
  const evidenceLines = evidence
    .map((e) => `  ${e.ok === true ? "[+]" : e.ok === false ? "[-]" : "[?]"} ${e.text}`)
    .join("\n");

  const user = [
    `Symbol: ${node.name}  (${verdict})`,
    `Location: ${node.file}:${node.line}`,
    "",
    "Analyzer evidence:",
    evidenceLines,
    "",
    `Source (lines ${snippet.startLine}-${snippet.endLine}):`,
    "```",
    snippet.code,
    "```",
  ].join("\n");

  return { system: SYSTEM_PROMPT, user };
}

/**
 * Validate a model response into a {@link TriageResult}. Anything that isn't an
 * object with a valid `verdict` enum and string `reasoning` degrades to
 * `unsure` with the failure recorded — never throws.
 */
export function parseVerdict(raw: unknown): TriageResult {
  if (raw && typeof raw === "object") {
    const obj = raw as Record<string, unknown>;
    if (
      typeof obj.verdict === "string" &&
      (VERDICTS as readonly string[]).includes(obj.verdict) &&
      typeof obj.reasoning === "string"
    ) {
      return { verdict: obj.verdict as TriageVerdict, reasoning: obj.reasoning };
    }
  }
  return {
    verdict: "unsure",
    reasoning: `unparseable model response: ${truncate(JSON.stringify(raw))}`,
  };
}

function truncate(s: string | undefined, max = 120): string {
  const str = s ?? String(s); // JSON.stringify(undefined) is undefined
  return str.length > max ? `${str.slice(0, max)}…` : str;
}
