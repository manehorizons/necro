import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { DEFAULT_CONFIG } from "../src/config.js";
import { scan } from "../src/engine/index.js";

let dir: string;
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "necro-dup-"));
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

async function write(rel: string, contents: string): Promise<void> {
  const path = join(dir, rel);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, contents);
}

// A non-trivial block, copied (with renames) across two files.
const blockA = `export function a(x: number, y: number) {
  const r = x + y;
  if (r > 0) { return r; }
  if (r < 0) { return -r; }
  return 0;
}
`;
const blockB = `export function b(p: number, q: number) {
  const s = p + q;
  if (s > 0) { return s; }
  if (s < 0) { return -s; }
  return 0;
}
`;

// minTokens low enough to catch the shared block in tests.
const cfg = { ...DEFAULT_CONFIG, duplication: { minTokens: 20 } };

describe("scan duplication axis (AC-6)", () => {
  test("reports a Type-2 clone across files; clean file is spared", async () => {
    await write("package.json", JSON.stringify({ name: "fx" }));
    await write("src/a.ts", blockA);
    await write("src/b.ts", blockB);
    await write("src/unique.ts", "export const z = 42;\n");

    const { duplication } = await scan(dir, cfg);

    expect(duplication.length).toBeGreaterThanOrEqual(1);
    const files = duplication[0]!.locations.map((l) => l.file.replace(dir, "")).sort();
    expect(files).toEqual(["/src/a.ts", "/src/b.ts"]);
    expect(duplication.flatMap((d) => d.locations).some((l) => l.file.endsWith("unique.ts"))).toBe(
      false,
    );
  });

  test("a clone across two adjacent functions is split at the boundary, not one cross-function window (AC-1)", async () => {
    // funcOne (lines 1-6) and funcTwo (lines 7-12) are structurally distinct, so
    // the only match is a.ts-whole vs b.ts-whole — which spans both functions
    // unless the detector is given unit boundaries.
    const funcOne = `export function alpha(x: number, y: number) {
  const sum = x + y;
  const prod = x * y;
  if (sum > prod) { return sum; }
  return prod;
}
`;
    const funcTwo = `export function beta(items: string[]) {
  let total = 0;
  for (const it of items) { total += it.length; }
  while (total > 100) { total -= 10; }
  return total;
}
`;
    const both = funcOne + funcTwo;
    await write("package.json", JSON.stringify({ name: "fx" }));
    await write("src/a.ts", both);
    await write("src/b.ts", both);

    const { duplication } = await scan(dir, { ...DEFAULT_CONFIG, duplication: { minTokens: 15 } });

    const K = 6; // funcOne occupies lines 1..6; funcTwo starts at line 7
    const straddles = duplication.some((d) =>
      d.locations.some((l) => l.startLine <= K && l.endLine >= K + 1),
    );
    expect(straddles).toBe(false);
    // The merged cross-function window splits into one clone per function.
    expect(duplication.length).toBe(2);
  });

  test("complexity:false skips duplication (fix path)", async () => {
    await write("package.json", JSON.stringify({ name: "fx" }));
    await write("src/a.ts", blockA);
    await write("src/b.ts", blockB);

    const { duplication } = await scan(dir, cfg, { complexity: false });
    expect(duplication).toEqual([]);
  });
});
