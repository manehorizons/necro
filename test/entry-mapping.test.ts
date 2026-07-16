import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { mapDistToSrc, readTsconfigMapping } from "../src/engine/entry-mapping.js";

let dir: string;
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "necro-entrymap-"));
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

async function write(rel: string, contents: string): Promise<void> {
  const path = join(dir, rel);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, contents);
}

describe("readTsconfigMapping (AC-1)", () => {
  test("reads outDir/rootDir from tsconfig.json", async () => {
    await write("tsconfig.json", JSON.stringify({ compilerOptions: { outDir: "dist", rootDir: "src" } }));
    expect(await readTsconfigMapping(dir)).toEqual({ outDir: "dist", rootDir: "src" });
  });

  test("returns {} when there is no tsconfig.json", async () => {
    expect(await readTsconfigMapping(dir)).toEqual({});
  });

  test("returns {} on unparseable tsconfig.json", async () => {
    await write("tsconfig.json", "{not json");
    expect(await readTsconfigMapping(dir)).toEqual({});
  });

  test("resolves one level of a local extends chain", async () => {
    await write("tsconfig.base.json", JSON.stringify({ compilerOptions: { outDir: "dist", rootDir: "src" } }));
    await write("tsconfig.json", JSON.stringify({ extends: "./tsconfig.base.json" }));
    expect(await readTsconfigMapping(dir)).toEqual({ outDir: "dist", rootDir: "src" });
  });

  test("child compilerOptions win over the extended parent's", async () => {
    await write("tsconfig.base.json", JSON.stringify({ compilerOptions: { outDir: "build", rootDir: "lib" } }));
    await write("tsconfig.json", JSON.stringify({ extends: "./tsconfig.base.json", compilerOptions: { outDir: "dist" } }));
    expect(await readTsconfigMapping(dir)).toEqual({ outDir: "dist", rootDir: "lib" });
  });
});

describe("mapDistToSrc (AC-1)", () => {
  test("maps a manifest bin path via tsconfig outDir/rootDir", async () => {
    await write("src/cli.ts", "export {};");
    const fileSet = new Set([join(dir, "src/cli.ts")]);
    const mapped = mapDistToSrc("dist/cli.js", { outDir: "dist", rootDir: "src" }, dir, fileSet);
    expect(mapped).toBe("src/cli.ts");
  });

  test("falls back to the same basename with .tsx when the direct .ts swap misses", async () => {
    await write("src/app.tsx", "export {};");
    const fileSet = new Set([join(dir, "src/app.tsx")]);
    const mapped = mapDistToSrc("dist/app.js", { outDir: "dist", rootDir: "src" }, dir, fileSet);
    expect(mapped).toBe("src/app.tsx");
  });

  test("uses the dist|build|out -> src heuristic when there is no tsconfig mapping", async () => {
    await write("src/index.ts", "export {};");
    const fileSet = new Set([join(dir, "src/index.ts")]);
    const mapped = mapDistToSrc("dist/index.js", {}, dir, fileSet);
    expect(mapped).toBe("src/index.ts");
  });

  test("heuristic also handles build/ and out/ prefixes", async () => {
    await write("src/a.ts", "export {};");
    await write("src/b.ts", "export {};");
    const fileSet = new Set([join(dir, "src/a.ts"), join(dir, "src/b.ts")]);
    expect(mapDistToSrc("build/a.js", {}, dir, fileSet)).toBe("src/a.ts");
    expect(mapDistToSrc("out/b.js", {}, dir, fileSet)).toBe("src/b.ts");
  });

  test("never guesses into a path that was not discovered", async () => {
    const fileSet = new Set<string>();
    expect(mapDistToSrc("dist/cli.js", { outDir: "dist", rootDir: "src" }, dir, fileSet)).toBeUndefined();
    expect(mapDistToSrc("dist/index.js", {}, dir, fileSet)).toBeUndefined();
  });
});
