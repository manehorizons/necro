import { execFile } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { workingTreeState } from "../src/fix/git-guard.js";
import { CACHE_DIR } from "../src/graph/symbol-graph-cache.js";

const exec = promisify(execFile);
let dir: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "necro-git-"));
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

async function git(...args: string[]): Promise<void> {
  await exec("git", args, { cwd: dir });
}

async function initRepo(): Promise<void> {
  await git("init", "-q");
  await git("config", "user.email", "t@example.com");
  await git("config", "user.name", "Test");
}

describe("workingTreeState (AC-4)", () => {
  test("non-git directory → unknown", async () => {
    expect(await workingTreeState(dir)).toBe("unknown");
  });

  test("repo with an untracked file → dirty", async () => {
    await initRepo();
    await writeFile(join(dir, "a.ts"), "export {};\n");
    expect(await workingTreeState(dir)).toBe("dirty");
  });

  test("clean committed tree → clean", async () => {
    await initRepo();
    await writeFile(join(dir, "a.ts"), "export {};\n");
    await git("add", "-A");
    await git("commit", "-q", "-m", "init");
    expect(await workingTreeState(dir)).toBe("clean");
  });

  test("AC-1 (phase 64): an untracked .necro-cache/ is not treated as dirty", async () => {
    await initRepo();
    await writeFile(join(dir, "a.ts"), "export {};\n");
    await git("add", "-A");
    await git("commit", "-q", "-m", "init");

    await mkdir(join(dir, CACHE_DIR), { recursive: true });
    await writeFile(join(dir, CACHE_DIR, "symbol-graph.json"), "{}\n");

    expect(await workingTreeState(dir)).toBe("clean");
  });

  test("AC-2 (phase 64): a genuine untracked file elsewhere is still dirty, even alongside .necro-cache/", async () => {
    await initRepo();
    await writeFile(join(dir, "a.ts"), "export {};\n");
    await git("add", "-A");
    await git("commit", "-q", "-m", "init");

    await mkdir(join(dir, CACHE_DIR), { recursive: true });
    await writeFile(join(dir, CACHE_DIR, "symbol-graph.json"), "{}\n");
    await writeFile(join(dir, "b.ts"), "export {};\n");

    expect(await workingTreeState(dir)).toBe("dirty");
  });
});
