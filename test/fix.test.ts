import { execFile } from "node:child_process";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { promisify } from "node:util";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { DEFAULT_CONFIG } from "../src/config.js";
import { fixExitCode, runFix } from "../src/fix/index.js";
import type { FileEdit, VerifyRunner } from "../src/refactor/verify.js";

const exec = promisify(execFile);
let dir: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "necro-fixrun-"));
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
  vi.restoreAllMocks();
});

async function write(rel: string, contents: string): Promise<void> {
  const path = join(dir, rel);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, contents);
}

/** A project with one live (liveFn) and one certain-dead (deadFn) symbol. */
async function writeFixture(): Promise<void> {
  await write("package.json", JSON.stringify({ name: "fx" }));
  await write("src/index.ts", `import { liveFn } from "./util.js";\nliveFn();\n`);
  await write("src/util.ts", `export function liveFn() {}\nfunction deadFn() {}\n`);
}

const util = () => readFile(join(dir, "src/util.ts"), "utf8");

describe("runFix", () => {
  test("preview makes no changes (AC-2)", async () => {
    await writeFixture();
    const before = await util();
    const result = await runFix(dir, DEFAULT_CONFIG, { write: false });

    expect(result.status).toBe("preview");
    if (result.status === "preview") {
      expect(result.diff).toContain("-function deadFn() {}");
      expect(result.count).toBe(1);
    }
    expect(await util()).toBe(before); // untouched
  });

  test("--write removes the certain-dead symbol; re-scan finds it gone; idempotent (AC-1, AC-3, AC-6)", async () => {
    await writeFixture();
    vi.spyOn(console, "warn").mockImplementation(() => {}); // swallow no-git warning
    const result = await runFix(dir, DEFAULT_CONFIG, { write: true });

    expect(result.status).toBe("written");
    const after = await util();
    expect(after).not.toContain("deadFn");
    expect(after).toContain("liveFn");

    // Idempotent: a second run finds nothing (AC-6).
    const again = await runFix(dir, DEFAULT_CONFIG, { write: true });
    expect(again.status).toBe("nothing-to-fix");
  });

  test("refuses on a dirty git tree, writes nothing (AC-4)", async () => {
    await writeFixture();
    await exec("git", ["init", "-q"], { cwd: dir });
    await exec("git", ["config", "user.email", "t@example.com"], { cwd: dir });
    await exec("git", ["config", "user.name", "T"], { cwd: dir });
    await exec("git", ["add", "-A"], { cwd: dir });
    await exec("git", ["commit", "-q", "-m", "init"], { cwd: dir });
    // Make the tree dirty.
    await write("src/extra.ts", `export const x = 1;\n`);

    const before = await util();
    const result = await runFix(dir, DEFAULT_CONFIG, { write: true });
    expect(result.status).toBe("refused-dirty");
    expect(await util()).toBe(before);
  });

  test("--force bypasses the dirty-tree guard (AC-4)", async () => {
    await writeFixture();
    await exec("git", ["init", "-q"], { cwd: dir });
    await exec("git", ["config", "user.email", "t@example.com"], { cwd: dir });
    await exec("git", ["config", "user.name", "T"], { cwd: dir });
    await exec("git", ["add", "-A"], { cwd: dir });
    await exec("git", ["commit", "-q", "-m", "init"], { cwd: dir });
    await write("src/extra.ts", `export const x = 1;\n`);

    const result = await runFix(dir, DEFAULT_CONFIG, { write: true, force: true });
    expect(result.status).toBe("written");
    expect(await util()).not.toContain("deadFn");
  });

  test("refuses with refused-no-entries when reachability is unseeded, before the nothing-to-fix check (AC-3)", async () => {
    // No manifest entry, no conventional name — 0 prod entries on a non-empty graph.
    await write("package.json", JSON.stringify({ name: "no-entries-fx" }));
    await write("src/cli.ts", `function orphan(): number {\n  return 1;\n}\n`);

    const result = await runFix(dir, DEFAULT_CONFIG, { write: true });
    expect(result.status).toBe("refused-no-entries");
    expect(await readFile(join(dir, "src/cli.ts"), "utf8")).toContain("orphan"); // disk untouched
  });

  test("refused-no-entries wins over refused-dirty (AC-4)", async () => {
    await write("package.json", JSON.stringify({ name: "no-entries-fx" }));
    await write("src/cli.ts", `function orphan(): number {\n  return 1;\n}\n`);
    await exec("git", ["init", "-q"], { cwd: dir });
    await exec("git", ["config", "user.email", "t@example.com"], { cwd: dir });
    await exec("git", ["config", "user.name", "T"], { cwd: dir });
    await exec("git", ["add", "-A"], { cwd: dir });
    await exec("git", ["commit", "-q", "-m", "init"], { cwd: dir });
    await write("extra.txt", "dirty");

    const result = await runFix(dir, DEFAULT_CONFIG, { write: true });
    expect(result.status).toBe("refused-no-entries");
  });
});

