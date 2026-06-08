/** Whether a reference edge originates in production or test code. */
export type EdgeKind = "prod" | "test";

/** A declared, top-level symbol (function, class, variable, type, etc.). */
export interface SymbolNode {
  /** Stable id: `${file}:${line}:${name}`. */
  id: string;
  name: string;
  /** Absolute source file path. */
  file: string;
  /** 1-based declaration line. */
  line: number;
  /** Whether the declaration is exported from its module. */
  exported: boolean;
}

/**
 * A reference edge: `from` (a symbol id or a module file path) uses the symbol
 * `to`. Reachability seeds entry files/symbols and follows edges forward.
 */
export interface SymbolEdge {
  from: string;
  to: string;
  kind: EdgeKind;
}

export interface SymbolGraph {
  nodes: SymbolNode[];
  edges: SymbolEdge[];
}
