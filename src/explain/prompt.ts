import type { ExplainResult } from "../engine/explain.js";

type Resolved = Extract<ExplainResult, { status: "resolved" }>;

/** A small source excerpt for one symbol on the trace, fed to the narrator. */
export interface NarrateSnippet {
  name: string;
  location: string;
  code: string;
}

/** A frozen system instruction + a per-symbol user message. Split so the system
 * text can be prompt-cached, mirroring the triage prompt. */
export interface NarratePrompt {
  system: string;
  user: string;
}

export const NARRATE_SYSTEM_PROMPT = [
  "A static reachability analyzer has ALREADY decided whether a symbol is alive,",
  "test-only, or dead, and reconstructed the witness chain (for live symbols) or",
  "the inbound referrers (for dead ones). Your job is to explain that verdict in",
  "plain English — translate the trace into a concise, concrete 'why'.",
  "",
  "Do NOT re-judge or re-derive reachability. The verdict you are given is the",
  "source of truth; never contradict it or hedge about whether it is correct.",
  "Ground your explanation in the witness chain / referrers and the source",
  "snippets provided. Two or three sentences. No preamble, no headings.",
].join("\n");

/**
 * Build the narrate request for one resolved explain result: the deterministic
 * verdict, its witness chain (alive/test-only) or inbound referrers (dead), and
 * the relevant source snippets. Pure — no SDK, no network.
 */
export function buildNarratePrompt(result: Resolved, snippets: NarrateSnippet[]): NarratePrompt {
  const { symbol, reachability, tainted, witness, inbound } = result;

  const traceLines =
    reachability === "dead"
      ? inbound.length
        ? inbound.map(
            (r) => `  ← ${r.name}  ${r.reachability ? `(${r.reachability})` : "(module-level reference)"}`,
          )
        : ["  (no inbound references)"]
      : (witness ?? []).map((s) => `  → ${s.name}  ${s.file ? `${s.file}:${s.line}` : "(entry)"}`);

  const traceHeader = reachability === "dead" ? "Referenced by:" : "Reachable via:";
  const snippetBlocks = snippets.map((s) => `// ${s.name}  ${s.location}\n${s.code}`).join("\n\n");

  const user = [
    `Symbol: ${symbol.name}  (${symbol.file}:${symbol.line})`,
    `Verdict: ${reachability}${tainted ? "  (tainted: dynamic dispatch nearby)" : ""}`,
    "",
    traceHeader,
    ...traceLines,
    "",
    "Source:",
    "```",
    snippetBlocks,
    "```",
  ].join("\n");

  return { system: NARRATE_SYSTEM_PROMPT, user };
}
