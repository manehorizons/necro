import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { gitWorktreeRunner, verifyProposal, type VerifyRunner } from "../src/refactor/verify.js";

const exec = promisify(execFile);

const mockRunner = (over: Partial<VerifyRunner> = {}): VerifyRunner => ({
  createWorktree: async () => "/tmp/wt",
  applyDiff: async () => true,
  runCheck: async () => ({ ok: true, output: "" }),
  removeWorktree: async () => {},
  ...over,
});

describe("verifyProposal orchestration (AC-5)", () => {
  test("green when the diff applies and all checks pass (AC-5)", async () => {
    const badge = await verifyProposal("diff", ["typecheck", "test"], mockRunner());
    expect(badge.status).toBe("green");
  });

  test("red with the failing check output when a check fails (AC-5)", async () => {
    const badge = await verifyProposal("diff", ["typecheck", "test"], mockRunner({
      runCheck: async (_wt, cmd) =>
        cmd === "test" ? { ok: false, output: "2 tests failed" } : { ok: true, output: "" },
    }));
    expect(badge.status).toBe("red");
    if (badge.status === "red") {
      expect(badge.output).toContain("2 tests failed");
      expect(badge.output).toContain("test");
    }
  });

  test("skipped when the proposal diff does not apply (AC-5)", async () => {
    const badge = await verifyProposal("diff", ["typecheck"], mockRunner({ applyDiff: async () => false }));
    expect(badge.status).toBe("skipped");
  });

  test("stops at the first failing check (AC-5)", async () => {
    const runCheck = vi.fn(async () => ({ ok: false, output: "boom" }));
    await verifyProposal("diff", ["first", "second"], mockRunner({ runCheck }));
    expect(runCheck).toHaveBeenCalledTimes(1);
  });

  test("always removes the worktree, even when a check throws (AC-5)", async () => {
    const removeWorktree = vi.fn(async () => {});
    await expect(
      verifyProposal("diff", ["typecheck"], mockRunner({
        runCheck: async () => {
          throw new Error("boom");
        },
        removeWorktree,
      })),
    ).rejects.toThrow("boom");
    expect(removeWorktree).toHaveBeenCalledWith("/tmp/wt");
  });
});

describe("gitWorktreeRunner integration (AC-5)", () => {
  let repo: string;
  let diff: string;
  beforeEach(async () => {
    repo = await mkdtemp(join(tmpdir(), "necro-verify-repo-"));
    const git = (args: string[]) => exec("git", args, { cwd: repo });
    await git(["init", "-q"]);
    await git(["config", "user.email", "t@t.t"]);
    await git(["config", "user.name", "t"]);
    await writeFile(join(repo, "val.txt"), "old\n");
    await git(["add", "."]);
    await git(["commit", "-q", "-m", "init"]);
    // a valid unified diff old->new, captured from git so it applies cleanly
    await writeFile(join(repo, "val.txt"), "new\n");
    diff = (await git(["diff"])).stdout;
    await git(["checkout", "--", "val.txt"]); // restore working tree to "old"
  });
  afterEach(async () => {
    await rm(repo, { recursive: true, force: true });
  });

  test("applies the proposal in an isolated worktree, badges green, leaves the main tree untouched (AC-5)", async () => {
    const runner = gitWorktreeRunner(repo);
    const badge = await verifyProposal(diff, ["grep -q new val.txt"], runner);

    expect(badge.status).toBe("green");
    // main working tree never mutated
    expect(await readFile(join(repo, "val.txt"), "utf8")).toBe("old\n");
    // only the main worktree remains — the scratch worktree (at .../wt) is gone
    const list = (await exec("git", ["worktree", "list"], { cwd: repo })).stdout;
    const worktrees = list.split("\n").filter(Boolean);
    expect(worktrees).toHaveLength(1);
    expect(worktrees.some((l) => / \S+\/wt /.test(`${l} `))).toBe(false);
  });

  test("badges red (not green) when a check fails in the worktree (AC-5)", async () => {
    const runner = gitWorktreeRunner(repo);
    const badge = await verifyProposal(diff, ["grep -q nope val.txt"], runner);
    expect(badge.status).toBe("red");
  });
});
