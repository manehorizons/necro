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

// A repo with one exported-but-unreachable symbol ("orphan") — an
// exported dead export classifies as `likely` (medium severity), the
// exact case `--fail-on medium` is meant to gate.
async function fixture(): Promise<void> {
  await write("package.json", JSON.stringify({ name: "fx" }));
  await write("src/index.ts", `import { live } from "./util.js";\nlive();\n`);
  await write(
    "src/util.ts",
    `export function live() {}\nexport function orphan() {}\n`,
  );
}

beforeAll(async () => {
  await exec("npm", ["run", "build"], { cwd: repoRoot });
}, 120_000);

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "necro-cli-baseline-"));
  await fixture();
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe("necro baseline", () => {
  test("AC-1: writes .necro-baseline.json recording current findings and exits 0", async () => {
    const { code, stdout } = await run(["baseline"], dir);
    expect(code).toBe(0);
    expect(stdout).toMatch(/baseline: \d+ finding/);

    const raw = JSON.parse(await readFile(join(dir, ".necro-baseline.json"), "utf8"));
    expect(raw.keys.some((k: string) => k.includes("orphan"))).toBe(true);
  });
});

describe("necro scan with a baseline", () => {
  // Two sequential full CLI invocations (node startup + tree-sitter WASM load
  // each time) push this right up against vitest's 5s default on a loaded CI
  // runner — bump it rather than race it.
  test(
    "AC-2: baselined findings are excluded and --fail-on medium passes",
    async () => {
      await run(["baseline"], dir);

      const scanned = await run(["scan", "--json", "--fail-on", "medium"], dir);
      expect(scanned.code).toBe(0);
      const parsed = JSON.parse(scanned.stdout);
      expect(
        parsed.findings.some((f: { name: string }) => f.name === "orphan"),
      ).toBe(false);
    },
    15000,
  );

  test(
    "AC-3: a finding introduced after baselining still shows and still gates",
    async () => {
      await run(["baseline"], dir);

      // introduce a second, unbaselined dead export
      await write(
        "src/util.ts",
        `export function live() {}\nexport function orphan() {}\nexport function orphan2() {}\n`,
      );

      const scanned = await run(["scan", "--json", "--fail-on", "medium"], dir);
      expect(scanned.code).toBe(1);
      const parsed = JSON.parse(scanned.stdout);
      const names = parsed.findings.map((f: { name: string }) => f.name);
      expect(names).toContain("orphan2");
      expect(names).not.toContain("orphan");
    },
    15000,
  );
});

describe("necro scan with // necro-ignore", () => {
  test("AC-4: a finding with a necro-ignore comment above it is suppressed without any baseline", async () => {
    await write(
      "src/util.ts",
      `export function live() {}\n// necro-ignore\nexport function orphan() {}\n`,
    );

    const scanned = await run(["scan", "--json", "--fail-on", "medium"], dir);
    expect(scanned.code).toBe(0);
    const parsed = JSON.parse(scanned.stdout);
    expect(parsed.findings.some((f: { name: string }) => f.name === "orphan")).toBe(
      false,
    );
  });

  test("AC-4: the same finding is reported without the necro-ignore comment", async () => {
    const scanned = await run(["scan", "--json", "--fail-on", "medium"], dir);
    expect(scanned.code).toBe(1);
    const parsed = JSON.parse(scanned.stdout);
    expect(parsed.findings.some((f: { name: string }) => f.name === "orphan")).toBe(
      true,
    );
  });
});
