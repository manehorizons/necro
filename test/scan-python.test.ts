import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { DEFAULT_CONFIG } from "../src/config.js";
import { scan } from "../src/engine/index.js";

let dir: string;
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "necro-py-"));
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
const DEEPLY_NESTED_PY = `def tangled(a, items):
    if a:
        for x in items:
            if x > 0:
                while x > 1:
                    x -= 1
            elif x < 0:
                pass
    return a
`;

describe("scan on a Python-only target (AC-6)", () => {
  test("produces sane, non-empty complexity output and does not crash", async () => {
    await write("necro.config.json", JSON.stringify({ include: ["**/*.py"] }));
    await write("src/tangled.py", DEEPLY_NESTED_PY);
    await write("src/simple.py", "def ok(a):\n    return a + 1\n");

    const config = { ...DEFAULT_CONFIG, include: ["**/*.py"] };
    const { complexity, duplication, hotspots, findings } = await scan(dir, config);

    // complexity axis flagged the nested function...
    const tangled = complexity.filter((c) => c.name === "tangled");
    expect(tangled.some((c) => c.detector === "nesting")).toBe(true);
    // ...but not the simple one.
    expect(complexity.some((c) => c.name === "ok")).toBe(false);

    // duplication/hotspots/dead-code axes run without error against Python
    // source (ts-morph's TS-specific reachability graph sees .py files as
    // zero-declaration source — verified: no crash, just no reachability
    // signal for Python yet, per this phase's scope).
    expect(Array.isArray(duplication)).toBe(true);
    expect(Array.isArray(hotspots)).toBe(true);
    expect(Array.isArray(findings)).toBe(true);
  });
});

describe("full existing suite regression (AC-6)", () => {
  test("a TS-only target is completely unaffected by the widened parser/tokenizer/discovery", async () => {
    await write("package.json", JSON.stringify({ name: "fx" }));
    await write("src/index.ts", `import { tangled } from "./tangled.js";\ntangled([1]);\n`);
    await write(
      "src/tangled.ts",
      "export function tangled(a) {\n  for (const x of a) {\n    if (x > 0) {\n      while (x > 1) {\n        if (x % 2) {\n          x;\n        }\n      }\n    }\n  }\n}\n",
    );
    await write("src/dead.ts", "function deadFn() {}\n");

    const { findings, complexity } = await scan(dir, DEFAULT_CONFIG);
    expect(complexity.some((c) => c.name === "tangled" && c.detector === "nesting")).toBe(true);
    expect(findings.some((f) => f.node.name === "deadFn")).toBe(true);
  });
});
