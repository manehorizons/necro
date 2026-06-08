import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { DEFAULT_CONFIG } from "../src/config.js";
import { scan } from "../src/engine/index.js";

let dir: string;
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "necro-hot-"));
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

async function write(rel: string, contents: string): Promise<void> {
  const path = join(dir, rel);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, contents);
}

describe("scan hotspots axis (AC-6)", () => {
  test("ranks a complex, uncovered function top with a CRAP score", async () => {
    await write("package.json", JSON.stringify({ name: "fx" }));
    // cyclomatic 5 (4 ifs), spanning lines 1..6
    await write(
      "src/risky.ts",
      "export function risky(a: number) {\n  if (a) {}\n  if (a) {}\n  if (a) {}\n  if (a) {}\n}\n",
    );
    await write("src/calm.ts", "export function calm(a: number) {\n  return a;\n}\n");
    // lcov: risky fully uncovered, calm covered
    await write(
      "coverage/lcov.info",
      [
        "SF:src/risky.ts",
        "DA:1,0",
        "DA:2,0",
        "DA:3,0",
        "DA:4,0",
        "DA:5,0",
        "end_of_record",
        "SF:src/calm.ts",
        "DA:1,4",
        "DA:2,4",
        "end_of_record",
      ].join("\n"),
    );

    const { hotspots } = await scan(dir, DEFAULT_CONFIG);

    const top = hotspots[0];
    expect(top?.name).toBe("risky");
    expect(top?.complexity).toBe(5);
    expect(top?.coverage).toBe(0);
    expect(top?.crap).toBe(5 * 5 * 1 + 5); // 30
    expect(top?.churn).toBeNull(); // tmp dir is not a git repo
  });

  test("complexity:false skips hotspots (fix path)", async () => {
    await write("package.json", JSON.stringify({ name: "fx" }));
    await write("src/risky.ts", "export function risky(a: number) {\n  if (a) {}\n}\n");

    const { hotspots } = await scan(dir, DEFAULT_CONFIG, { complexity: false });
    expect(hotspots).toEqual([]);
  });
});