/**
 * A fake runner factory: one fresh runner per symbol. A check is **red** when
 * the verified edit set touches a file whose path contains `redToken`,
 * standing in for "the build broke" without a real worktree or compiler.
 * (Mirrors the identically-named helper in test/verify-removal.test.ts.)
 */
function fakeRunnerFactory(redToken: string): (root: string) => VerifyRunner {
  return (_root: string): VerifyRunner => {
    const written: FileEdit[] = [];
    return {
      createWorktree: async () => "/wt",
      writeEdit: async (_wt, edit) => {
        written.push(edit);
      },
      runCheck: async () => {
        const broke = written.some((e) => e.file.includes(redToken));
        return broke
          ? { ok: false, output: `tsc: ${redToken} is still referenced` }
          : { ok: true, output: "" };
      },
      removeWorktree: async () => {},
    };
  };
}

/** Two independent certain-dead symbols in separate files: `safeDead` (util.ts) and `breakerDead` (dep.ts). */
async function writeVerifyFixture(): Promise<void> {
  await write("package.json", JSON.stringify({ name: "fx" }));
  await write("src/index.ts", `import { liveFn } from "./util.js";\nliveFn();\n`);
  await write("src/util.ts", `export function liveFn() {}\nfunction safeDead() {}\n`);
  await write("src/dep.ts", `function breakerDead() {}\n`);
}

describe("runFix --verify (phase 29)", () => {
  test("--write --verify deletes only the green symbol; the red one is skipped, not deleted (AC-1, AC-2)", async () => {
    await writeVerifyFixture();
    vi.spyOn(console, "warn").mockImplementation(() => {});

    const result = await runFix(dir, DEFAULT_CONFIG, {
      write: true,
      verify: true,
      checks: ["typecheck"],
      runnerFactory: fakeRunnerFactory("dep.ts"),
    });

    expect(result.status).toBe("written");
    if (result.status === "written") {
      expect(result.files.some((f) => f.endsWith("util.ts"))).toBe(true);
      expect(result.files.some((f) => f.endsWith("dep.ts"))).toBe(false);
      expect(result.skipped).toHaveLength(1);
      expect(result.skipped[0]).toMatchObject({ reason: "red" });
    }
    expect(await readFile(join(dir, "src/util.ts"), "utf8")).not.toContain("safeDead");
    expect(await readFile(join(dir, "src/dep.ts"), "utf8")).toContain("breakerDead"); // untouched — verification refused it
  });

  test("--verify without --write reports per-symbol verdicts and mutates nothing (AC-3)", async () => {
    await writeVerifyFixture();
    const beforeUtil = await readFile(join(dir, "src/util.ts"), "utf8");
    const beforeDep = await readFile(join(dir, "src/dep.ts"), "utf8");

    const result = await runFix(dir, DEFAULT_CONFIG, {
      write: false,
      verify: true,
      checks: ["typecheck"],
      runnerFactory: fakeRunnerFactory("dep.ts"),
    });

    expect(result.status).toBe("preview-verified");
    if (result.status === "preview-verified") {
      const statuses = result.verdicts.map((v) => v.status).sort();
      expect(statuses).toEqual(["green", "red"]);
    }
    expect(await readFile(join(dir, "src/util.ts"), "utf8")).toBe(beforeUtil);
    expect(await readFile(join(dir, "src/dep.ts"), "utf8")).toBe(beforeDep);
  });

  test("--write without --verify removes every certain-dead symbol regardless of verify-removal verdicts (AC-4, no regression)", async () => {
    await writeVerifyFixture();
    vi.spyOn(console, "warn").mockImplementation(() => {});

    // Same mixed fixture as the AC-1/AC-2/AC-3 tests above (one symbol would
    // badge red under --verify) — the unverified default must not consult
    // verify-removal at all and must delete both.
    const result = await runFix(dir, DEFAULT_CONFIG, { write: true });

    expect(result.status).toBe("written");
    expect(await readFile(join(dir, "src/util.ts"), "utf8")).not.toContain("safeDead");
    expect(await readFile(join(dir, "src/dep.ts"), "utf8")).not.toContain("breakerDead");
  });
});

describe("fixExitCode (AC-5)", () => {
  test("written/preview/nothing-to-fix exit 0", () => {
    expect(fixExitCode("written")).toBe(0);
    expect(fixExitCode("preview")).toBe(0);
    expect(fixExitCode("nothing-to-fix")).toBe(0);
  });

  test("refused-dirty exits 2", () => {
    expect(fixExitCode("refused-dirty")).toBe(2);
  });

  test("refused-no-entries exits 3", () => {
    expect(fixExitCode("refused-no-entries")).toBe(3);
  });
});
