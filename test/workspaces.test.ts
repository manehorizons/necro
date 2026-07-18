import { mkdtemp, rm, writeFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { DEFAULT_CONFIG } from "../src/config.js";
import { discoverFiles } from "../src/discover.js";
import { resolveWorkspaces } from "../src/engine/workspaces.js";

let dir: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "necro-ws-"));
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

/** Real discovery, matching what `buildReachabilityModel` passes in production. */
async function discover(): Promise<string[]> {
  return discoverFiles(dir, DEFAULT_CONFIG);
}

async function member(rel: string, name: string, main: string, body: string): Promise<void> {
  const d = join(dir, rel);
  await mkdir(join(d, "src"), { recursive: true });
  await writeFile(join(d, "package.json"), JSON.stringify({ name, main }));
  await writeFile(join(d, main), body);
}

describe("resolveWorkspaces", () => {
  test("returns empty info when no workspaces are declared", async () => {
    await writeFile(join(dir, "package.json"), JSON.stringify({ name: "solo" }));
    const info = await resolveWorkspaces(dir, await discover());
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

    const info = await resolveWorkspaces(dir, await discover());
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
    const info = await resolveWorkspaces(dir, await discover());
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

    const info = await resolveWorkspaces(dir, await discover());
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

    const info = await resolveWorkspaces(dir, await discover());
    expect([...info.packagePaths.keys()]).toEqual(["@ws/core"]);
  });

  test("falls back through mapDistToSrc when a member's manifest entry doesn't exist but a real source file does", async () => {
    await writeFile(
      join(dir, "package.json"),
      JSON.stringify({ name: "root", workspaces: ["packages/*"] }),
    );
    const d = join(dir, "packages/core");
    await mkdir(join(d, "src"), { recursive: true });
    await writeFile(join(d, "package.json"), JSON.stringify({ name: "@ws/core", main: "dist/index.js" }));
    await writeFile(join(d, "src/index.ts"), "export const a = 1;\n");
    // No dist/ written — `main` points at a file that doesn't exist on disk, the
    // normal state of a fresh, un-built monorepo checkout (the regression this
    // fixture pins).

    const info = await resolveWorkspaces(dir, await discover());
    expect(info.packagePaths.get("@ws/core")).toBe(join(d, "src/index.ts"));
    expect(info.entryFiles).toEqual([join(d, "src/index.ts")]);
  });

  test("resolves via a member's own tsconfig outDir/rootDir mapping, not the monorepo root's", async () => {
    await writeFile(
      join(dir, "package.json"),
      JSON.stringify({ name: "root", workspaces: ["packages/*"] }),
    );
    const d = join(dir, "packages/core");
    await mkdir(join(d, "source"), { recursive: true });
    await writeFile(join(d, "package.json"), JSON.stringify({ name: "@ws/core", main: "lib/cli.js" }));
    // outDir "lib" (not "dist"/"build"/"out") so only this member's own tsconfig
    // — not the generic dist→src heuristic — can resolve it.
    await writeFile(
      join(d, "tsconfig.json"),
      JSON.stringify({ compilerOptions: { outDir: "lib", rootDir: "source" } }),
    );
    await writeFile(join(d, "source/cli.ts"), "export const c = 1;\n");

    const info = await resolveWorkspaces(dir, await discover());
    expect(info.packagePaths.get("@ws/core")).toBe(join(d, "source/cli.ts"));
  });

  test("prefers a manifest entry that exists on disk over the conventional fallback", async () => {
    await writeFile(
      join(dir, "package.json"),
      JSON.stringify({ name: "root", workspaces: ["packages/*"] }),
    );
    const d = join(dir, "packages/core");
    await mkdir(join(d, "src"), { recursive: true });
    await writeFile(join(d, "package.json"), JSON.stringify({ name: "@ws/core", main: "entry.js" }));
    await writeFile(join(d, "entry.js"), "exports.a = 1;\n");
    // A conventional entry is also present — the manifest hit must win, not this.
    await writeFile(join(d, "src/index.ts"), "export const a = 1;\n");

    const info = await resolveWorkspaces(dir, await discover());
    expect(info.packagePaths.get("@ws/core")).toBe(join(d, "entry.js"));
  });

  test("skips a member with source files but no resolvable entry, without throwing", async () => {
    await writeFile(
      join(dir, "package.json"),
      JSON.stringify({ name: "root", workspaces: ["packages/*"] }),
    );
    const d = join(dir, "packages/core");
    await mkdir(join(d, "src"), { recursive: true });
    await writeFile(join(d, "package.json"), JSON.stringify({ name: "@ws/core", main: "dist/index.js" }));
    // Present, but neither the manifest path, a mapped path, nor a conventional
    // name (`index.ts`/`main.ts`) — necro must skip this member cleanly.
    await writeFile(join(d, "src/helpers.ts"), "export const h = 1;\n");

    const info = await resolveWorkspaces(dir, await discover());
    expect([...info.packagePaths.keys()]).toEqual([]);
    expect(info.entryFiles).toEqual([]);
  });
});
