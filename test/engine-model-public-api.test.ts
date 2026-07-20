import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { DEFAULT_CONFIG } from "../src/config.js";
import { scan } from "../src/engine/index.js";

let dir: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "necro-model-public-api-"));
  await mkdir(join(dir, "src"), { recursive: true });
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

async function writePackageJson(fields: Record<string, unknown>) {
  await writeFile(
    join(dir, "package.json"),
    JSON.stringify({ name: "test-pkg", main: "src/index.ts", ...fields }),
  );
}

describe("TS/JS publicApiIds quarantine (AC-1, AC-3)", () => {
  test("a symbol exported only through the manifest entry's barrel demotes to maybe with truthful evidence", async () => {
    await writePackageJson({});
    await writeFile(
      join(dir, "src", "index.ts"),
      "export function publicFn() { return 1; }\n",
    );

    const result = await scan(dir, DEFAULT_CONFIG, { complexity: false });
    const finding = result.findings.find((f) => f.node.name === "publicFn");

    expect(finding).toBeDefined();
    expect(finding?.tier).toBe("maybe");
    expect(finding?.autoFixEligible).toBe(false);
    expect(finding?.evidence).toContainEqual({
      ok: false,
      text: "in package.json exports — external consumers invisible",
    });
  });
});

describe("TS/JS publicApiIds regression guard (AC-2)", () => {
  test("private: true — same symbol classifies exactly as before this phase", async () => {
    await writePackageJson({ private: true });
    await writeFile(
      join(dir, "src", "index.ts"),
      "export function publicFn() { return 1; }\n",
    );

    const result = await scan(dir, DEFAULT_CONFIG, { complexity: false });
    const finding = result.findings.find((f) => f.node.name === "publicFn");

    expect(finding).toBeDefined();
    expect(finding?.tier).toBe("likely");
    expect(finding?.evidence).toContainEqual({
      ok: true,
      text: "not in package.json exports",
    });
  });

  test("no package.json at all — same symbol classifies exactly as before this phase", async () => {
    await writeFile(
      join(dir, "src", "index.ts"),
      "export function publicFn() { return 1; }\n",
    );

    const result = await scan(dir, DEFAULT_CONFIG, { complexity: false });
    const finding = result.findings.find((f) => f.node.name === "publicFn");

    expect(finding).toBeDefined();
    expect(finding?.tier).toBe("likely");
    expect(finding?.evidence).toContainEqual({
      ok: true,
      text: "not in package.json exports",
    });
  });
});
