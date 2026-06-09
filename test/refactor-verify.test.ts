import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { gitWorktreeRunner, verifyEdits, verifyProposal, type FileEdit, type VerifyRunner } from "../src/refactor/verify.js";

const exec = promisify(execFile);

const EDIT: FileEdit = { file: "val.txt", content: "new\n" };

const mockRunner = (over: Partial<VerifyRunner> = {}): VerifyRunner => ({
  createWorktree: async () => "/tmp/wt",
  writeEdit: async () => {},
  runCheck: async () => ({ ok: true, output: "" }),
  removeWorktree: async () => {},
  ...over,
});

describe("verifyProposal orchestration (AC-5)", () => {
  test("green when the edit is written and all checks pass (AC-5)", async () => {
    const badge = await verifyProposal(EDIT, ["typecheck", "test"], mockRunner());
    expect(badge.status).toBe("green");
  });

  test("red with the failing check output when a check fails (AC-5)", async () => {
    const badge = await verifyProposal(EDIT, ["typecheck", "test"], mockRunner({
      runCheck: async (_wt, cmd) =>
        cmd === "test" ? { ok: false, output: "2 tests failed" } : { ok: true, output: "" },
    }));
    expect(badge.status).toBe("red");
    if (badge.status === "red") {
      expect(badge.output).toContain("2 tests failed");
      expect(badge.output).toContain("test");
    }
  });

  test("writes the edit into the worktree before running checks (AC-5)", async () => {
    const writeEdit = vi.fn(async () => {});
    const runCheck = vi.fn(async () => ({ ok: true, output: "" }));
    await verifyProposal(EDIT, ["check"], mockRunner({ writeEdit, runCheck }));
    expect(writeEdit).toHaveBeenCalledWith("/tmp/wt", EDIT);
    const writeOrder = writeEdit.mock.invocationCallOrder[0] ?? 0;
    const checkOrder = runCheck.mock.invocationCallOrder[0] ?? Number.POSITIVE_INFINITY;
    expect(writeOrder).toBeLessThan(checkOrder);
  });

  test("stops at the first failing check (AC-5)", async () => {
    const runCheck = vi.fn(async () => ({ ok: false, output: "boom" }));
    await verifyProposal(EDIT, ["first", "second"], mockRunner({ runCheck }));
    expect(runCheck).toHaveBeenCalledTimes(1);
  });

  test("always removes the worktree, even when a check throws (AC-5)", async () => {
    const removeWorktree = vi.fn(async () => {});
    await expect(
      verifyProposal(EDIT, ["typecheck"], mockRunner({
        runCheck: async () => {
          throw new Error("boom");
        },
        removeWorktree,
      })),
    ).rejects.toThrow("boom");
    expect(removeWorktree).toHaveBeenCalledWith("/tmp/wt");
  });
});

describe("verifyEdits — multi-file orchestration (AC-5)", () => {
  const EDITS: FileEdit[] = [
    { file: "shared.ts", content: "export const x = 1;\n" },
    { file: "sub/a.ts", content: "import { x } from '../shared.js';\n" },
    { file: "sub/b.ts", content: "import { x } from '../shared.js';\n" },
  ];

  test("writes every edit into one worktree before checks, badges green (AC-5)", async () => {
    const written: FileEdit[] = [];
    const runCheck = vi.fn(async () => ({ ok: true, output: "" }));
    const badge = await verifyEdits(EDITS, ["typecheck"], mockRunner({
      writeEdit: async (_wt, edit) => {
        written.push(edit);
      },
      runCheck,
    }));
    expect(badge.status).toBe("green");
    expect(written.map((e) => e.file)).toEqual(["shared.ts", "sub/a.ts", "sub/b.ts"]);
    // all three writes precede the first check
    const lastWrite = Math.max(...written.map((_, i) => i));
    expect(written).toHaveLength(3);
    expect(lastWrite).toBe(2);
  });

  test("red when a check fails across the multi-file set (AC-5)", async () => {
    const badge = await verifyEdits(EDITS, ["typecheck"], mockRunner({
      runCheck: async () => ({ ok: false, output: "type error in sub/a.ts" }),
    }));
    expect(badge.status).toBe("red");
    if (badge.status === "red") expect(badge.output).toContain("type error in sub/a.ts");
  });

  test("always removes the worktree even when a check throws (AC-5)", async () => {
    const removeWorktree = vi.fn(async () => {});
    await expect(
      verifyEdits(EDITS, ["typecheck"], mockRunner({
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
  beforeEach(async () => {
    repo = await mkdtemp(join(tmpdir(), "necro-verify-repo-"));
    const git = (args: string[]) => exec("git", args, { cwd: repo });
    await git(["init", "-q"]);
    await git(["config", "user.email", "t@t.t"]);
    await git(["config", "user.name", "t"]);
    await writeFile(join(repo, "val.txt"), "old\n");
    await git(["add", "."]);
    await git(["commit", "-q", "-m", "init"]);
  });
  afterEach(async () => {
    await rm(repo, { recursive: true, force: true });
  });

  test("writes the edit in an isolated worktree, badges green, leaves the main tree untouched (AC-5)", async () => {
    const runner = gitWorktreeRunner(repo);
    const badge = await verifyProposal({ file: "val.txt", content: "new\n" }, ["grep -q new val.txt"], runner);

    expect(badge.status).toBe("green");
    // main working tree never mutated
    expect(await readFile(join(repo, "val.txt"), "utf8")).toBe("old\n");
    // only the main worktree remains — the scratch worktree is gone
    const list = (await exec("git", ["worktree", "list"], { cwd: repo })).stdout;
    expect(list.split("\n").filter(Boolean)).toHaveLength(1);
  });

  test("badges red (not green) when a check fails in the worktree (AC-5)", async () => {
    const runner = gitWorktreeRunner(repo);
    const badge = await verifyProposal({ file: "val.txt", content: "new\n" }, ["grep -q nope val.txt"], runner);
    expect(badge.status).toBe("red");
  });

  test("writes a multi-file edit set into one worktree, main tree untouched (AC-5)", async () => {
    const runner = gitWorktreeRunner(repo);
    const badge = await verifyEdits(
      [
        { file: "val.txt", content: "new\n" },
        { file: "added.txt", content: "fresh\n" },
      ],
      ["grep -q new val.txt", "grep -q fresh added.txt"],
      runner,
    );
    expect(badge.status).toBe("green");
    // neither the edited file nor the new file appears in the main tree
    expect(await readFile(join(repo, "val.txt"), "utf8")).toBe("old\n");
    await expect(readFile(join(repo, "added.txt"), "utf8")).rejects.toThrow();
    const list = (await exec("git", ["worktree", "list"], { cwd: repo })).stdout;
    expect(list.split("\n").filter(Boolean)).toHaveLength(1);
  });
});
