import type { PythonImport } from "./import-parser.js";
import { containingPackage, type PythonModuleMap } from "./module-resolver.js";

export interface ResolvedImport {
  /** The file this import lands in, or `null` if it could not be resolved. */
  file: string | null;
  /** Local name bound into the importing module's namespace. */
  binding: string;
}

/**
 * Resolve a parsed import statement against a module map, from the
 * perspective of `fromFile` (needed for relative-import dot-level walking).
 * Resolution is file-level only — `from pkg import symbol` returns the file
 * `symbol` most plausibly lives in (its own submodule if one exists, else the
 * package's `__init__.py`); which named export `symbol` actually is remains
 * Phase C's job.
 */
export function resolvePythonImport(fromFile: string, imp: PythonImport, map: PythonModuleMap): ResolvedImport[] {
  if (imp.kind === "import") {
    return imp.modules.map((m) => ({
      file: map.moduleToFile.get(m.segments.join(".")) ?? null,
      binding: m.binding,
    }));
  }

  const base = resolveFromBase(fromFile, imp, map);

  if (imp.isStar) {
    return [{ file: base === null ? null : (map.moduleToFile.get(base) ?? null), binding: "*" }];
  }

  return imp.names.map((n) => ({ file: resolveFromName(base, n.name, map), binding: n.binding }));
}

/** The dotted module path a `from` clause's names should be resolved against, or `null` if a relative import walked above the topmost known package. */
function resolveFromBase(fromFile: string, imp: Extract<PythonImport, { kind: "from" }>, map: PythonModuleMap): string | null {
  if (imp.relativeDots === 0) return imp.moduleSegments.join(".");

  const ownPackage = containingPackage(fromFile, map);
  const ownSegments = ownPackage === "" ? [] : ownPackage.split(".");
  const levelsUp = imp.relativeDots - 1;
  if (levelsUp > ownSegments.length) return null;

  const baseSegments = [...ownSegments.slice(0, ownSegments.length - levelsUp), ...imp.moduleSegments];
  return baseSegments.join(".");
}

function resolveFromName(base: string | null, name: string, map: PythonModuleMap): string | null {
  if (base === null) return null;
  const submodule = base === "" ? name : `${base}.${name}`;
  const submoduleFile = map.moduleToFile.get(submodule);
  if (submoduleFile) return submoduleFile;
  if (base === "") return null;
  return map.moduleToFile.get(base) ?? null;
}
