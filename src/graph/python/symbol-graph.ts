import { readFile } from "node:fs/promises";
import type { Node as TsNode } from "web-tree-sitter";
import { getParser } from "../../syntactic/parse.js";
import type {
  EdgeKind,
  SymbolEdge,
  SymbolGraph,
  SymbolNode,
} from "../types.js";
import { type PythonImport, parsePythonImports } from "./import-parser.js";
import type { PythonModuleMap } from "./module-resolver.js";
import { resolveFromBase, resolvePythonImport } from "./resolve-import.js";

/** Default Python test-file convention: `test_*.py` or `*_test.py`. */
const DEFAULT_PY_TEST_FILE = /[/\\](test_[^/\\]+|[^/\\]+_test)\.py$/;

export interface BuildPythonSymbolGraphOptions {
  /** Classify a file as test (vs prod), for edge tagging. Defaults to a `test_*.py`/`*_test.py` filename match. */
  isTestFile?: (filePath: string) => boolean;
}

export interface PythonSymbolGraphResult {
  graph: SymbolGraph;
  /** Files containing `from x import *` — the resolver cannot know what names it pulled in. */
  starTaintedFiles: Set<string>;
}

interface PyDeclaration {
  name: string;
  line: number;
  exported: boolean;
  /** Byte span of the declaration itself (def/class node, or the assignment statement) — used both to skip its own name as a self-reference and to attribute nested uses as "from" this declaration. */
  startIndex: number;
  endIndex: number;
  nameStartIndex: number;
}

/**
 * A local name's origin, resolved once per file from its own imports.
 * `importedName: null` means "the whole module" (only resolvable one
 * attribute hop further — `binding.attr`); a non-null `importedName` means
 * `binding` was resolved as a specific symbol (or a package-fallback
 * re-export) inside `targetFile`.
 */
interface ImportBinding {
  targetFile: string | null;
  importedName: string | null;
}

interface FileIndex {
  file: string;
  declared: Map<string, number>;
  declarations: PyDeclaration[];
  bindings: Map<string, ImportBinding>;
  skipPositions: Set<number>;
}

type UseSite =
  | { kind: "bare"; name: string; position: number }
  | {
      kind: "attribute";
      objectName: string;
      attrName: string;
      position: number;
    };

/**
 * Build a Python symbol graph — the hand-rolled counterpart to
 * `buildSymbolGraph` (no ts-morph equivalent exists for Python). Nodes are
 * module-level declarations only (never methods or nested functions,
 * matching `collectDeclarations`'s TS granularity). Edges are resolved via a
 * recursive binding chase through Phase B's module resolver, so `__init__.py`
 * re-export chains are followed transparently (AC-3).
 */
export async function buildPythonSymbolGraph(
  files: string[],
  moduleMap: PythonModuleMap,
  opts: BuildPythonSymbolGraphOptions = {},
): Promise<PythonSymbolGraphResult> {
  const isTestFile = opts.isTestFile ?? ((p) => DEFAULT_PY_TEST_FILE.test(p));
  const fileIndex = new Map<string, FileIndex>();
  const starTaintedFiles = new Set<string>();
  const trees = new Map<string, TsNode>();

  for (const file of files) {
    const source = await readFile(file, "utf8");
    const parser = await getParser(file);
    const tree = parser.parse(source);
    if (!tree) continue;
    trees.set(file, tree.rootNode);

    const imports = await parsePythonImports(file, source);
    for (const imp of imports) {
      if (imp.kind === "from" && imp.isStar) starTaintedFiles.add(file);
    }

    const declarations = collectDeclarations(tree.rootNode);
    const declared = new Map<string, number>();
    const skipPositions = new Set<number>();
    for (const d of declarations) {
      declared.set(d.name, d.line);
      skipPositions.add(d.nameStartIndex);
    }

    const bindings = buildBindingTable(file, imports, moduleMap);

    fileIndex.set(file, {
      file,
      declared,
      declarations,
      bindings,
      skipPositions,
    });
  }

  const nodes: SymbolNode[] = [];
  for (const fi of fileIndex.values()) {
    for (const d of fi.declarations) {
      nodes.push({
        id: `${fi.file}:${d.line}:${d.name}`,
        name: d.name,
        file: fi.file,
        line: d.line,
        exported: d.exported,
      });
    }
  }

  const edges: SymbolEdge[] = [];
  for (const [file, root] of trees) {
    const fi = fileIndex.get(file);
    if (!fi) continue;
    const uses: UseSite[] = [];
    walkUses(root, fi.skipPositions, uses);

    const kind: EdgeKind = isTestFile(file) ? "test" : "prod";
    for (const use of uses) {
      const toId =
        use.kind === "bare"
          ? resolveBareName(use.name, file, fileIndex, new Set())
          : resolveAttribute(use.objectName, use.attrName, fi, fileIndex);
      if (!toId) continue;
      edges.push({
        from: enclosingId(use.position, file, fi.declarations),
        to: toId,
        kind,
      });
    }
  }

  // Python runs a module's whole top-level body the first time it's
  // imported — so once ANY declared symbol in a file is reached, every
  // module-level use-site in that same file (attributed to the file's own
  // bare-path id by `enclosingId`'s fallback) is reached too, e.g. a plugin
  // registry's `plugin_manager.register(HeadersFormatter, ...)` call becomes
  // traceable once anything imports `plugin_manager` from that same file.
  // Emitted at both kinds so prod/test-only separation still holds: an edge
  // whose source node is never reached at that kind is simply never
  // traversed by that color's BFS.
  for (const node of nodes) {
    edges.push({ from: node.id, to: node.file, kind: "prod" });
    edges.push({ from: node.id, to: node.file, kind: "test" });
  }

  return { graph: { nodes, edges }, starTaintedFiles };
}

