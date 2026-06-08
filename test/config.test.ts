import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { DEFAULT_CONFIG, loadConfig } from "../src/config.js";

let dir: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "necro-config-"));
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe("loadConfig", () => {
  test("returns defaults when no config file exists", async () => {
    const config = await loadConfig(dir);
    expect(config).toEqual(DEFAULT_CONFIG);
  });

  test("merges necro.config.json over defaults per key", async () => {
    await writeFile(
      join(dir, "necro.config.json"),
      JSON.stringify({ ignore: ["**/build/**"] }),
    );

    const config = await loadConfig(dir);

    // overridden key replaces the default
    expect(config.ignore).toEqual(["**/build/**"]);
    // untouched key keeps its default
    expect(config.include).toEqual(DEFAULT_CONFIG.include);
  });
});
