import { Project } from "ts-morph";
import type { ClassifiedFinding } from "../analyze/classify.js";
import { collectDeclarations } from "../graph/symbol-graph.js";

/** A pending file edit: the before/after full text of a single source file. */
export interface Edit {
  file: string;
  before: string;
  after: string;
}

/** A symbol to remove, addressed by file + declared name + 1-based name line. */
export interface RemovalTarget {
  file: string;
  name: string;
  line: number;
}

/**
 * Plan the removal of every `autoFixEligible` (`certain`-dead) finding. Thin
 * wrapper over {@link planRemovalOf}: maps the eligible findings to removal
 * targets. Same ts-morph-`.remove()` + resolve-before-mutate guarantees.
 */
export function planRemovals(findings: ClassifiedFinding[]): Edit[] {
  const targets = findings
    .filter((f) => f.autoFixEligible)
    .map((f) => ({ file: f.node.file, name: f.node.name, line: f.node.line }));
  return planRemovalOf(targets);
}

/**
 * Plan the removal of arbitrary named symbols — **not** gated on dead-code
 * eligibility — so callers (e.g. `verify-removal`) can ask "what if I delete
 * symbol X?" for any declaration. Returns one {@link Edit} per file that
 * actually changed. Removals go through ts-morph `.remove()` — never text
 * splicing — and all target declarations are resolved *before* any removal so
 * earlier deletions cannot shift the line numbers used to match later ones.
 */
export function planRemovalOf(targets: RemovalTarget[]): Edit[] {
  const byFile = new Map<string, RemovalTarget[]>();
  for (const t of targets) {
    const group = byFile.get(t.file) ?? [];
    group.push(t);
    byFile.set(t.file, group);
  }

  const edits: Edit[] = [];
  for (const [file, group] of byFile) {
    const project = new Project({
      skipAddingFilesFromTsConfig: true,
      compilerOptions: { allowJs: true },
    });
    const sf = project.addSourceFileAtPath(file);
    const before = sf.getFullText();
    const decls = collectDeclarations(sf);

    // Resolve all targets first (line numbers are stable until we remove).
    const resolved = group
      .map((t) =>
        decls.find(
          (d) =>
            d.name === t.name && d.nameNode.getStartLineNumber() === t.line,
        ),
      )
      .filter((d): d is NonNullable<typeof d> => d !== undefined)
      .map((d) => d.declNode as unknown as { remove?: () => void });

    for (const t of resolved) {
      if (typeof t.remove === "function") t.remove();
    }

    const after = sf.getFullText();
    if (after !== before) edits.push({ file, before, after });
  }
  return edits;
}
