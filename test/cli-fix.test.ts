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

describe("necro fix --verify --checks", () => {
  test("AC-4: repeated --checks flags each run as a separate check command", async () => {
    const { code, stdout } = await run(
      // last-flag-wins (the pre-fix behavior) would use only "true" and pass;
      // accumulating both means the earlier "false" still fails the verdict.
      ["fix", ".", "--verify", "--checks", "false", "--checks", "true"],
      dir,
    );
    expect(code).toBe(0);
    expect(stdout).toMatch(/breaks the build|red/i);
    expect(stdout).toContain("0 symbol(s) would be removed");
  });

  test("AC-4: a repeated --checks flag that all pass produces a green preview", async () => {
    const { code, stdout } = await run(
      ["fix", ".", "--verify", "--checks", "true", "--checks", "true"],
      dir,
    );
    expect(code).toBe(0);
    expect(stdout).toMatch(/safe to remove|green/i);
    expect(stdout).toContain("1 symbol(s) would be removed");
  });
});
