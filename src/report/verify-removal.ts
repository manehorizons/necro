import type { RemovalVerdict } from "../engine/verify-removal.js";

/**
 * Render per-symbol removal verdicts as a human-readable report: a green/red/
 * unresolved line per symbol, with the failing check output indented under a
 * red verdict.
 */
export function renderVerifyRemoval(results: RemovalVerdict[]): string {
  const lines: string[] = [];
  for (const r of results) {
    if (r.status === "green") {
      lines.push(`✓ ${r.symbol} — safe to remove (build stays green)`);
    } else if (r.status === "red") {
      lines.push(`✗ ${r.symbol} — removal breaks the build`);
      if (r.output) lines.push(...r.output.split("\n").map((l) => `    ${l}`));
    } else {
      lines.push(`? ${r.symbol} — unresolved${r.output ? ` (${r.output})` : ""}`);
    }
  }
  return lines.join("\n");
}
