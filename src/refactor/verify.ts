import { exec, execFile } from "node:child_process";
import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { promisify } from "node:util";

const execAsync = promisify(exec);
const execFileAsync = promisify(execFile);
const GIT_TIMEOUT_MS = 60_000;

/** A full-file replacement to verify: `file` (relative to the repo) gets `content`. */
export interface FileEdit {
  file: string;
  content: string;
}

/** The outcome of verifying an edit in a throwaway worktree. `skipped` is
 * never produced here — it's constructed by the caller when it deliberately
 * withholds verification (e.g. default checks don't apply to the language). */
export type VerifyBadge =
  | { status: "green" }
  | { status: "red"; output: string }
  | { status: "skipped"; reason: string };

/** What {@link verifyProposal}/{@link verifyEdits} actually return — they always
 * run the checks, so never produce `skipped` (only a caller that withholds
 * verification entirely constructs that variant). */
export type RanVerifyBadge = Exclude<VerifyBadge, { status: "skipped" }>;

/** The side-effecting steps of verification — injected so the orchestration is
 * testable with no real git or test run. */
export interface VerifyRunner {
  /** Create an isolated worktree off HEAD; returns its path. */
  createWorktree(): Promise<string>;
  /** Write the edit's new file content into the worktree. */
  writeEdit(worktree: string, edit: FileEdit): Promise<void>;
  /** Run a check command in the worktree. */
  runCheck(
    worktree: string,
    command: string,
  ): Promise<{ ok: boolean; output: string }>;
  /** Tear the worktree down. */
  removeWorktree(worktree: string): Promise<void>;
}

/**
 * Verify an edit without touching the user's tree: write the new file content in
 * a throwaway worktree, run each check in order, and badge the result. The
 * worktree is **always** torn down (a check failure or a thrown error both still
 * hit the `finally`). Because necro supplies full file content (not a model
 * diff), there is no "did not apply" failure mode.
 */
export async function verifyProposal(
  edit: FileEdit,
  checks: string[],
  runner: VerifyRunner,
): Promise<RanVerifyBadge> {
  return verifyEdits([edit], checks, runner);
}

/**
 * Verify a multi-file edit set (an extract-duplicate proposal: a shared-function
 * file plus call-site rewrites in others) without touching the user's tree:
 * write **every** edit's new content into one throwaway worktree, run each check
 * once over the combined result, and badge it. Same always-torn-down guarantee
 * as {@link verifyProposal} — a check failure or a thrown error both still hit
 * the `finally`.
 */
export async function verifyEdits(
  edits: FileEdit[],
  checks: string[],
  runner: VerifyRunner,
): Promise<RanVerifyBadge> {
  const worktree = await runner.createWorktree();
  try {
    for (const edit of edits) await runner.writeEdit(worktree, edit);
    for (const command of checks) {
      const { ok, output } = await runner.runCheck(worktree, command);
      if (!ok)
        return { status: "red", output: `$ ${command}\n${output}`.trim() };
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
      await symlink(
        join(repoRoot, "node_modules"),
        join(wt, "node_modules"),
        "dir",
      ).catch(() => {});
      return wt;
    },

    async writeEdit(worktree: string, edit: FileEdit): Promise<void> {
      const dest = join(worktree, edit.file);
      await mkdir(dirname(dest), { recursive: true });
      await writeFile(dest, edit.content);
    },

    async runCheck(
      worktree: string,
      command: string,
    ): Promise<{ ok: boolean; output: string }> {
      try {
        const { stdout, stderr } = await execAsync(command, {
          cwd: worktree,
          timeout: GIT_TIMEOUT_MS,
        });
        return { ok: true, output: `${stdout}${stderr}` };
      } catch (err) {
        const e = err as { stdout?: string; stderr?: string; message?: string };
        return {
          ok: false,
          output:
            `${e.stdout ?? ""}${e.stderr ?? ""}` || e.message || String(err),
        };
      }
    },

    async removeWorktree(worktree: string): Promise<void> {
      await git(["worktree", "remove", "--force", worktree]).catch(() => {});
      await rm(dirname(worktree), { recursive: true, force: true }).catch(
        () => {},
      );
    },
  };
}
