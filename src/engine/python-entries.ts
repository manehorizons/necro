import { readFileSync } from "node:fs";
import { basename, join } from "node:path";
import type { Node as TsNode } from "web-tree-sitter";
import type { SymbolNode } from "../graph/types.js";
import type { PythonModuleMap } from "../graph/python/module-resolver.js";
import { getParser } from "../syntactic/parse.js";
import type { EntrySource } from "./prod-entries.js";

const CONVENTIONAL_PY = ["main.py", "app.py", "manage.py", "wsgi.py", "asgi.py"];

/** `pkg.module` or `pkg.module:func` — the shape every mechanism below ultimately produces. */
const MODULE_SPEC = /^[A-Za-z_][\w.]*(?::[A-Za-z_]\w*)?$/;

export interface PythonEntryRecord {
  file: string;
  source: EntrySource;
  /**
   * The exact declared symbol id when the spec named a specific function
   * (`pkg.mod:func`) that resolves to a real module-level declaration in the
   * target file. A bare-file entry root has no outbound edge into a function
   * merely *defined* there (only into that file's own module-level
   * statements) — so without this, `pip = "pip._internal.cli.main:main"`
   * seeds `cli/main.py` but never reaches `main()` itself, and everything
   * `main()` calls reads as dead. Absent when the spec has no `:func` suffix
   * or the named function can't be found (falls back to file-only seeding).
   */
  symbolId?: string;
}

export interface ResolvedPythonEntries {
  entries: Set<string>;
  records: PythonEntryRecord[];
  /** `conftest.py`-style files: entries, but for test reachability, not prod. */
  testEntries: Set<string>;
}

/**
 * Resolve Python production (and, for `conftest.py`, test) entry roots:
 * `pyproject.toml` script tables, `setup.cfg` `[options.entry_points]`,
 * literal `setup.py` `console_scripts`, `__main__.py`/`if __name__ ==
 * "__main__":` modules, and conventional filenames (§2.3). Mirrors
 * `resolveProdEntries`'s `{ entries, records }` shape (`./prod-entries.ts`)
 * so the two merge trivially in `buildReachabilityModel`.
 */
export async function resolvePythonEntries(
  root: string,
  files: string[],
  moduleMap: PythonModuleMap,
  declaredSymbols: SymbolNode[] = [],
): Promise<ResolvedPythonEntries> {
  const fileSet = new Set(files);
  const entries = new Set<string>();
  const testEntries = new Set<string>();
  const records: PythonEntryRecord[] = [];

  const declaredByFile = new Map<string, Map<string, number>>();
  for (const n of declaredSymbols) {
    let byName = declaredByFile.get(n.file);
    if (!byName) declaredByFile.set(n.file, (byName = new Map()));
    byName.set(n.name, n.line);
  }

  const add = (file: string, source: EntrySource, symbolId?: string): void => {
    if (!entries.has(file)) {
      entries.add(file);
      records.push({ file, source, symbolId });
    }
  };

  const addResolved = (specs: string[], source: EntrySource): void => {
    for (const spec of specs) {
      const resolved = resolveDottedModule(spec, moduleMap, declaredByFile);
      if (resolved && fileSet.has(resolved.file)) add(resolved.file, source, resolved.symbolId);
    }
  };

  const pyproject = readIfExists(join(root, "pyproject.toml"));
  if (pyproject) {
    addResolved(
      extractSectionedModuleSpecs(pyproject, ["project.scripts", "project.gui-scripts", "project.entry-points"]),
      "pyproject-scripts",
    );
  }

  const setupCfg = readIfExists(join(root, "setup.cfg"));
  if (setupCfg) {
    addResolved(extractSectionedModuleSpecs(setupCfg, ["options.entry_points"]), "setup-config");
  }

  const setupPy = join(root, "setup.py");
  if (fileSet.has(setupPy)) {
    addResolved(await extractSetupPyConsoleScripts(setupPy), "setup-config");
  }

  for (const file of files) {
    const name = basename(file);
    if (name === "__main__.py") {
      add(file, "dunder-main");
    } else if (name === "conftest.py") {
      testEntries.add(file);
    } else if (CONVENTIONAL_PY.includes(name)) {
      add(file, "convention");
    } else if (await hasModuleLevelMainGuard(file)) {
      add(file, "dunder-main");
    }
  }

  return { entries, records, testEntries };
}

function readIfExists(path: string): string | null {
  try {
    return readFileSync(path, "utf8");
  } catch {
    return null;
  }
}

/**
 * Look up a spec's dotted module path directly — these specs are always
 * fully-qualified, never relative. When an optional `:func` suffix names a
 * function that's actually declared at module level in the resolved file,
 * also resolve its exact symbol id (see `PythonEntryRecord.symbolId`).
 */
function resolveDottedModule(
  spec: string,
  map: PythonModuleMap,
  declaredByFile: Map<string, Map<string, number>>,
): { file: string; symbolId?: string } | null {
  const [modulePath, funcName] = spec.split(":");
  const file = map.moduleToFile.get(modulePath ?? "");
  if (!file) return null;
  if (!funcName) return { file };
  const line = declaredByFile.get(file)?.get(funcName);
  return { file, symbolId: line !== undefined ? `${file}:${line}:${funcName}` : undefined };
}

const SECTION_HEADER = /^\s*\[([^\]]+)\]\s*$/;
const KEY_VALUE = /^\s*[\w.-]+\s*=\s*(.+?)\s*$/;

