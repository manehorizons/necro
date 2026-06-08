import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import type { ClassifiedFinding } from "../src/analyze/classify.js";
import { DEFAULT_CONFIG } from "../src/config.js";
import { scan } from "../src/engine/index.js";

let dir: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "necro-scan-"));
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

async function write(rel: string, contents: string): Promise<void> {
  const path = join(dir, rel);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, contents);
}

function byName(findings: ClassifiedFinding[], name: string) {
  return findings.find((f) => f.node.name === name);
}

describe("scan (end-to-end)", () => {
  test("finds dead, likely-dead, and test-only symbols; spares live code", async () => {
    await write(
      "package.json",
      JSON.stringify({ name: "fixture", devDependencies: { vitest: "^2" } }),
    );
    await write("src/index.ts", `import { liveUtil } from "./util";\nliveUtil();\n`);
    await write(
      "src/util.ts",
      `export function liveUtil() {}\n` +
        `function deadFn() {}\n` +
        `export function lonelyExport() {}\n` +
        `export function testUtil() {}\n`,
    );
    await write(
      "src/util.test.ts",
      `import { testUtil } from "./util";\ntestUtil();\n`,
    );

    const { findings } = await scan(dir, DEFAULT_CONFIG);

    expect(byName(findings, "liveUtil")).toBeUndefined();

    expect(byName(findings, "deadFn")?.tier).toBe("certain");
    expect(byName(findings, "lonelyExport")?.tier).toBe("likely");
    expect(byName(findings, "testUtil")?.verdict).toBe("test-only");
  });

  test("sorts findings worst-first (certain before test-only)", async () => {
    await write("package.json", JSON.stringify({ name: "fx", devDependencies: { vitest: "^2" } }));
    await write("src/index.ts", `export {};\n`);
    await write(
      "src/util.ts",
      `function deadFn() {}\nexport function testUtil() {}\n`,
    );
    await write("src/util.test.ts", `import { testUtil } from "./util";\ntestUtil();\n`);

    const { findings } = await scan(dir, DEFAULT_CONFIG);
    const tiers = findings.map((f) => (f.verdict === "test-only" ? "test-only" : f.tier));
    expect(tiers.indexOf("certain")).toBeLessThan(tiers.indexOf("test-only"));
  });
});
