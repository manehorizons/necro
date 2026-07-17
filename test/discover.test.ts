import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { DEFAULT_CONFIG } from "../src/config.js";
import { discoverFiles } from "../src/discover.js";

let dir: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "necro-discover-"));
  await mkdir(join(dir, "src"), { recursive: true });
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe("discoverFiles (AC-1, AC-3)", () => {
  test("discovers .js/.jsx/.mts/.cts alongside .ts/.tsx with the default config", async () => {
    await writeFile(join(dir, "src", "a.ts"), "");
    await writeFile(join(dir, "src", "b.tsx"), "");
    await writeFile(join(dir, "src", "c.js"), "");
    await writeFile(join(dir, "src", "d.jsx"), "");
    await writeFile(join(dir, "src", "e.mts"), "");
    await writeFile(join(dir, "src", "f.cts"), "");

    const files = await discoverFiles(dir, DEFAULT_CONFIG);
    const names = files.map((f) => f.split("/").pop()).sort();
    expect(names).toEqual(["a.ts", "b.tsx", "c.js", "d.jsx", "e.mts", "f.cts"]);
  });

  test("skips .d.ts, .d.mts, and .d.cts declaration files", async () => {
    await writeFile(join(dir, "src", "real.mts"), "");
    await writeFile(join(dir, "src", "real.cts"), "");
    await writeFile(join(dir, "src", "types.d.ts"), "");
    await writeFile(join(dir, "src", "types.d.mts"), "");
    await writeFile(join(dir, "src", "types.d.cts"), "");

    const files = await discoverFiles(dir, DEFAULT_CONFIG);
    const names = files.map((f) => f.split("/").pop()).sort();
    expect(names).toEqual(["real.cts", "real.mts"]);
  });
});
