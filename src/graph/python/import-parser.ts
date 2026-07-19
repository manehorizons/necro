import type { Node as TsNode } from "web-tree-sitter";
import { getParser } from "../../syntactic/parse.js";

export interface PythonImportedModule {
  /** Dotted path segments, e.g. `["a", "b", "c"]` for `import a.b.c`. */
  segments: string[];
  alias: string | null;
  /** Local name bound into the importing module's namespace. */
  binding: string;
}

export interface PythonImportedName {
  /** The name imported from the module (not a dotted path — `from` targets a single symbol or submodule per name). */
  name: string;
  alias: string | null;
  /** Local name bound into the importing module's namespace. */
  binding: string;
}

export type PythonImport =
  | { kind: "import"; line: number; modules: PythonImportedModule[] }
  | {
      kind: "from";
      line: number;
      /** Leading-dot count on the `from` clause; 0 for an absolute module path. */
      relativeDots: number;
      /** Dotted segments after the dots, e.g. `["pkg"]` for `from ..pkg import y`; empty for `from . import x`. */
      moduleSegments: string[];
      isStar: boolean;
      names: PythonImportedName[];
    };

/** Parse every `import`/`from ... import` statement in a Python source file, anywhere in the tree (including nested inside functions). */
export async function parsePythonImports(
  file: string,
  source: string,
): Promise<PythonImport[]> {
  const parser = await getParser(file);
  const tree = parser.parse(source);
  if (!tree) return [];

  const imports: PythonImport[] = [];
  collectImports(tree.rootNode, imports);
  return imports;
}

function collectImports(node: TsNode, out: PythonImport[]): void {
  if (node.type === "import_statement") {
    out.push(toImportStatement(node));
  } else if (node.type === "import_from_statement") {
    out.push(toImportFromStatement(node));
  } else {
    for (let i = 0; i < node.namedChildCount; i++) {
      const child = node.namedChild(i);
      if (child) collectImports(child, out);
    }
  }
}

function toImportStatement(node: TsNode): PythonImport {
  const line = node.startPosition.row + 1;
  const modules: PythonImportedModule[] = [];
  for (let i = 0; i < node.namedChildCount; i++) {
    const child = node.namedChild(i);
    if (!child) continue;
    modules.push(toImportedModule(child));
  }
  return { kind: "import", line, modules };
}

function toImportedModule(node: TsNode): PythonImportedModule {
  if (node.type === "aliased_import") {
    const nameNode = node.childForFieldName("name");
    const alias = node.childForFieldName("alias")?.text ?? null;
    const segments = dottedNameSegments(nameNode);
    return { segments, alias, binding: alias ?? segments[0] ?? "" };
  }
  const segments = dottedNameSegments(node);
  return { segments, alias: null, binding: segments[0] ?? "" };
}

function toImportFromStatement(node: TsNode): PythonImport {
  const line = node.startPosition.row + 1;
  const moduleNode = node.childForFieldName("module_name");

  let relativeDots = 0;
  let moduleSegments: string[] = [];
  if (moduleNode?.type === "relative_import") {
    for (let i = 0; i < moduleNode.childCount; i++) {
      const part = moduleNode.child(i);
      if (part?.type === "import_prefix") relativeDots = countDots(part);
      else if (part?.type === "dotted_name")
        moduleSegments = dottedNameSegments(part);
    }
  } else if (moduleNode?.type === "dotted_name") {
    moduleSegments = dottedNameSegments(moduleNode);
  }

  let isStar = false;
  const names: PythonImportedName[] = [];
  for (let i = 0; i < node.namedChildCount; i++) {
    const child = node.namedChild(i);
    if (!child || node.fieldNameForNamedChild(i) === "module_name") continue;
    if (child.type === "wildcard_import") {
      isStar = true;
    } else if (child.type === "aliased_import") {
      const nameNode = child.childForFieldName("name");
      const alias = child.childForFieldName("alias")?.text ?? null;
      const name = nameNode?.text ?? "";
      names.push({ name, alias, binding: alias ?? name });
    } else if (child.type === "dotted_name") {
      const name = child.text;
      names.push({ name, alias: null, binding: name });
    }
  }

  return { kind: "from", line, relativeDots, moduleSegments, isStar, names };
}

function dottedNameSegments(node: TsNode | null): string[] {
  if (!node) return [];
  const segments: string[] = [];
  for (let i = 0; i < node.namedChildCount; i++) {
    const child = node.namedChild(i);
    if (child?.type === "identifier") segments.push(child.text);
  }
  return segments;
}

function countDots(importPrefix: TsNode): number {
  let count = 0;
  for (let i = 0; i < importPrefix.childCount; i++) {
    if (importPrefix.child(i)?.text === ".") count++;
  }
  return count;
}
