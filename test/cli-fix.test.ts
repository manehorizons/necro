import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { afterEach, beforeAll, beforeEach, describe, expect, test } from "vitest";

const exec = promisify(execFile);
const repoRoot = fileURLToPath(new URL("..", import.meta.url));
const cli = join(repoRoot, "dist/cli.js");

async function run(
  args: string[],
  cwd: string,
): Promise<{ code: number; stdout: string; stderr: string }> {
  try {
    const { stdout, stderr } = await exec("node", [cli, ...args], { cwd });
    return { code: 0, stdout, stderr };
  } catch (e) {
    const err = e as { code?: number; stdout?: string; stderr?: string };
    return {
      code: typeof err.code === "number" ? err.code : 1,
      stdout: err.stdout ?? "",
      stderr: err.stderr ?? "",
    };
  }
}

let dir: string;

async function write(rel: string, contents: string): Promise<void> {
  const path = join(dir, rel);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, contents);
}

// A git repo (--verify runs an isolated worktree per symbol) with one
// removable export. The verdict here is driven by cheap `true`/`false`
// checks, not tsc.
async function fixture(): Promise<void> {
  await write("package.json", JSON.stringify({ name: "fx" }));
  await write("src/index.ts", `import { liveFn } from "./util.js";\nliveFn();\n`);
  await write(
    "src/util.ts",
    `export function liveFn() {}\nfunction deadFn() {}\n`,
  );
  const git = (args: string[]) => exec("git", args, { cwd: dir });
  await git(["init", "-q"]);
  await git(["config", "user.email", "t@t.t"]);
  await git(["config", "user.name", "t"]);
  await git(["add", "."]);
  await git(["commit", "-q", "-m", "init"]);
}

beforeAll(async () => {
  await exec("npm", ["run", "build"], { cwd: repoRoot });
}, 120_000);

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "necro-cli-fix-"));
  await fixture();
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe("necro fix --checks (verify runs by default, phase 63)", () => {
  test("AC-4: repeated --checks flags each run as a separate check command", async () => {
    const { code, stdout } = await run(
      // last-flag-wins (the pre-fix behavior) would use only "true" and pass;
      // accumulating both means the earlier "false" still fails the verdict.
      ["fix", ".", "--checks", "false", "--checks", "true"],
      dir,
    );
    expect(code).toBe(0);
    expect(stdout).toMatch(/breaks the build|red/i);
    expect(stdout).toContain("0 symbol(s) would be removed");
  });

  test("AC-4: a repeated --checks flag that all pass produces a green preview", async () => {
    const { code, stdout } = await run(
      ["fix", ".", "--checks", "true", "--checks", "true"],
      dir,
    );
    expect(code).toBe(0);
    expect(stdout).toMatch(/safe to remove|green/i);
    expect(stdout).toContain("1 symbol(s) would be removed");
  });
});

describe("necro fix --no-verify on a freshly committed repo (AC-3, phase 64)", () => {
  test("AC-3: --write --no-verify no longer needs --force just because the scan wrote .necro-cache/", async () => {
    // No prior scan has run in this fixture — the first thing `fix` does is
    // scan, writing .necro-cache/ (phase 58). Before phase 64, the
    // dirty-tree guard saw that as an uncommitted change and refused; now it
    // ignores necro's own cache artifact.
    const { code } = await run(["fix", ".", "--write", "--no-verify"], dir);
    expect(code).toBe(0);
    const util = await readFile(join(dir, "src/util.ts"), "utf8");
    expect(util).not.toContain("deadFn");
  });
});

describe("necro fix verify-by-default (AC-1, AC-2, phase 63)", () => {
  test("AC-1: --write with no flags verifies first and skips a build-breaking removal", async () => {
    // No tsconfig/typecheck script in the fixture — the default `npm run
    // typecheck` check fails immediately, so the gate refuses every
    // candidate instead of deleting unconditionally (the pre-phase-63 default).
    const { code, stdout } = await run(["fix", ".", "--write"], dir);
    expect(code).toBe(0);
    expect(stdout).toContain("Removed 0 symbol(s)");
    expect(stdout).toMatch(/skipped/i);
    const util = await readFile(join(dir, "src/util.ts"), "utf8");
    expect(util).toContain("deadFn"); // untouched — the default gate refused it
  });

  test("AC-2: --write --no-verify restores unconditional deletion", async () => {
    // --force: the scan step's symbol-graph cache (phase 58) writes
    // .necro-cache/ into the target, which the dirty-tree guard on the
    // unverified path would otherwise see as an uncommitted change — a
    // pre-existing gap unrelated to this phase (see rec-20260720-001).
    const { code } = await run(
      ["fix", ".", "--write", "--no-verify", "--force"],
      dir,
    );
    expect(code).toBe(0);
    const util = await readFile(join(dir, "src/util.ts"), "utf8");
    expect(util).not.toContain("deadFn");
  });
});
