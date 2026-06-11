import { basename } from "node:path";
import { type Reachability, tracePath } from "../analyze/reachability.js";
import type { NecroConfig } from "../config.js";
import type { SymbolNode } from "../graph/types.js";
import { buildReachabilityModel } from "./model.js";

/** A symbol identified for explanation (the resolved query or a candidate). */
export interface ExplainSymbol {
  id: string;
  name: string;
  file: string;
  line: number;
}

/**
 * One node on a witness chain. `file`/`line` are null for an entry/module seed
 * (a file-path root that has no declared symbol of its own).
 */
export interface TraceNode {
  id: string;
  name: string;
  file: string | null;
  line: number | null;
}

/** An inbound reference into a dead symbol, tagged with the referrer's verdict. */
export interface InboundRef extends TraceNode {
  /** The referrer's own reachability, or null for a module-level (file) reference. */
  reachability: Reachability | null;
}

export type ExplainResult =
  | { query: string; status: "not-found" }
  | { query: string; status: "ambiguous"; candidates: ExplainSymbol[] }
  | {
      query: string;
      status: "resolved";
      symbol: ExplainSymbol;
      reachability: Reachability;
      tainted: boolean;
      /** Entry → … → symbol chain for alive/test-only; null for dead. */
      witness: TraceNode[] | null;
      /** Referrers for a dead symbol (annotated by verdict); empty otherwise. */
      inbound: InboundRef[];
    };

/**
 * Explain why a symbol is alive, test-only, or dead by reconstructing its
 * reachability witness chain (or, for dead symbols, listing its inbound
 * references annotated with their own verdicts). Deterministic; no LLM.
 */
export async function explain(
  targetPath: string,
  config: NecroConfig,
  query: string,
): Promise<ExplainResult> {
  const model = await buildReachabilityModel(targetPath, config);
  const matches = resolveQuery(model.graph.nodes, query);

  if (matches.length === 0) return { query, status: "not-found" };
  if (matches.length > 1)
    return { query, status: "ambiguous", candidates: matches.map(toSymbol) };

  const node = matches[0] as SymbolNode;
  const verdict = new Map(model.reachability.map((r) => [r.id, r] as const));
  const result = verdict.get(node.id);
  const reachability: Reachability = result?.reachability ?? "dead";
  const tainted = result?.tainted ?? false;

  const nodeById = new Map(model.graph.nodes.map((n) => [n.id, n] as const));
  const toTrace = (id: string): TraceNode => {
    const n = nodeById.get(id);
    return n
      ? { id, name: n.name, file: n.file, line: n.line }
      : { id, name: basename(id), file: null, line: null };
  };

  let witness: TraceNode[] | null = null;
  let inbound: InboundRef[] = [];

  if (reachability === "alive") {
    const chain = tracePath(
      model.edges,
      model.prodEntries,
      node.id,
      (kind) => kind === "prod",
    );
    witness = chain ? chain.map(toTrace) : null;
  } else if (reachability === "test-only") {
    const entries = new Set([...model.prodEntries, ...model.testEntries]);
    const chain = tracePath(model.edges, entries, node.id, () => true);
    witness = chain ? chain.map(toTrace) : null;
  } else {
    inbound = inboundRefs(model.edges, node.id, nodeById, verdict, toTrace);
  }

  return {
    query,
    status: "resolved",
    symbol: toSymbol(node),
    reachability,
    tainted,
    witness,
    inbound,
  };
}

/**
 * Resolve a query to candidate nodes. Accepts a full id (`file:line:name`), a
 * file-qualified name (`path:name`, matched by file suffix), or a bare `name`.
 */
function resolveQuery(nodes: SymbolNode[], query: string): SymbolNode[] {
  const exact = nodes.filter((n) => n.id === query);
  if (exact.length > 0) return exact;

  const colon = query.lastIndexOf(":");
  if (colon >= 0) {
    const fileHint = query.slice(0, colon);
    const name = query.slice(colon + 1);
    return nodes.filter((n) => n.name === name && fileMatches(n.file, fileHint));
  }
  return nodes.filter((n) => n.name === query);
}

function fileMatches(file: string, hint: string): boolean {
  return file === hint || file.endsWith(`/${hint}`) || file.endsWith(hint);
}

/** Inbound references into `id`, deduped by referrer, annotated with verdicts. */
function inboundRefs(
  edges: { from: string; to: string }[],
  id: string,
  nodeById: Map<string, SymbolNode>,
  verdict: Map<string, { reachability: Reachability }>,
  toTrace: (id: string) => TraceNode,
): InboundRef[] {
  const seen = new Set<string>();
  const refs: InboundRef[] = [];
  for (const edge of edges) {
    if (edge.to !== id || edge.from === id) continue;
    if (seen.has(edge.from)) continue;
    seen.add(edge.from);
    const base = toTrace(edge.from);
    // A symbol referrer carries its own verdict; a module-level (file) referrer
    // has no symbol verdict — annotate it null so callers render it distinctly.
    const reachability = nodeById.has(edge.from)
      ? (verdict.get(edge.from)?.reachability ?? "dead")
      : null;
    refs.push({ ...base, reachability });
  }
  return refs;
}

function toSymbol(node: SymbolNode): ExplainSymbol {
  return { id: node.id, name: node.name, file: node.file, line: node.line };
}
