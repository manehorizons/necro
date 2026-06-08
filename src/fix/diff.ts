import { relative } from "node:path";
import { createPatch } from "diff";
import type { Edit } from "./remove.js";

/**
 * Render planned {@link Edit}s as a unified diff for preview. Paths are shown
 * relative to `targetPath`. Returns "" when there is nothing to remove.
 */
export function renderDiff(edits: Edit[], targetPath: string): string {
  return edits
    .map((e) => createPatch(relative(targetPath, e.file), e.before, e.after, "", ""))
    .join("\n");
}
