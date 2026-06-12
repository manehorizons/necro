import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { DEFAULT_CONFIG } from "../src/config.js";
import { verifyRemovals } from "../src/engine/verify-removal.js";
import type { FileEdit, VerifyRunner } from "../src/refactor/verify.js";

let dir: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "necro-verify-removal-"));
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

async function write(rel: string, contents: string): Promise<void> {
  const path = join(dir, rel);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, contents);
}

/**
 * A fake runner factory: one fresh runner per symbol. A check is **red** when
 * the verified edit set touches a file whose path contains `redToken` (stands
 * in for "tsc broke"), letting the test drive per-symbol verdicts without a
 * real worktree or compiler. Records each root it was built for (proving a
 * fresh worktree per symbol) and the relative file paths it was asked to write.
 */
function fakeRunnerFactory(redToken: string, calls: { roots: string[]; files: string[][] }) {
  return (root: string): VerifyRunner => {
    calls.roots.push(root);
    const written: FileEdit[] = [];
    return {
      createWorktree: async () => "/wt",
      writeEdit: async (_wt, edit) => {
        written.push(edit);
      },
      runCheck: async () => {
        calls.files.push(written.map((e) => e.file));
        const broke = written.some((e) => e.file.includes(redToken));
        return broke
          ? { ok: false, output: `tsc: ${redToken} is still referenced` }
          : { ok: true, output: "" };
      },
      removeWorktree: async () => {},
    };
  };
}

// `safe` (src/util.ts) is unused → deleting it is safe. `breaker` (src/dep.ts)
// is imported and called from the entry → deleting it breaks the build. Each
// lives in its own file so a fresh runner can be keyed by the edited path.
async function writeFixture(): Promise<void> {
  await write("src/index.ts", `import { breaker } from "./dep";\nbreaker();\n`);
  await write("src/dep.ts", `export function breaker() {\n  return 2;\n}\n`);
  await write("src/util.ts", `export function safe() {\n  return 1;\n}\n`);
}

describe("verify-removal engine", () => {
  test("AC-2: a safe removal badges green; a breaking removal badges red with the failing output", async () => {
    await writeFixture();
    const calls = { roots: [] as string[], files: [] as string[][] };
    const results = await verifyRemovals(dir, DEFAULT_CONFIG, ["safe", "breaker"], {
      repoRoot: dir,
      checks: ["typecheck"],
      runnerFactory: fakeRunnerFactory("dep.ts", calls),
    });

    const safe = results.find((r) => r.symbol === "safe");
    const breaker = results.find((r) => r.symbol === "breaker");
    expect(safe?.status).toBe("green");
    expect(breaker?.status).toBe("red");
    expect(breaker?.output).toContain("dep.ts is still referenced");
    // edits are relativized to the repo root (no absolute paths leak to the runner)
    expect(calls.files.flat().every((f) => !f.startsWith("/"))).toBe(true);
  });

  test("AC-3: symbols are verified independently — a fresh worktree each, an unknown query is unresolved", async () => {
    await writeFixture();
    const calls = { roots: [] as string[], files: [] as string[][] };
    const results = await verifyRemovals(
      dir,
      DEFAULT_CONFIG,
      ["safe", "nope_does_not_exist", "breaker"],
      { repoRoot: dir, checks: ["typecheck"], runnerFactory: fakeRunnerFactory("dep.ts", calls) },
    );

    expect(results.map((r) => ({ symbol: r.symbol, status: r.status }))).toEqual([
      { symbol: "safe", status: "green" },
      { symbol: "nope_does_not_exist", status: "unresolved" },
      { symbol: "breaker", status: "red" },
    ]);
    // one fresh runner (worktree) per *resolved* symbol; the unresolved one runs nothing
    expect(calls.roots).toHaveLength(2);
    // breaker's red verdict did not taint safe's green verdict (independence)
    expect(results.find((r) => r.symbol === "safe")?.status).toBe("green");
  });
});
