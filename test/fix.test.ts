import { execFile } from "node:child_process";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { promisify } from "node:util";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { DEFAULT_CONFIG } from "../src/config.js";
import { fixExitCode, runFix } from "../src/fix/index.js";

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
