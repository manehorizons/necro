import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import type { ClassifiedFinding } from "../src/analyze/classify.js";
import { DEFAULT_CONFIG } from "../src/config.js";
import { scan } from "../src/engine/index.js";
import { toJson } from "../src/report/json.js";

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

describe("scan with coverage ingestion", () => {
  // `dynamicallyUsed` has 0 static references but the lcov report shows runtime
  // hits — a real dynamic-reach case. `deadFn` has 0 refs and 0 hits.
  async function writeFixture(): Promise<void> {
    await write("package.json", JSON.stringify({ name: "fx" }));
    await write("src/index.ts", `import { liveUtil } from "./util.js";\nliveUtil();\n`);
    await write(
      "src/util.ts",
      `export function liveUtil() {}\nfunction dynamicallyUsed() {}\nfunction deadFn() {}\n`,
    );
  }

  async function writeLcov(): Promise<void> {
    await write(
      "coverage/lcov.info",
      [
        "SF:src/util.ts",
        "FN:1,liveUtil",
        "FN:2,dynamicallyUsed",
        "FN:3,deadFn",
        "FNDA:9,liveUtil",
        "FNDA:4,dynamicallyUsed",
        "FNDA:0,deadFn",
        "DA:1,9",
        "DA:2,4",
        "DA:3,0",
        "end_of_record",
      ].join("\n"),
    );
  }

  test("runtime-hit-but-unreferenced symbol is downgraded to maybe with evidence (AC-3, AC-5)", async () => {
    await writeFixture();
    await writeLcov();

    const { findings } = await scan(dir, DEFAULT_CONFIG);

    const dyn = byName(findings, "dynamicallyUsed");
    expect(dyn?.tier).toBe("maybe");
    expect(dyn?.autoFixEligible).toBe(false);
    expect(dyn?.evidence.map((e) => e.text)).toContainEqual(
      "executed at runtime (4 hits) despite 0 static refs — reached dynamically",
    );

    // A genuinely-dead, uncovered symbol stays certain and now shows the miss.
    const dead = byName(findings, "deadFn");
    expect(dead?.tier).toBe("certain");
    expect(dead?.evidence).toContainEqual({ ok: true, text: "0 coverage hits (lcov)" });
  });

  test("--json carries the coverage signal in the evidence array (AC-5)", async () => {
    await writeFixture();
    await writeLcov();
    const { findings, complexity, hotspots } = await scan(dir, DEFAULT_CONFIG);
    const json = JSON.parse(toJson({ findings, complexity, hotspots })) as {
      findings: Array<{ name: string; evidence: { text: string }[] }>;
    };
    const dyn = json.findings.find((f) => f.name === "dynamicallyUsed");
    expect(dyn?.evidence.some((e) => e.text.startsWith("executed at runtime"))).toBe(true);
  });

  test("no coverage report → byte-identical to phase 01 (AC-1, AC-6)", async () => {
    await writeFixture();
    const { findings } = await scan(dir, DEFAULT_CONFIG);

    const dead = byName(findings, "deadFn");
    expect(dead?.tier).toBe("certain");
    expect(dead?.evidence).toContainEqual({ ok: null, text: "coverage: not available" });
    // Without coverage, the dynamic-reach symbol is indistinguishable → certain.
    expect(byName(findings, "dynamicallyUsed")?.tier).toBe("certain");
  });
});
