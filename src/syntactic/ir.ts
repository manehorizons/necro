import type { Node as TsNode } from "web-tree-sitter";
import { getParser } from "./parse.js";

/**
 * Language-agnostic control-flow category. Detectors read these — never
 * tree-sitter / TS node names — so the same detector serves every language
 * (core invariant §3). `boolean` covers short-circuit operators, which add a
 * branch but do not nest.
 */
export type ControlCategory = "branch" | "loop" | "case" | "catch" | "ternary" | "boolean";

export interface ControlNode {
  category: ControlCategory;
  /** Number of enclosing nesting structures (0 = top level of the function body). */
  depth: number;
  /** Whether this structure increases nesting for things inside it. */
  nests: boolean;
}

/** One function lowered to the syntactic IR. */
export interface FunctionUnit {
  name: string;
  file: string;
  /** 1-based line of the function declaration. */
  line: number;
  /** Lines of code spanned by the function. */
  loc: number;
  /** Declared parameter count. */
  params: number;
  controlNodes: ControlNode[];
}

const FUNCTION_KINDS = new Set([
  "function_declaration",
  "function_expression",
  "arrow_function",
  "method_definition",
  "generator_function_declaration",
  "generator_function",
  // Python
  "function_definition",
  "lambda",
]);

/** Map a tree-sitter node type to a control category (the only language-aware step). */
function categoryOf(node: TsNode): { category: ControlCategory; nests: boolean } | null {
  switch (node.type) {
    case "if_statement":
    case "elif_clause": // Python: a sibling clause of `if`, not a nested if — its own branch
    case "if_clause": // Python: comprehension `if` filter
      return { category: "branch", nests: true };
    case "for_statement":
    case "for_in_statement":
    case "while_statement":
    case "do_statement":
    case "for_in_clause": // Python: comprehension `for`
      return { category: "loop", nests: true };
    case "switch_case":
    case "case_clause": // Python: `match`/`case`
      return { category: "case", nests: true };
    case "catch_clause":
    case "except_clause": // Python
      return { category: "catch", nests: true };
    case "ternary_expression":
    case "conditional_expression": // Python: `a if b else c`
      return { category: "ternary", nests: true };
    case "binary_expression": {
      const op = node.childForFieldName("operator")?.text;
      if (op === "&&" || op === "||" || op === "??") return { category: "boolean", nests: false };
      return null;
    }
    case "boolean_operator": {
      // Python: `and`/`or` (mirrors JS's `&&`/`||`; `not` is left unmapped,
      // matching how JS's unary `!` maps to nothing).
      const op = node.childForFieldName("operator")?.text;
      if (op === "and" || op === "or") return { category: "boolean", nests: false };
      return null;
    }
    default:
      return null;
  }
}

/** Lower every function in a source file to the syntactic IR. */
export async function lowerSource(file: string, source: string): Promise<FunctionUnit[]> {
  const parser = await getParser(file);
  const tree = parser.parse(source);
  if (!tree) return [];

  const units: FunctionUnit[] = [];
  collectFunctions(tree.rootNode, units, file);
  return units;
}

function collectFunctions(node: TsNode, units: FunctionUnit[], file: string): void {
  if (FUNCTION_KINDS.has(node.type)) {
    units.push(toUnit(node, file));
  }
  for (let i = 0; i < node.namedChildCount; i++) {
    const child = node.namedChild(i);
    if (child) collectFunctions(child, units, file);
  }
}

function toUnit(fn: TsNode, file: string): FunctionUnit {
  const name = fn.childForFieldName("name")?.text ?? "(anonymous)";
  const params = fn.childForFieldName("parameters")?.namedChildCount ?? 0;
  const line = fn.startPosition.row + 1;
  const loc = fn.endPosition.row - fn.startPosition.row + 1;

  const controlNodes: ControlNode[] = [];
  const body = fn.childForFieldName("body");
  if (body) walkControl(body, 0, controlNodes);

  return { name, file, line, loc, params, controlNodes };
}

/** Walk a function body, recording control nodes with their nesting depth; does
 * not descend into nested functions (they are their own units). */
function walkControl(node: TsNode, depth: number, out: ControlNode[]): void {
  for (let i = 0; i < node.namedChildCount; i++) {
    const child = node.namedChild(i);
    if (!child) continue;
    if (FUNCTION_KINDS.has(child.type)) continue; // measured separately

    const cat = categoryOf(child);
    if (cat) {
      out.push({ category: cat.category, depth, nests: cat.nests });
      walkControl(child, cat.nests ? depth + 1 : depth, out);
    } else {
      walkControl(child, depth, out);
    }
  }
}
