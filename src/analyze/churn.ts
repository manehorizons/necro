import { execFile } from "node:child_process";
import { isAbsolute, join } from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const GIT_TIMEOUT_MS = 15_000;

/**
 * Per-file churn (number of commits touching each file) for the repo at
 * `targetPath`, keyed by absolute path. Derived from a single
 * `git log --format= --name-only` pass. Returns `null` when the target is not a
 * git repo or git fails — churn is an optional hotspot signal, never fatal.
 */
export async function fileChurn(targetPath: string): Promise<Map<string, number> | null> {
  let stdout: string;
  try {
    ({ stdout } = await execFileAsync("git", ["log", "--format=", "--name-only", "HEAD"], {
      cwd: targetPath,
      timeout: GIT_TIMEOUT_MS,
      maxBuffer: 64 * 1024 * 1024,
    }));
  } catch {
    return null;
  }

  const churn = new Map<string, number>();
  for (const raw of stdout.split("\n")) {
    const rel = raw.trim();
    if (rel === "") continue;
    const abs = isAbsolute(rel) ? rel : join(targetPath, rel);
    churn.set(abs, (churn.get(abs) ?? 0) + 1);
  }
  return churn;
}
