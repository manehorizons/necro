import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { DEFAULT_CONFIG } from "../src/config.js";
import { explain } from "../src/engine/explain.js";

let dir: string;
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "necro-py-explain-"));
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

async function write(rel: string, contents: string): Promise<void> {
  const path = join(dir, rel);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, contents);
}

async function writeFixture(): Promise<void> {
  await write("app.py", ["from pkg.core import used_directly", "", "used_directly()"].join("\n"));
  await write(
    "pkg/core.py",
    ["def used_directly():", "    pass", "", "def _dead_private():", "    pass"].join("\n"),
  );
  await write("necro.config.json", JSON.stringify({ include: ["**/*.py"], entries: ["app.py"] }));
}

describe("explain — Python symbols (AC-8)", () => {
  test("an alive Python symbol resolves with a witness chain ending at the target — zero new code, same engine as TS", async () => {
    await writeFixture();
    const config = { ...DEFAULT_CONFIG, include: ["**/*.py"], entries: ["app.py"] };

    const result = await explain(dir, config, "used_directly");
    if (result.status !== "resolved") throw new Error(`expected resolved, got ${result.status}`);

    expect(result.reachability).toBe("alive");
    expect(result.witness).not.toBeNull();
    const chain = result.witness ?? [];
    expect(chain[chain.length - 1]?.id).toBe(result.symbol.id);
  });

  test("a dead Python symbol reports unreachable with no witness chain", async () => {
    await writeFixture();
    const config = { ...DEFAULT_CONFIG, include: ["**/*.py"], entries: ["app.py"] };

    const result = await explain(dir, config, "_dead_private");
    if (result.status !== "resolved") throw new Error(`expected resolved, got ${result.status}`);

    expect(result.reachability).toBe("dead");
    expect(result.witness).toBeNull();
  });
});