/** True if a `[header]` (quotes stripped) is one of `prefixes`, or a dotted/quoted-subkey child of one (`project.entry-points."flake8.extension"` matches prefix `project.entry-points`). */
function headerMatches(header: string, prefixes: string[]): boolean {
  const normalized = header.replace(/["']/g, "");
  return prefixes.some((p) => normalized === p || normalized.startsWith(`${p}.`));
}

/**
 * Extract every `key = "value"`/`key = value` line's RHS from sections whose
 * header matches `headerPrefixes`, filtered to values that look like a
 * dotted module spec — across a TOML- or INI-shaped source (both use
 * `[section]` headers, `#` comments, and single-line `key = value` pairs for
 * the narrow shapes these mechanisms actually use). Multi-line arrays/tables
 * are not attempted — a value spanning multiple lines is silently skipped,
 * a false negative, not a crash. This also naturally handles `setup.cfg`'s
 * INI multi-line-value convention (`console_scripts =` followed by indented
 * `name = pkg.mod:func` lines): each indented line matches `KEY_VALUE` in
 * its own right and its RHS is exactly the module spec we want.
 */
function extractSectionedModuleSpecs(source: string, headerPrefixes: string[]): string[] {
  const specs: string[] = [];
  let inSection = false;
  for (const rawLine of source.split(/\r?\n/)) {
    const line = (rawLine.split("#")[0] ?? "").trimEnd();
    const header = SECTION_HEADER.exec(line);
    if (header) {
      inSection = headerMatches(header[1] ?? "", headerPrefixes);
      continue;
    }
    if (!inSection) continue;
    const kv = KEY_VALUE.exec(line);
    if (!kv) continue;
    const value = (kv[1] ?? "").replace(/^["']|["']$/g, "");
    if (MODULE_SPEC.test(value)) specs.push(value);
  }
  return specs;
}

/**
 * Tree-sitter extraction of literal `setup(entry_points={"console_scripts":
 * [...]})` calls. Each list entry is a `"name=pkg.mod:func"` string — this
 * function returns the `pkg.mod:func` half. Anything not a literal
 * dict-of-literal-list (a variable, a call, an f-string) is skipped without
 * error, per the design doc's "skip dynamic setups honestly".
 */
async function extractSetupPyConsoleScripts(file: string): Promise<string[]> {
  const source = readIfExists(file);
  if (source === null) return [];
  const parser = await getParser(file);
  const tree = parser.parse(source);
  if (!tree) return [];

  const out: string[] = [];
  collectSetupCalls(tree.rootNode, out);
  return out;
}

function collectSetupCalls(node: TsNode, out: string[]): void {
  if (node.type === "call") {
    const fn = node.childForFieldName("function");
    const isSetup =
      fn?.type === "identifier" ? fn.text === "setup" : fn?.type === "attribute" ? fn.childForFieldName("attribute")?.text === "setup" : false;
    if (isSetup) {
      const args = node.childForFieldName("arguments");
      if (args) collectEntryPointsKwarg(args, out);
    }
  }
  for (let i = 0; i < node.namedChildCount; i++) {
    const child = node.namedChild(i);
    if (child) collectSetupCalls(child, out);
  }
}

function collectEntryPointsKwarg(argsNode: TsNode, out: string[]): void {
  for (let i = 0; i < argsNode.namedChildCount; i++) {
    const child = argsNode.namedChild(i);
    if (child?.type !== "keyword_argument") continue;
    if (child.childForFieldName("name")?.text !== "entry_points") continue;
    const value = child.childForFieldName("value");
    if (value?.type === "dictionary") collectConsoleScriptsFromDict(value, out);
  }
}

function collectConsoleScriptsFromDict(dictNode: TsNode, out: string[]): void {
  for (let i = 0; i < dictNode.namedChildCount; i++) {
    const pair = dictNode.namedChild(i);
    if (pair?.type !== "pair") continue;
    if (stringLiteralText(pair.childForFieldName("key")) !== "console_scripts") continue;
    const value = pair.childForFieldName("value");
    if (value?.type !== "list") continue;
    for (let j = 0; j < value.namedChildCount; j++) {
      const entry = stringLiteralText(value.namedChild(j));
      if (entry === null) continue;
      const spec = (entry.split("=")[1] ?? "").trim();
      if (MODULE_SPEC.test(spec)) out.push(spec);
    }
  }
}

/** A plain (non-f-string) string literal's text, or `null` if it isn't one. */
function stringLiteralText(node: TsNode | null | undefined): string | null {
  if (!node || node.type !== "string") return null;
  let content = "";
  for (let i = 0; i < node.namedChildCount; i++) {
    const child = node.namedChild(i);
    if (!child) continue;
    if (child.type === "interpolation") return null;
    if (child.type === "string_content") content += child.text;
  }
  return content;
}

/** Whether a file has a module-level `if __name__ == "__main__":` (or reversed-operand) guard. */
async function hasModuleLevelMainGuard(file: string): Promise<boolean> {
  const source = readIfExists(file);
  if (source === null) return false;
  const parser = await getParser(file);
  const tree = parser.parse(source);
  if (!tree) return false;

  for (let i = 0; i < tree.rootNode.namedChildCount; i++) {
    const stmt = tree.rootNode.namedChild(i);
    if (stmt?.type === "if_statement" && isMainGuardCondition(stmt.childForFieldName("condition"))) return true;
  }
  return false;
}

function isMainGuardCondition(node: TsNode | null): boolean {
  let cond = node;
  while (cond?.type === "parenthesized_expression") cond = cond.namedChild(0);
  if (cond?.type !== "comparison_operator" || cond.namedChildCount !== 2) return false;

  const a = cond.namedChild(0);
  const b = cond.namedChild(1);
  const isDunderName = (n: TsNode | null) => n?.type === "identifier" && n.text === "__name__";
  const isMainString = (n: TsNode | null) => stringLiteralText(n) === "__main__";
  return (isDunderName(a) && isMainString(b)) || (isMainString(a) && isDunderName(b));
}
