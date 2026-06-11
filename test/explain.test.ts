import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { DEFAULT_CONFIG } from "../src/config.js";
import { explain } from "../src/engine/explain.js";

let dir: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "necro-explain-"));
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

async function write(rel: string, contents: string): Promise<void> {
  const path = join(dir, rel);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, contents);
}

describe("explain", () => {
  test("AC-1: alive symbol resolves with a witness chain ending at the target", async () => {
    await write("src/index.ts", `import { live } from "./util";\nlive();\n`);
    await write(
      "src/util.ts",
      `export function live() {\n  helper();\n}\nfunction helper() {}\n`,
    );

    const result = await explain(dir, DEFAULT_CONFIG, "helper");
    if (result.status !== "resolved") throw new Error(`expected resolved, got ${result.status}`);

    expect(result.reachability).toBe("alive");
    expect(result.witness).not.toBeNull();
    const chain = result.witness ?? [];
    expect(chain[0]?.id).toContain("src/index.ts"); // entry seed first (file id, no symbol)
    expect(chain[0]?.file).toBeNull();
    expect(chain[chain.length - 1]?.id).toBe(result.symbol.id); // target last
    expect(chain.some((s) => s.name === "live")).toBe(true);
    expect(result.inbound).toEqual([]);
  });

  test("AC-2: dead symbol reports unreachable + inbound referrers annotated by verdict", async () => {
    await write("src/index.ts", `import { live } from "./util";\nlive();\n`);
    await write(
      "src/util.ts",
      `export function live() {}\n` +
        `export function orphan() {}\n` +
        `export function deadCaller() {\n  orphan();\n}\n` +
        `export function lonely() {}\n`,
    );

    const orphan = await explain(dir, DEFAULT_CONFIG, "orphan");
    if (orphan.status !== "resolved") throw new Error("expected resolved");
    expect(orphan.reachability).toBe("dead");
    expect(orphan.witness).toBeNull();
    const caller = orphan.inbound.find((r) => r.name === "deadCaller");
    expect(caller).toBeDefined();
    expect(caller?.reachability).toBe("dead");

    const lonely = await explain(dir, DEFAULT_CONFIG, "lonely");
    if (lonely.status !== "resolved") throw new Error("expected resolved");
    expect(lonely.reachability).toBe("dead");
    expect(lonely.inbound).toEqual([]);
  });

  test("AC-3: test-only symbol traces through test edges", async () => {
    // A vitest dep makes the test-runner plugin recognize `*.test.ts` as test entries.
    await write("package.json", `{"devDependencies":{"vitest":"2.0.0"}}\n`);
    await write("src/index.ts", `export function root() {}\n`);
    await write("src/util.ts", `export function testOnly() {}\n`);
    await write(
      "src/util.test.ts",
      `import { testOnly } from "./util";\ntestOnly();\n`,
    );

    const result = await explain(dir, DEFAULT_CONFIG, "testOnly");
    if (result.status !== "resolved") throw new Error("expected resolved");
    expect(result.reachability).toBe("test-only");
    expect(result.witness).not.toBeNull();
    expect(result.witness?.[result.witness.length - 1]?.id).toBe(result.symbol.id);
  });

  test("AC-3: an ambiguous bare name returns the candidate list", async () => {
    await write("src/a.ts", `export function dup() {}\n`);
    await write("src/b.ts", `export function dup() {}\n`);
    await write("src/index.ts", `export function root() {}\n`);

    const result = await explain(dir, DEFAULT_CONFIG, "dup");
    if (result.status !== "ambiguous") throw new Error(`expected ambiguous, got ${result.status}`);
    expect(result.candidates).toHaveLength(2);
    expect(result.candidates.every((c) => c.name === "dup")).toBe(true);
  });

  test("AC-3: a file-qualified query disambiguates", async () => {
    await write("src/a.ts", `export function dup() {}\n`);
    await write("src/b.ts", `export function dup() {}\n`);

    const result = await explain(dir, DEFAULT_CONFIG, "a.ts:dup");
    if (result.status !== "resolved") throw new Error(`expected resolved, got ${result.status}`);
    expect(result.symbol.file).toContain("src/a.ts");
  });

  test("AC-3: an unknown name returns not-found", async () => {
    await write("src/index.ts", `export function root() {}\n`);
    const result = await explain(dir, DEFAULT_CONFIG, "doesNotExist");
    expect(result.status).toBe("not-found");
  });
});
