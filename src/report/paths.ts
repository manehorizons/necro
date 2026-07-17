import { isAbsolute, relative } from "node:path";

/** Repo-relative, forward-slashed path for a finding file path. */
export function toRelativePath(file: string, root: string): string {
  const rel = isAbsolute(file) ? relative(root, file) : file;
  return rel.split("\\").join("/");
}
