import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { DEFAULT_CONFIG } from "../src/config.js";
import { scan } from "../src/engine/index.js";

let dir: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "necro-engine-"));
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe("scan", () => {
  test("returns no findings for an empty directory", async () => {
    const result = await scan(dir, DEFAULT_CONFIG);
    expect(result.findings).toEqual([]);
  });
});
