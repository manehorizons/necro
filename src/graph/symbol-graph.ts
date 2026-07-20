import { Node, Project } from "ts-morph";
import type { EdgeKind, SymbolEdge, SymbolGraph, SymbolNode } from "./types.js";

const DEFAULT_TEST_FILE = /\.(test|spec)\.[cm]?[jt]sx?$/;

export interface BuildOptions {
  /** Classify a file as test (vs prod). Defaults to a `.test.`/`.spec.` regex. */
  isTestFile?: (filePath: string) => boolean;
  /**
   * Workspace package name → absolute entry file. When present, fed to the
   * ts-morph `paths` map so cross-package imports (`@scope/pkg`) resolve and the
   * reference walk spans workspace members (monorepo FP reduction, §5).
   */
  packagePaths?: Map<string, string>;
}

export interface Declaration {
  name: string;
  nameNode: Node;
  declNode: Node;
  exported: boolean;
}

/** The stable node-id format used throughout the symbol graph: `${file}:${line}:${name}`. */
export function symbolNodeId(file: string, line: number, name: string): string {
  return `${file}:${line}:${name}`;
}

/**
 * Build a symbol graph from the given TypeScript files using the compiler API
 * (via ts-morph). Nodes are top-level declarations; edges are references,
 * tagged `prod`/`test` by the referencing file. Barrel re-exports are treated
 * as pass-throughs and do not count as terminal references.
 */
export function buildSymbolGraph(
  filePaths: string[],
  opts: BuildOptions = {},
): SymbolGraph {
  const isTestFile = opts.isTestFile ?? ((p) => DEFAULT_TEST_FILE.test(p));
  const project = new Project({
    skipAddingFilesFromTsConfig: true,
    compilerOptions: {
      allowJs: true,
      ...workspacePathsOptions(opts.packagePaths),
    },
  });
  for (const fp of filePaths) project.addSourceFileAtPath(fp);

  const nodes: SymbolNode[] = [];
  const edges: SymbolEdge[] = [];
  /** `${file}:${declNode.start}` → node id, for resolving the enclosing symbol of a reference. */
  const idByDeclKey = new Map<string, string>();

  for (const sf of project.getSourceFiles()) {
    const file = sf.getFilePath();
    for (const decl of collectDeclarations(sf)) {
      const line = decl.nameNode.getStartLineNumber();
      const id = symbolNodeId(file, line, decl.name);
      nodes.push({ id, name: decl.name, file, line, exported: decl.exported });
      idByDeclKey.set(declKey(decl.declNode), id);
    }
  }

  for (const sf of project.getSourceFiles()) {
    for (const decl of collectDeclarations(sf)) {
      const toId = symbolNodeId(
        sf.getFilePath(),
        decl.nameNode.getStartLineNumber(),
        decl.name,
      );
      if (!Node.isIdentifier(decl.nameNode)) continue;
      for (const ref of decl.nameNode.findReferencesAsNodes()) {
        if (isSelfReference(ref, decl.nameNode)) continue;
        if (isReExport(ref)) continue;
        const refFile = ref.getSourceFile().getFilePath();
        const kind: EdgeKind = isTestFile(refFile) ? "test" : "prod";
        edges.push({
          from: enclosingFrom(ref, idByDeclKey, refFile),
          to: toId,
          kind,
        });
      }
    }
  }

  // A reached symbol also reaches its own file: JS/TS runs a module's whole
  // top-level body on first import, so once anything in file F is reached,
  // F's module-level statements (already attributed `from: file` by
  // `enclosingFrom`'s fallback above) are reached too. Mirrors the Python
  // plane's identical pattern (python/symbol-graph.ts). Emitted at both kinds
  // so prod/test-only separation still holds.
  for (const node of nodes) {
    edges.push({ from: node.id, to: node.file, kind: "prod" });
    edges.push({ from: node.id, to: node.file, kind: "test" });
  }

  // Bare side-effect imports (`import "./register.js"`) bind no name, so
  // nothing ever references a symbol in the target file — without an
  // explicit edge the whole module goes invisible even though importing it
  // runs its top-level code.
  for (const sf of project.getSourceFiles()) {
    const refFile = sf.getFilePath();
    const kind: EdgeKind = isTestFile(refFile) ? "test" : "prod";
    for (const imp of sf.getImportDeclarations()) {
      if (imp.getImportClause() !== undefined) continue;
      const target = imp.getModuleSpecifierSourceFile();
      if (!target) continue;
      edges.push({ from: refFile, to: target.getFilePath(), kind });
    }
  }

  return { nodes, edges };
}

/**
 * Translate a workspace package map into ts-morph `paths`/`baseUrl` so
 * `@scope/pkg` imports resolve to the member entry file. Empty when there are no
 * workspace packages — single-package repos get the exact options as before.
 */
function workspacePathsOptions(
  packagePaths?: Map<string, string>,
):
  | { baseUrl: string; paths: Record<string, string[]> }
  | Record<string, never> {
  if (!packagePaths || packagePaths.size === 0) return {};
  const paths: Record<string, string[]> = {};
  for (const [name, entry] of packagePaths) paths[name] = [entry];
  return { baseUrl: ".", paths };
}

export function collectDeclarations(
  sf: import("ts-morph").SourceFile,
): Declaration[] {
  const out: Declaration[] = [];
  const push = (
    declNode: Node,
    nameNode: Node | undefined,
    exported: boolean,
  ) => {
    if (!nameNode) return;
    const name = nameNode.getText();
    if (!name) return;
    out.push({ name, nameNode, declNode, exported });
  };

  for (const fn of sf.getFunctions())
    push(fn, fn.getNameNode(), fn.isExported());
  for (const cls of sf.getClasses())
    push(cls, cls.getNameNode(), cls.isExported());
  for (const iface of sf.getInterfaces())
    push(iface, iface.getNameNode(), iface.isExported());
  for (const ta of sf.getTypeAliases())
    push(ta, ta.getNameNode(), ta.isExported());
  for (const en of sf.getEnums()) push(en, en.getNameNode(), en.isExported());
  for (const vs of sf.getVariableStatements()) {
    const exported = vs.isExported();
    for (const d of vs.getDeclarations()) {
      const nameNode = d.getNameNode();
      if (Node.isIdentifier(nameNode)) push(d, nameNode, exported);
    }
  }

  return out;
}

function declKey(node: Node): string {
  return `${node.getSourceFile().getFilePath()}:${node.getStart()}`;
}

function isSelfReference(ref: Node, nameNode: Node): boolean {
  return (
    ref.getSourceFile().getFilePath() ===
      nameNode.getSourceFile().getFilePath() &&
    ref.getStart() === nameNode.getStart()
  );
}

/** A reference inside `export { x } from "..."` — a barrel pass-through, not a terminal use. */
function isReExport(ref: Node): boolean {
  for (const ancestor of ref.getAncestors()) {
    if (Node.isExportDeclaration(ancestor)) {
      return ancestor.getModuleSpecifier() !== undefined;
    }
  }
  return false;
}

function enclosingFrom(
  ref: Node,
  idByDeclKey: Map<string, string>,
  refFile: string,
): string {
  for (const ancestor of ref.getAncestors()) {
    const id = idByDeclKey.get(declKey(ancestor));
    if (id) return id;
  }
  return refFile;
}
