import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { DEFAULT_CONFIG } from "../src/config.js";
import { scan } from "../src/engine/index.js";

let dir: string;
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "necro-cx-"));
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

async function write(rel: string, contents: string): Promise<void> {
  const path = join(dir, rel);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, contents);
}

/** A function nested 4 levels deep — over the default nesting threshold (3). */
const DEEPLY_NESTED = `export function tangled(a: number[]) {
  for (const x of a) {
    if (x > 0) {
      while (x > 1) {
        if (x % 2) {
          x;
        }
      }
    }
  }
}
`;

describe("scan complexity axis (AC-1, AC-6)", () => {
  test("surfaces complex functions alongside dead code; spares simple ones", async () => {
    await write("package.json", JSON.stringify({ name: "fx" }));
    await write("src/index.ts", `import { tangled } from "./tangled.js";\ntangled([1]);\n`);
    await write("src/tangled.ts", DEEPLY_NESTED);
    await write("src/simple.ts", `export function ok(a: number) {\n  return a + 1;\n}\n`);
    await write("src/dead.ts", `function deadFn() {}\n`);

    const { findings, complexity } = await scan(dir, DEFAULT_CONFIG);

    // complexity axis flagged the nested function...
    const tangled = complexity.filter((c) => c.name === "tangled");
    expect(tangled.some((c) => c.detector === "nesting")).toBe(true);
    // ...but not the simple one.
    expect(complexity.some((c) => c.name === "ok")).toBe(false);
    // dead-code axis still works independently.
    expect(findings.some((f) => f.node.name === "deadFn")).toBe(true);
  });

  test("complexity axis can be disabled (fix path)", async () => {
    await write("package.json", JSON.stringify({ name: "fx" }));
    await write("src/tangled.ts", DEEPLY_NESTED);

    const { complexity } = await scan(dir, DEFAULT_CONFIG, { complexity: false });
    expect(complexity).toEqual([]);
  });
});