/** Resolve every import in a file into a local-name → binding table via Phase B's resolver. */
function buildBindingTable(
  file: string,
  imports: PythonImport[],
  moduleMap: PythonModuleMap,
): Map<string, ImportBinding> {
  const table = new Map<string, ImportBinding>();

  for (const imp of imports) {
    const results = resolvePythonImport(file, imp, moduleMap);

    if (imp.kind === "import") {
      for (const r of results)
        table.set(r.binding, { targetFile: r.file, importedName: null });
      continue;
    }

    if (imp.isStar) continue; // handled as file-level taint, not a binding

    const base = resolveFromBase(file, imp, moduleMap);
    for (let i = 0; i < imp.names.length; i++) {
      const name = imp.names[i];
      const result = results[i];
      if (!name || !result) continue;
      table.set(
        result.binding,
        classifyFromBinding(result.file, base, name.name, moduleMap),
      );
    }
  }

  return table;
}

/** Whether a resolved `from` name landed on the submodule itself (whole-module binding) or a package-fallback re-export (symbol binding). */
function classifyFromBinding(
  resolvedFile: string | null,
  base: string | null,
  name: string,
  moduleMap: PythonModuleMap,
): ImportBinding {
  if (resolvedFile === null) return { targetFile: null, importedName: null };
  if (base === null) return { targetFile: resolvedFile, importedName: name };
  const submoduleDotted = base === "" ? name : `${base}.${name}`;
  const isModuleBinding =
    moduleMap.moduleToFile.get(submoduleDotted) === resolvedFile;
  return {
    targetFile: resolvedFile,
    importedName: isModuleBinding ? null : name,
  };
}

/**
 * Chase a bare name to its real declaration: local decl → else follow the
 * binding table into the imported file, recursing (cycle-guarded) through
 * `__init__.py` re-export chains. Returns `null` on a dead end — unresolved
 * (stdlib/third-party/dynamic), not a crash.
 */
function resolveBareName(
  name: string,
  file: string,
  fileIndex: Map<string, FileIndex>,
  visited: Set<string>,
): string | null {
  const key = `${file} ${name}`;
  if (visited.has(key)) return null;
  visited.add(key);

  const fi = fileIndex.get(file);
  if (!fi) return null;

  const line = fi.declared.get(name);
  if (line !== undefined) return `${file}:${line}:${name}`;

  const binding = fi.bindings.get(name);
  if (!binding || binding.targetFile === null) return null;

  return resolveBareName(
    binding.importedName ?? name,
    binding.targetFile,
    fileIndex,
    visited,
  );
}

/** `object.attr` where `object` is a plain identifier bound by an import: resolve `attr` starting from the binding's target file. */
function resolveAttribute(
  objectName: string,
  attrName: string,
  fi: FileIndex,
  fileIndex: Map<string, FileIndex>,
): string | null {
  const binding = fi.bindings.get(objectName);
  if (!binding || binding.targetFile === null) return null;
  return resolveBareName(attrName, binding.targetFile, fileIndex, new Set());
}

/** The nearest top-level declaration whose span contains `position`, else the file itself (module-level code). */
function enclosingId(
  position: number,
  file: string,
  declarations: PyDeclaration[],
): string {
  for (const d of declarations) {
    if (position >= d.startIndex && position < d.endIndex)
      return `${file}:${d.line}:${d.name}`;
  }
  return file;
}

