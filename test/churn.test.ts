import { execFile } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { fileChurn } from "../src/analyze/churn.js";

const exec = promisify(execFile);
let dir: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "necro-churn-"));
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

async function git(...args: string[]): Promise<void> {
  await exec("git", args, { cwd: dir });
}
async function commit(file: string, contents: string, msg: string): Promise<void> {
  await writeFile(join(dir, file), contents);
  await git("add", "-A");
  await git("commit", "-q", "-m", msg);
}

describe("fileChurn (AC-4)", () => {
  test("counts commits touching each file", async () => {
    await git("init", "-q");
    await git("config", "user.email", "t@example.com");
    await git("config", "user.name", "T");
    await commit("a.ts", "1", "c1");
    await commit("a.ts", "2", "c2"); // a.ts touched twice
    await commit("b.ts", "1", "c3"); // b.ts once

    const churn = await fileChurn(dir);
    expect(churn?.get(join(dir, "a.ts"))).toBe(2);
    expect(churn?.get(join(dir, "b.ts"))).toBe(1);
  });

  test("non-git directory → null", async () => {
    expect(await fileChurn(dir)).toBeNull();
  });
});
