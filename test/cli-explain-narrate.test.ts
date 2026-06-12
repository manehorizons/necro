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

/** Run the built CLI with the Anthropic key forced absent (degradation path). */
async function runNoKey(
  args: string[],
  cwd: string,
): Promise<{ code: number; stdout: string; stderr: string }> {
  try {
    const { stdout, stderr } = await exec("node", [cli, ...args], {
      cwd,
      env: { ...process.env, ANTHROPIC_API_KEY: "" },
    });
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

beforeAll(async () => {
  await exec("npm", ["run", "build"], { cwd: repoRoot });
}, 120_000);

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "necro-cli-narrate-"));
  await write("package.json", JSON.stringify({ name: "fx" }));
  await write("src/index.ts", `import { live } from "./util.js";\nlive();\n`);
  await write("src/util.ts", `export function live() {\n  helper();\n}\nfunction helper() {}\n`);
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe("necro explain --narrate (degradation)", () => {
  test("AC-2: with no API key the static trace still renders and exit is unchanged", async () => {
    const { code, stdout, stderr } = await runNoKey(["explain", "helper", "--narrate"], dir);
    expect(code).toBe(0); // same exit as a plain resolved explain
    expect(stdout).toMatch(/alive/i);
    expect(stdout).toContain("helper");
    expect(`${stderr}`).toMatch(/api key|narrat/i); // one-line degradation note
  });

  test("AC-3: --json carries narrative:null on the degraded path", async () => {
    const { code, stdout } = await runNoKey(["explain", "helper", "--narrate", "--json"], dir);
    expect(code).toBe(0);
    const parsed = JSON.parse(stdout);
    expect(parsed.status).toBe("resolved");
    expect(parsed.narrative ?? null).toBeNull();
  });
});
