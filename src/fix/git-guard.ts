import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const GIT_TIMEOUT_MS = 10_000;

/** Whether the target's git working tree is clean, dirty, or unverifiable. */
export type WorkingTreeState = "clean" | "dirty" | "unknown";

/**
 * Inspect the git working tree at `targetPath` via `git status --porcelain`.
 * Empty output → `clean`; any output → `dirty`; not a repo / git missing / any
 * error → `unknown` (the caller treats `unknown` as "no undo available").
 */
export async function workingTreeState(targetPath: string): Promise<WorkingTreeState> {
  try {
    const { stdout } = await execFileAsync("git", ["status", "--porcelain"], {
      cwd: targetPath,
      timeout: GIT_TIMEOUT_MS,
    });
    return stdout.trim() === "" ? "clean" : "dirty";
  } catch {
    return "unknown";
  }
}
