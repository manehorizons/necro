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

// An exported-but-unreachable symbol ("orphan") — a `likely` finding, plus a
// second file so `verify-removal` has more than one symbol to iterate.
// verify-removal branches worktrees off HEAD, so the fixture needs a git repo.
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
  dir = await mkdtemp(join(tmpdir(), "necro-cli-terminal-polish-"));
  await fixture();
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe("necro scan terminal output (AC-1)", () => {
  test("prints a relative path, not the absolute temp-dir path", async () => {
    const { stdout } = await run(["scan"], dir);
    expect(stdout).toContain("src/util.ts");
    expect(stdout).not.toContain(dir);
  });
});

describe("necro scan --json (Constraints: unaffected by AC-1)", () => {
  test("still contains the absolute path", async () => {
    const { stdout } = await run(["scan", "--json"], dir);
    const parsed = JSON.parse(stdout) as { findings: Array<{ file: string }> };
    const orphan = parsed.findings.find((f) => f.file.endsWith("util.ts"));
    expect(orphan?.file).toContain(dir);
  });
});

describe("necro scan stderr progress (AC-3)", () => {
  test("stderr carries progress while stdout stays clean report/JSON", async () => {
    const { stdout, stderr } = await run(["scan", "--json"], dir);
    expect(stderr.length).toBeGreaterThan(0);
    expect(() => JSON.parse(stdout)).not.toThrow();
  });
});

describe("necro verify-removal stderr progress (AC-3)", () => {
  test("stderr shows per-symbol progress while stdout stays valid JSON", async () => {
    const { stdout, stderr } = await run(
      ["verify-removal", "orphan", "live", "--checks", "true", "--json"],
      dir,
    );
    expect(stderr).toMatch(/\[1\/2\]/);
    expect(stderr).toMatch(/\[2\/2\]/);
    expect(() => JSON.parse(stdout)).not.toThrow();
  });
});