/**
 * Collect every use site (bare identifier or single-hop attribute access) in
 * the whole tree, skipping import statements entirely (their identifiers are
 * bindings, not uses) and never independently visiting an `attribute` node's
 * `attribute` field as a bare name (it's only meaningful in that access).
 */
function walkUses(
  node: TsNode,
  skipPositions: Set<number>,
  out: UseSite[],
): void {
  if (node.type === "import_statement" || node.type === "import_from_statement")
    return;

  if (node.type === "attribute") {
    const objectNode = node.childForFieldName("object");
    const attrNode = node.childForFieldName("attribute");
    if (objectNode?.type === "identifier" && attrNode) {
      out.push({
        kind: "attribute",
        objectName: objectNode.text,
        attrName: attrNode.text,
        position: node.startIndex,
      });
    }
    if (objectNode) walkUses(objectNode, skipPositions, out);
    return;
  }

  if (node.type === "identifier") {
    if (!skipPositions.has(node.startIndex))
      out.push({ kind: "bare", name: node.text, position: node.startIndex });
    return;
  }

  for (let i = 0; i < node.namedChildCount; i++) {
    const child = node.namedChild(i);
    if (child) walkUses(child, skipPositions, out);
  }
}

/** Module-level declarations only — never descends into a class/function body. */
function collectDeclarations(root: TsNode): PyDeclaration[] {
  const allNames = parseAllTuple(root);
  const out: PyDeclaration[] = [];

  for (let i = 0; i < root.namedChildCount; i++) {
    const child = root.namedChild(i);
    if (!child) continue;

    const def = topLevelDefinitionNode(child);
    if (def) {
      const nameNode = def.childForFieldName("name");
      if (nameNode) {
        out.push({
          name: nameNode.text,
          line: nameNode.startPosition.row + 1,
          exported: isExported(nameNode.text, allNames),
          startIndex: def.startIndex,
          endIndex: def.endIndex,
          nameStartIndex: nameNode.startIndex,
        });
      }
      continue;
    }

    const assign = topLevelAssignmentNode(child);
    if (assign) {
      const left = assign.childForFieldName("left");
      if (left?.type === "identifier" && left.text !== "__all__") {
        out.push({
          name: left.text,
          line: left.startPosition.row + 1,
          exported: isExported(left.text, allNames),
          startIndex: child.startIndex,
          endIndex: child.endIndex,
          nameStartIndex: left.startIndex,
        });
      }
    }
  }

  return out;
}

/** `function_definition`/`class_definition`, unwrapping one level of `decorated_definition`. */
function topLevelDefinitionNode(node: TsNode): TsNode | null {
  if (node.type === "function_definition" || node.type === "class_definition")
    return node;
  if (node.type === "decorated_definition") {
    const inner = node.childForFieldName("definition");
    if (
      inner &&
      (inner.type === "function_definition" ||
        inner.type === "class_definition")
    )
      return inner;
  }
  return null;
}

/** `expression_statement` wrapping a plain `assignment` (single identifier target). */
function topLevelAssignmentNode(node: TsNode): TsNode | null {
  if (node.type !== "expression_statement") return null;
  const child = node.namedChild(0);
  return child?.type === "assignment" ? child : null;
}

const DUNDER_NAME = /^__\w+__$/;

/** AC-2: public-by-convention, `__all__`-listed, dunder, or pytest `test_*` convention. */
function isExported(name: string, allNames: Set<string> | null): boolean {
  if (!name.startsWith("_")) return true;
  if (allNames?.has(name)) return true;
  if (DUNDER_NAME.test(name)) return true;
  if (name.startsWith("test_")) return true;
  return false;
}

/** Parse a module-level `__all__ = [...]`/`(...)` of string literals, if present. */
function parseAllTuple(root: TsNode): Set<string> | null {
  for (let i = 0; i < root.namedChildCount; i++) {
    const child = root.namedChild(i);
    const assign = child ? topLevelAssignmentNode(child) : null;
    if (!assign) continue;

    const left = assign.childForFieldName("left");
    if (left?.type !== "identifier" || left.text !== "__all__") continue;

    const right = assign.childForFieldName("right");
    if (!right || (right.type !== "list" && right.type !== "tuple")) continue;

    const names = new Set<string>();
    for (let j = 0; j < right.namedChildCount; j++) {
      const item = right.namedChild(j);
      if (item?.type !== "string") continue;
      const content = stringContent(item);
      if (content !== null) names.add(content);
    }
    return names;
  }
  return null;
}

function stringContent(stringNode: TsNode): string | null {
  for (let i = 0; i < stringNode.namedChildCount; i++) {
    const child = stringNode.namedChild(i);
    if (child?.type === "string_content") return child.text;
  }
  return null;
}
