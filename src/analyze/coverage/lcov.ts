/** One function record from an lcov report: declaration line + execution count. */
export interface LcovFn {
  name: string;
  line: number;
  hits: number;
}

/** Per-file coverage: function records plus a line→hits map. */
export interface LcovFileCoverage {
  fns: LcovFn[];
  lines: Map<number, number>;
}

/** A parsed lcov report, keyed by the `SF:` source-file path as written. */
export interface LcovReport {
  files: Map<string, LcovFileCoverage>;
}

/**
 * Parse lcov text into a {@link LcovReport}. Walks records grouped by `SF:`,
 * reading `FN`/`FNDA` (function start line + hits) and `DA` (line + hits).
 * Unknown record types and blank lines are ignored. A function seen via `FN`
 * but never given an `FNDA` count defaults to 0 hits.
 */
export function parseLcov(raw: string): LcovReport {
  const files = new Map<string, LcovFileCoverage>();
  let current: LcovFileCoverage | undefined;
  // FN gives line-by-name; FNDA gives hits-by-name — joined on the function name.
  let fnLines = new Map<string, number>();
  let fnHits = new Map<string, number>();

  const flush = () => {
    if (!current) return;
    for (const [name, line] of fnLines) {
      current.fns.push({ name, line, hits: fnHits.get(name) ?? 0 });
    }
    current = undefined;
    fnLines = new Map();
    fnHits = new Map();
  };

  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    if (trimmed === "" ) continue;
    const sep = trimmed.indexOf(":");
    if (sep === -1) {
      if (trimmed === "end_of_record") flush();
      continue;
    }
    const tag = trimmed.slice(0, sep);
    const rest = trimmed.slice(sep + 1);

    switch (tag) {
      case "SF": {
        flush();
        current = { fns: [], lines: new Map() };
        files.set(rest, current);
        break;
      }
      case "FN": {
        // `FN:<line>,<name>` or newer `FN:<start>,<end>,<name>` — name is last field.
        const parts = rest.split(",");
        const name = parts[parts.length - 1];
        const startLine = Number.parseInt(parts[0] ?? "", 10);
        if (name && Number.isFinite(startLine)) fnLines.set(name, startLine);
        break;
      }
      case "FNDA": {
        // `FNDA:<hits>,<name>`
        const comma = rest.indexOf(",");
        if (comma === -1) break;
        const hits = Number.parseInt(rest.slice(0, comma), 10);
        const name = rest.slice(comma + 1);
        if (name && Number.isFinite(hits)) fnHits.set(name, hits);
        break;
      }
      case "DA": {
        // `DA:<line>,<hits>[,<checksum>]`
        const parts = rest.split(",");
        const lineNo = Number.parseInt(parts[0] ?? "", 10);
        const hits = Number.parseInt(parts[1] ?? "", 10);
        if (current && Number.isFinite(lineNo) && Number.isFinite(hits)) {
          current.lines.set(lineNo, hits);
        }
        break;
      }
      default:
        break;
    }
  }
  flush();
  return { files };
}
