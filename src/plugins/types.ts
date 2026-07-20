import type { EdgeKind, SymbolGraph } from "../graph/types.js";

/** Read-only view of the repo a plugin inspects to detect frameworks and roots. */
export interface RepoContext {
  /** Absolute repo root. */
  root: string;
  /** True if any of the named packages is a declared dependency (any kind). */
  hasDep(names: string[]): boolean;
  /** True if any root-level file matches one of the config-file globs. */
  hasConfig(globs: string[]): boolean;
  /** True if `package.json` has the given top-level key (e.g. `"jest"`). */
  packageJsonHas(key: string): boolean;
  /** True if `package.json`'s `private` field is exactly `true`. */
  packageJsonPrivate(): boolean;
  /** True if `pyproject.toml` has the given top-level section header (e.g. `"project"`, `"build-system"`, `"tool.pytest.ini_options"`). */
  pyprojectHas(header: string): boolean;
}

/** A root glob that is alive by definition, tagged prod or test. */
export interface EntrySpec {
  glob: string;
  kind: EdgeKind;
}

/** An edge the static graph cannot see (e.g. jest `__mocks__` ↔ module). */
export interface SyntheticEdge {
  from: string;
  to: string;
  kind: EdgeKind;
  reason?: string;
}

/** A region to downgrade to `maybe` rather than flag dead. */
export interface TaintRule {
  pattern: string;
  action: "taint-scope";
}

/**
 * Framework-awareness plugin (§5). A plugin contributes exactly four things;
 * auto-detection via {@link RepoContext} makes it zero-config.
 */
export interface FrameworkPlugin {
  name: string;
  /** Is the framework present? */
  detect(ctx: RepoContext): boolean;
  /** Roots that are alive by definition. */
  entryPatterns(ctx: RepoContext): EntrySpec[];
  /** Edges the static graph can't resolve on its own. */
  resolveEdges(ctx: RepoContext, graph: SymbolGraph): SyntheticEdge[];
  /** Regions to downgrade, not flag. */
  taintRules(ctx: RepoContext): TaintRule[];
}
