import { Node, Project } from "ts-morph";
import { symbolNodeId } from "./symbol-graph.js";

/**
 * Resolve the set of graph node ids reachable as public API from `entryFiles`
 * — package.json's manifest/mapped entry surface. Barrel re-export chains
 * (`export * from`, `export { x } from`) are resolved via ts-morph's
 * `getExportedDeclarations()`, which follows them through the TS compiler's
 * own module resolution rather than a hand-rolled AST walk.
 *
 * Ids are computed from each resolved declaration's *own* declaration-site
 * name — not the (possibly aliased) name `getExportedDeclarations()` exposes
 * it under — so `export { foo as bar } from "./x.js"` still matches `foo`'s
 * own graph node id, not a nonexistent `bar` id.
 */
export function resolvePublicApiIds(
  entryFiles: string[],
  allFilePaths: string[],
): Set<string> {
  const trackedFiles = new Set(allFilePaths);
  const project = new Project({
    skipAddingFilesFromTsConfig: true,
    compilerOptions: { allowJs: true },
  });
  for (const fp of allFilePaths) project.addSourceFileAtPath(fp);

  const ids = new Set<string>();

  for (const entryFile of entryFiles) {
    const sf = project.getSourceFile(entryFile);
    if (!sf) continue;

    for (const decls of sf.getExportedDeclarations().values()) {
      for (const decl of decls) {
        const declFile = decl.getSourceFile().getFilePath();
        if (!trackedFiles.has(declFile)) continue;

        const nameNode = declarationNameNode(decl);
        if (!nameNode) continue;

        const name = nameNode.getText();
        if (!name) continue;

        const line = nameNode.getStartLineNumber();
        ids.add(symbolNodeId(declFile, line, name));
      }
    }
  }

  return ids;
}

/**
 * The declaration's own name node, mirroring `collectDeclarations`'s
 * per-kind handling in `symbol-graph.ts`. `undefined` for shapes with no
 * extractable name (e.g. an anonymous default-export expression).
 */
function declarationNameNode(decl: Node): Node | undefined {
  if (
    Node.isFunctionDeclaration(decl) ||
    Node.isClassDeclaration(decl) ||
    Node.isInterfaceDeclaration(decl) ||
    Node.isTypeAliasDeclaration(decl) ||
    Node.isEnumDeclaration(decl) ||
    Node.isVariableDeclaration(decl)
  ) {
    return decl.getNameNode();
  }
  return undefined;
}
