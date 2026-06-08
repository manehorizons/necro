import { exec, execFile } from "node:child_process";
import { mkdtemp, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { promisify } from "node:util";

const execAsync = promisify(exec);
const execFileAsync = promisify(execFile);
const GIT_TIMEOUT_MS = 30_000;

/** The outcome of verifying a proposal in a throwaway worktree. */
export type VerifyBadge =
  | { status: "green" }
  | { status: "red"; output: string }
  | { status: "skipped"; reason: string };

/** The side-effecting steps of verification — injected so the orchestration is
 * testable with no real git or test run. */
export interface VerifyRunner {
  /** Create an isolated worktree off HEAD; returns its path. */
  createWorktree(): Promise<string>;
  /** Apply the unified diff in the worktree; resolve `false` if it doesn't apply. */
  applyDiff(worktree: string, diff: string): Promise<boolean>;
  /** Run a check command in the worktree. */
  runCheck(worktree: string, command: string): Promise<{ ok: boolean; output: string }>;
  /** Tear the worktree down. */
  removeWorktree(worktree: string): Promise<void>;
}

/**
 * Verify a proposed diff without touching the user's tree: apply it in a
 * throwaway worktree, run each check in order, and badge the result. The
 * worktree is **always** torn down (a check failure, a non-applying diff, or a
 * thrown error all still hit the `finally`).
 */
export async function verifyProposal(
  diff: string,
  checks: string[],
  runner: VerifyRunner,
): Promise<VerifyBadge> {
  const worktree = await runner.createWorktree();
  try {
    const applied = await runner.applyDiff(worktree, diff);
    if (!applied) return { status: "skipped", reason: "proposal diff did not apply cleanly" };

    for (const command of checks) {
      const { ok, output } = await runner.runCheck(worktree, command);
      if (!ok) return { status: "red", output: `$ ${command}\n${output}`.trim() };
    }
    return { status: "green" };
  } finally {
    await runner.removeWorktree(worktree);
  }
}

/**
 * The real runner: a detached `git worktree` off the repo's HEAD, with the repo's
 * `node_modules` symlinked in so `tsc`/`vitest` resolve. Checks run via the shell
 * with the worktree as cwd. The worktree (and its temp parent) are removed on
 * teardown.
 */
export function gitWorktreeRunner(repoRoot: string): VerifyRunner {
  const git = (args: string[], cwd = repoRoot) =>
    execFileAsync("git", args, { cwd, timeout: GIT_TIMEOUT_MS });

  return {
    async createWorktree(): Promise<string> {
      const parent = await mkdtemp(join(tmpdir(), "necro-verify-"));
      const wt = join(parent, "wt");
      await git(["worktree", "add", "--detach", "-q", wt, "HEAD"]);
      // Untracked node_modules isn't in the worktree; link it so checks resolve.
      await symlink(join(repoRoot, "node_modules"), join(wt, "node_modules"), "dir").catch(() => {});
      return wt;
    },

    async applyDiff(worktree: string, diff: string): Promise<boolean> {
      // Pipe the diff to `git apply` over stdin — resolve false if it won't apply.
      return new Promise((resolve) => {
        const child = execFile(
          "git",
          ["apply", "--whitespace=nowarn"],
          { cwd: worktree, timeout: GIT_TIMEOUT_MS },
          (err) => resolve(!err),
        );
        child.stdin?.end(diff);
      });
    },

    async runCheck(worktree: string, command: string): Promise<{ ok: boolean; output: string }> {
      try {
        const { stdout, stderr } = await execAsync(command, { cwd: worktree, timeout: GIT_TIMEOUT_MS });
        return { ok: true, output: `${stdout}${stderr}` };
      } catch (err) {
        const e = err as { stdout?: string; stderr?: string; message?: string };
        return { ok: false, output: `${e.stdout ?? ""}${e.stderr ?? ""}` || e.message || String(err) };
      }
    },

    async removeWorktree(worktree: string): Promise<void> {
      await git(["worktree", "remove", "--force", worktree]).catch(() => {});
      await rm(dirname(worktree), { recursive: true, force: true }).catch(() => {});
    },
  };
}
