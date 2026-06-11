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

async function fixture(): Promise<void> {
  await write("package.json", JSON.stringify({ name: "fx" }));
  await write("src/index.ts", `import { live } from "./util.js";\nlive();\n`);
  await write(
    "src/util.ts",
    `export function live() {\n  helper();\n}\n` +
      `function helper() {}\n` +
      `export function orphan() {}\n` +
      `export function deadCaller() {\n  orphan();\n}\n`,
  );
}

beforeAll(async () => {
  await exec("npm", ["run", "build"], { cwd: repoRoot });
}, 120_000);

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "necro-cli-explain-"));
  await fixture();
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe("necro explain", () => {
  test("AC-1: renders the alive witness chain", async () => {
    const { code, stdout } = await run(["explain", "helper"], dir);
    expect(code).toBe(0);
    expect(stdout).toMatch(/alive/i);
    expect(stdout).toContain("helper");
    expect(stdout).toContain("live");
  });

  test("AC-1: --json emits a structured resolved result", async () => {
    const { code, stdout } = await run(["explain", "helper", "--json"], dir);
    expect(code).toBe(0);
    const parsed = JSON.parse(stdout);
    expect(parsed.status).toBe("resolved");
    expect(parsed.reachability).toBe("alive");
    expect(parsed.witness[parsed.witness.length - 1].name).toBe("helper");
  });

  test("AC-2: renders dead verdict with annotated inbound referrers", async () => {
    const { code, stdout } = await run(["explain", "orphan"], dir);
    expect(code).toBe(0);
    expect(stdout).toMatch(/dead/i);
    expect(stdout).toContain("deadCaller");
  });

  test("AC-2: an unknown symbol exits non-zero", async () => {
    const { code, stdout, stderr } = await run(["explain", "doesNotExist"], dir);
    expect(code).toBe(1);
    expect(`${stdout}${stderr}`).toMatch(/not found|no symbol/i);
  });
});
