import type { SymbolEdge, SymbolNode } from "../graph/types.js";

export type Reachability = "alive" | "test-only" | "dead";

export interface ReachabilityResult {
  id: string;
  reachability: Reachability;
  /** Node lives in a region with dynamic dispatch — downstream tiering treats it as ambiguous. */
  tainted: boolean;
}

export interface ReachabilityInput {
  nodes: SymbolNode[];
  edges: SymbolEdge[];
  /** Prod roots (symbol ids or module file paths), alive by definition. */
  prodEntries: Set<string>;
  /** Test roots (symbol ids or module file paths). */
  testEntries: Set<string>;
  /** Files containing dynamic dispatch; nodes in them are marked tainted. */
  taintedFiles?: Set<string>;
}

/**
 * Two-color mark-and-sweep (§6):
 *   1. prod entries → BFS over prod edges      → reachedByProd
 *   2. all entries  → BFS over prod+test edges → reachedByAny
 * A node in reachedByProd is `alive`; in reachedByAny but not prod is `test-only`;
 * in neither is a `dead` candidate.
 */
export function computeReachability(input: ReachabilityInput): ReachabilityResult[] {
  const nodeIds = new Set(input.nodes.map((n) => n.id));
  const taintedFiles = input.taintedFiles ?? new Set<string>();

  const reachedByProd = bfs(input.edges, input.prodEntries, nodeIds, (kind) => kind === "prod");
  const reachedByAny = bfs(
    input.edges,
    union(input.prodEntries, input.testEntries),
    nodeIds,
    () => true,
  );

  return input.nodes.map((node) => ({
    id: node.id,
    reachability: classify(node.id, reachedByProd, reachedByAny),
    tainted: taintedFiles.has(node.file),
  }));
}

function classify(
  id: string,
  reachedByProd: Set<string>,
  reachedByAny: Set<string>,
): Reachability {
  if (reachedByProd.has(id)) return "alive";
  if (reachedByAny.has(id)) return "test-only";
  return "dead";
}

/**
 * BFS over edges from the seed roots, following only edges whose kind passes
 * `allow`. Seeds that are themselves node ids count as reached.
 */
function bfs(
  edges: SymbolEdge[],
  seeds: Set<string>,
  nodeIds: Set<string>,
  allow: (kind: SymbolEdge["kind"]) => boolean,
): Set<string> {
  const adjacency = new Map<string, string[]>();
  for (const edge of edges) {
    if (!allow(edge.kind)) continue;
    const list = adjacency.get(edge.from);
    if (list) list.push(edge.to);
    else adjacency.set(edge.from, [edge.to]);
  }

  const reached = new Set<string>();
  const queue: string[] = [];
  for (const seed of seeds) {
    if (nodeIds.has(seed)) reached.add(seed);
    queue.push(seed);
  }

  while (queue.length > 0) {
    const current = queue.pop() as string;
    for (const next of adjacency.get(current) ?? []) {
      if (!reached.has(next)) {
        reached.add(next);
        queue.push(next);
      }
    }
  }
  return reached;
}

function union<T>(a: Set<T>, b: Set<T>): Set<T> {
  return new Set([...a, ...b]);
}

/**
 * Reconstruct the shortest witness chain (`entry → … → target`) by breadth-first
 * search with parent tracking, following only edges whose kind passes `allow`
 * (the same predicate `computeReachability` uses, so a trace matches its verdict).
 * Returns the chain of ids from the reaching seed to `target`, or `null` if no
 * allowed path exists. A seed that is itself the target yields `[target]`.
 */
export function tracePath(
  edges: SymbolEdge[],
  entries: Set<string>,
  target: string,
  allow: (kind: SymbolEdge["kind"]) => boolean,
): string[] | null {
  if (entries.has(target)) return [target];

  const adjacency = new Map<string, string[]>();
  for (const edge of edges) {
    if (!allow(edge.kind)) continue;
    const list = adjacency.get(edge.from);
    if (list) list.push(edge.to);
    else adjacency.set(edge.from, [edge.to]);
  }

  const parent = new Map<string, string>();
  const visited = new Set<string>(entries);
  const queue: string[] = [...entries];
  for (let head = 0; head < queue.length; head++) {
    const current = queue[head] as string;
    for (const next of adjacency.get(current) ?? []) {
      if (visited.has(next)) continue;
      visited.add(next);
      parent.set(next, current);
      if (next === target) {
        const path = [target];
        let cur: string | undefined = target;
        while ((cur = parent.get(cur)) !== undefined) path.unshift(cur);
        return path;
      }
      queue.push(next);
    }
  }
  return null;
}

const TAINT_PATTERNS: RegExp[] = [
  /import\s*\(\s*`[^`]*\$\{/, // dynamic import with template interpolation
  /import\s*\(\s*[A-Za-z_$]/, // dynamic import of a variable
  /\beval\s*\(/, // eval
  /\[\s*[A-Za-z_$][\w$]*\s*\]\s*\(/, // string/computed dispatch: obj[name]()
];

/** Detect files containing dynamic dispatch the static graph cannot resolve. */
export function findTaintedFiles(
  sources: Array<{ file: string; text: string }>,
): Set<string> {
  const tainted = new Set<string>();
  for (const { file, text } of sources) {
    if (TAINT_PATTERNS.some((re) => re.test(text))) tainted.add(file);
  }
  return tainted;
}
