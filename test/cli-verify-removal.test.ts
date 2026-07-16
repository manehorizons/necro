import { execFile } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
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

// A git repo (worktree verification branches off HEAD) with two removable
// exports. The verdict here is driven by cheap `true`/`false` checks, not tsc.
async function fixture(): Promise<void> {
  await write("package.json", JSON.stringify({ name: "fx" }));
  await write("src/index.ts", `import { live } from "./util.js";\nlive();\n`);
  await write(
    "src/util.ts",
    `export function live() {}\nexport function orphan() {}\n`,
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
  dir = await mkdtemp(join(tmpdir(), "necro-cli-verify-removal-"));
  await fixture();
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe("necro verify-removal", () => {
  test("AC-4: renders a per-symbol green verdict when checks pass", async () => {
    const { code, stdout } = await run(["verify-removal", "orphan", "--checks", "true"], dir);
    expect(code).toBe(0);
    expect(stdout).toContain("orphan");
    expect(stdout).toMatch(/safe to remove|green/i);
  });

  test("AC-1: renders a per-symbol red verdict when a check fails, and exits non-zero", async () => {
    const { code, stdout } = await run(["verify-removal", "orphan", "--checks", "false"], dir);
    expect(code).toBe(1);
    expect(stdout).toMatch(/breaks the build|red/i);
  });

  test("AC-4: an unresolvable symbol is reported unresolved, exit stays 0", async () => {
    const { code, stdout } = await run(
      ["verify-removal", "doesNotExist", "--checks", "true"],
      dir,
    );
    expect(code).toBe(0);
    expect(stdout).toMatch(/unresolved/i);
  });

  test("AC-4: a red verdict still fails the run even alongside an unresolved symbol", async () => {
    const { code, stdout } = await run(
      ["verify-removal", "orphan", "doesNotExist", "--checks", "false"],
      dir,
    );
    expect(code).toBe(1);
    expect(stdout).toMatch(/breaks the build/i);
    expect(stdout).toMatch(/unresolved/i);
  });

  test("AC-4: --json emits a per-symbol array of verdicts", async () => {
    const { code, stdout } = await run(
      ["verify-removal", "orphan", "doesNotExist", "--checks", "true", "--json"],
      dir,
    );
    expect(code).toBe(0);
    const parsed = JSON.parse(stdout);
    expect(parsed.map((r: { symbol: string; status: string }) => [r.symbol, r.status])).toEqual([
      ["orphan", "green"],
      ["doesNotExist", "unresolved"],
    ]);
  });

  test("AC-1: repeated --checks flags each run as a separate check command", async () => {
    const { code, stdout } = await run(
      // last-flag-wins (the pre-fix behavior) would use only "true" and pass;
      // accumulating both means the earlier "false" still fails the verdict.
      ["verify-removal", "orphan", "--checks", "false", "--checks", "true"],
      dir,
    );
    expect(code).toBe(1);
    expect(stdout).toMatch(/breaks the build|red/i);
  });

  test("AC-2: a check command containing a comma is run verbatim, not split", async () => {
    const { code, stdout } = await run(
      ["verify-removal", "orphan", "--checks", "echo a,b"],
      dir,
    );
    expect(code).toBe(0);
    expect(stdout).toMatch(/safe to remove|green/i);
  });
});
