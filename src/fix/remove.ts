import { Project } from "ts-morph";
import type { ClassifiedFinding } from "../analyze/classify.js";
import { collectDeclarations } from "../graph/symbol-graph.js";

/** A pending file edit: the before/after full text of a single source file. */
export interface Edit {
  file: string;
  before: string;
  after: string;
}

/**
 * Plan the removal of every `autoFixEligible` (`certain`-dead) finding via the
 * TS compiler API. Returns one {@link Edit} per file that actually changed.
 * Removals go through ts-morph `.remove()` — never text splicing — and all
 * target declarations are resolved *before* any removal so earlier deletions
 * cannot shift the line numbers used to match later ones.
 */
export function planRemovals(findings: ClassifiedFinding[]): Edit[] {
  const byFile = new Map<string, ClassifiedFinding[]>();
  for (const f of findings) {
    if (!f.autoFixEligible) continue;
    const group = byFile.get(f.node.file) ?? [];
    group.push(f);
    byFile.set(f.node.file, group);
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
    const targets = group
      .map((f) =>
        decls.find(
          (d) => d.name === f.node.name && d.nameNode.getStartLineNumber() === f.node.line,
        ),
      )
      .filter((d): d is NonNullable<typeof d> => d !== undefined)
      .map((d) => d.declNode as unknown as { remove?: () => void });

    for (const t of targets) {
      if (typeof t.remove === "function") t.remove();
    }

    const after = sf.getFullText();
    if (after !== before) edits.push({ file, before, after });
  }
  return edits;
}
