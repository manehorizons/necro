import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { DEFAULT_COMPLEXITY, DEFAULT_CONFIG, DEFAULT_LLM, loadConfig } from "../src/config.js";

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

  test("complexity thresholds default when unset (AC-2, AC-3, AC-4, AC-5)", async () => {
    const config = await loadConfig(dir);
    expect(config.complexity).toEqual(DEFAULT_COMPLEXITY);
  });

  test("a partial complexity block overrides only the keys it sets (AC-2, AC-3, AC-4, AC-5)", async () => {
    await writeFile(
      join(dir, "necro.config.json"),
      JSON.stringify({ complexity: { nesting: 5 } }),
    );

    const config = await loadConfig(dir);
    expect(config.complexity.nesting).toBe(5);
    expect(config.complexity.cyclomatic).toBe(DEFAULT_COMPLEXITY.cyclomatic);
    expect(config.complexity.godFunctionLoc).toBe(DEFAULT_COMPLEXITY.godFunctionLoc);
  });

  test("duplication.minTokens defaults and overrides (AC-4)", async () => {
    const def = await loadConfig(dir);
    expect(def.duplication.minTokens).toBe(50);

    await writeFile(join(dir, "necro.config.json"), JSON.stringify({ duplication: { minTokens: 30 } }));
    const config = await loadConfig(dir);
    expect(config.duplication.minTokens).toBe(30);
  });

  test("llm block defaults to opus + radius, no cap (AC-5)", async () => {
    const config = await loadConfig(dir);
    expect(config.llm).toEqual(DEFAULT_LLM);
    expect(config.llm.model).toBe("claude-opus-4-8");
    expect(config.llm.snippetRadius).toBe(20);
    expect(config.llm.maxFindings).toBeUndefined();
  });

  test("entries is undefined by default, and passes through globs when set (AC-1)", async () => {
    const def = await loadConfig(dir);
    expect(def.entries).toBeUndefined();

    await writeFile(join(dir, "necro.config.json"), JSON.stringify({ entries: ["src/server.ts"] }));
    const config = await loadConfig(dir);
    expect(config.entries).toEqual(["src/server.ts"]);
  });

  test("a partial llm block overrides only the keys it sets, including apiKey (AC-5)", async () => {
    await writeFile(
      join(dir, "necro.config.json"),
      JSON.stringify({ llm: { maxFindings: 5, apiKey: "sk-test-override" } }),
    );

    const config = await loadConfig(dir);
    expect(config.llm.maxFindings).toBe(5);
    expect(config.llm.apiKey).toBe("sk-test-override");
    // untouched keys keep defaults
    expect(config.llm.model).toBe(DEFAULT_LLM.model);
    expect(config.llm.snippetRadius).toBe(DEFAULT_LLM.snippetRadius);
  });
});
