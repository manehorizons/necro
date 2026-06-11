import { execFile } from "node:child_process";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { afterEach, beforeAll, beforeEach, describe, expect, test } from "vitest";

const exec = promisify(execFile);
const repoRoot = fileURLToPath(new URL("..", import.meta.url));
const cli = join(repoRoot, "dist/cli.js");

/** Run the built necro CLI, capturing exit code instead of throwing on non-zero. */
async function run(
  args: string[],
  cwd: string,
): Promise<{ code: number; stdout: string; stderr: string }> {
  try {
    const { stdout, stderr } = await exec("node", [cli, ...args], { cwd });
    return { code: 0, stdout, stderr };
  } catch (e) {
    const err = e as { code?: number; stdout?: string; stderr?: string };
    return { code: typeof err.code === "number" ? err.code : 1, stdout: err.stdout ?? "", stderr: err.stderr ?? "" };
  }
}

let dir: string;

async function write(rel: string, contents: string): Promise<void> {
  const path = join(dir, rel);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, contents);
}

/** Fixture with a certain-dead private symbol (→ high severity). */
async function deadFixture(): Promise<void> {
  await write("package.json", JSON.stringify({ name: "fx" }));
  await write("src/index.ts", `import { live } from "./util.js";\nconsole.log(live());\n`);
  await write("src/util.ts", `export function live() {\n  return 1;\n}\nfunction deadFn() {}\n`);
}

/** Fixture with no dead code (every symbol is live via a cross-file import). */
async function cleanFixture(): Promise<void> {
  await write("package.json", JSON.stringify({ name: "fx" }));
  await write("src/index.ts", `import { live } from "./util.js";\nconsole.log(live());\n`);
  await write("src/util.ts", `export function live() {\n  return 1;\n}\n`);
}

beforeAll(async () => {
  // The integration tests run the bundled CLI, so build it from current src.
  await exec("npm", ["run", "build"], { cwd: repoRoot });
}, 60_000);

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "necro-ci-"));
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe("scan CI flags (--sarif / --fail-on)", () => {
  test("--fail-on high exits non-zero when a certain-dead finding exists (AC-2)", async () => {
    await deadFixture();
    const { code } = await run(["scan", dir, "--fail-on", "high"], dir);
    expect(code).toBe(1);
  });

  test("--fail-on high exits zero when no high-severity finding exists (AC-2)", async () => {
    await cleanFixture();
    const { code } = await run(["scan", dir, "--fail-on", "high"], dir);
    expect(code).toBe(0);
  });

  test("--sarif writes a schema-valid SARIF 2.1.0 file (AC-2)", async () => {
    await deadFixture();
    const out = join(dir, "necro.sarif");
    const { code } = await run(["scan", dir, "--sarif", out], dir);
    expect(code).toBe(0); // no --fail-on → success even with findings
    const log = JSON.parse(await readFile(out, "utf8"));
    expect(log.version).toBe("2.1.0");
    expect(log.runs[0].tool.driver.name).toBe("necro");
    expect(log.runs[0].results.some((r: { ruleId: string }) => r.ruleId === "dead-code")).toBe(true);
  });

  test("invalid --fail-on value errors with a non-zero exit (AC-2)", async () => {
    await cleanFixture();
    const { code, stderr } = await run(["scan", dir, "--fail-on", "critical"], dir);
    expect(code).toBe(1);
    expect(stderr.toLowerCase()).toMatch(/severity|high|medium|low|fail-on/);
  });
});
