import { relative } from "node:path";
import type { ExplainResult, TraceNode } from "../engine/explain.js";

/**
 * Render an {@link ExplainResult} as a human-readable reachability trace.
 * `srcRoot` (when given) relativizes absolute file paths for readability.
 */
export function renderExplain(result: ExplainResult, srcRoot?: string): string {
  const loc = (file: string | null, line: number | null): string => {
    if (!file) return "(entry)";
    const shown = srcRoot ? relative(srcRoot, file) : file;
    return line !== null ? `${shown}:${line}` : shown;
  };

  if (result.status === "not-found") {
    return `Symbol not found: ${result.query}`;
  }

  if (result.status === "ambiguous") {
    const lines = result.candidates.map((c) => `  ${c.name}  ${loc(c.file, c.line)}`);
    return [
      `Ambiguous symbol: "${result.query}" matches ${result.candidates.length} candidates:`,
      ...lines,
      `Disambiguate with file:name (e.g. "${shortHint(result.candidates[0]?.file)}:${result.query}").`,
    ].join("\n");
  }

  const { symbol, reachability, tainted, witness, inbound, narrative } = result;
  const taint = tainted ? "  (tainted: dynamic dispatch nearby)" : "";
  const header = `${symbol.name} is ${reachability}${taint}`;
  const why = narrative ? ["", "Why:", narrative] : [];

  if (reachability === "dead") {
    const body = inbound.length
      ? [
          "Referenced by:",
          ...inbound.map(
            (r) =>
              `  ${r.name}  ${
                r.reachability ? `(${r.reachability})` : "(module-level reference)"
              }`,
          ),
        ]
      : ["Referenced by: nothing — no inbound references."];
    return [
      `${header} — unreachable from all production and test entries.`,
      ...body,
      ...why,
    ].join("\n");
  }

  const chain = witness ?? [];
  const steps = chain.map((s: TraceNode) => `  → ${s.name}  ${loc(s.file, s.line)}`);
  return [`${header}`, "Reachable via:", ...steps, ...why].join("\n");
}

function shortHint(file: string | undefined): string {
  if (!file) return "path";
  const parts = file.split("/");
  return parts[parts.length - 1] ?? file;
}
