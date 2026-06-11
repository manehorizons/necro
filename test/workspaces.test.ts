import { mkdtemp, rm, writeFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { resolveWorkspaces } from "../src/engine/workspaces.js";

let dir: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "necro-ws-"));
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

async function member(rel: string, name: string, main: string, body: string): Promise<void> {
  const d = join(dir, rel);
  await mkdir(join(d, "src"), { recursive: true });
  await writeFile(join(d, "package.json"), JSON.stringify({ name, main }));
  await writeFile(join(d, main), body);
}

describe("resolveWorkspaces", () => {
  test("returns empty info when no workspaces are declared", async () => {
    await writeFile(join(dir, "package.json"), JSON.stringify({ name: "solo" }));
    const info = await resolveWorkspaces(dir);
    expect(info.packagePaths.size).toBe(0);
    expect(info.entryFiles).toEqual([]);
  });

  test("maps npm/yarn `workspaces` member names to their entry files", async () => {
    await writeFile(
      join(dir, "package.json"),
      JSON.stringify({ name: "root", private: true, workspaces: ["packages/*"] }),
    );
    await member("packages/core", "@ws/core", "src/index.ts", "export const a = 1;\n");
    await member("packages/app", "@ws/app", "src/index.ts", "export const b = 2;\n");

    const info = await resolveWorkspaces(dir);
    expect([...info.packagePaths.keys()].sort()).toEqual(["@ws/app", "@ws/core"]);
    expect(info.packagePaths.get("@ws/core")).toBe(join(dir, "packages/core/src/index.ts"));
    expect(info.entryFiles.sort()).toEqual(
      [
        join(dir, "packages/app/src/index.ts"),
        join(dir, "packages/core/src/index.ts"),
      ].sort(),
    );
  });

  test("supports the npm `workspaces.packages` object form", async () => {
    await writeFile(
      join(dir, "package.json"),
      JSON.stringify({ name: "root", workspaces: { packages: ["packages/*"] } }),
    );
    await member("packages/core", "@ws/core", "src/index.ts", "export const a = 1;\n");
    const info = await resolveWorkspaces(dir);
    expect(info.packagePaths.get("@ws/core")).toBe(join(dir, "packages/core/src/index.ts"));
  });

  test("parses pnpm-workspace.yaml `packages:` globs", async () => {
    await writeFile(join(dir, "package.json"), JSON.stringify({ name: "root" }));
    await writeFile(
      join(dir, "pnpm-workspace.yaml"),
      "packages:\n  - 'packages/*'\n  - \"libs/*\"\n",
    );
    await member("packages/core", "@ws/core", "src/index.ts", "export const a = 1;\n");
    await member("libs/util", "@ws/util", "src/index.ts", "export const u = 3;\n");

    const info = await resolveWorkspaces(dir);
    expect([...info.packagePaths.keys()].sort()).toEqual(["@ws/core", "@ws/util"]);
  });

  test("skips members with a missing/unreadable manifest or entry", async () => {
    await writeFile(
      join(dir, "package.json"),
      JSON.stringify({ name: "root", workspaces: ["packages/*"] }),
    );
    await member("packages/core", "@ws/core", "src/index.ts", "export const a = 1;\n");
    // A member dir with no package.json — must not throw, just be skipped.
    await mkdir(join(dir, "packages/broken"), { recursive: true });

    const info = await resolveWorkspaces(dir);
    expect([...info.packagePaths.keys()]).toEqual(["@ws/core"]);
  });
});
