import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { createRepoContext } from "../src/plugins/registry.js";
import {
  resolveTestConfig,
  resolveTestConfigSync,
} from "../src/plugins/test-runner/config-resolution.js";
import { createTestRunnerPlugin } from "../src/plugins/test-runner/index.js";
import type { SymbolGraph } from "../src/graph/types.js";

let dir: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "necro-tr-"));
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

async function write(rel: string, contents: string): Promise<void> {
  const path = join(dir, rel);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, contents);
}

const ctxFor = () => createRepoContext(dir);

describe("detect", () => {
  test("detects vitest from a dependency", async () => {
    await write("package.json", JSON.stringify({ devDependencies: { vitest: "^2.0.0" } }));
    expect(createTestRunnerPlugin().detect(await ctxFor())).toBe(true);
  });

  test("is not detected without a test runner", async () => {
    await write("package.json", JSON.stringify({ dependencies: { lodash: "^4" } }));
    expect(createTestRunnerPlugin().detect(await ctxFor())).toBe(false);
  });
});

describe("resolveTestConfigSync", () => {
  test("reads jest config from package.json#jest", async () => {
    await write(
      "package.json",
      JSON.stringify({
        devDependencies: { jest: "^29" },
        jest: { testMatch: ["**/*.spec.ts"], setupFiles: ["./jest.setup.ts"] },
      }),
    );
    const cfg = resolveTestConfigSync(await ctxFor());
    expect(cfg.runner).toBe("jest");
    expect(cfg.testMatch).toContain("**/*.spec.ts");
    expect(cfg.setupFiles).toContain("jest.setup.ts");
    expect(cfg.configFiles).toContain("package.json");
  });

  test("statically parses a vitest config file (non-default include)", async () => {
    await write("package.json", JSON.stringify({ devDependencies: { vitest: "^2" } }));
    await write(
      "vitest.config.ts",
      `import { defineConfig } from "vitest/config";\n` +
        `export default defineConfig({\n` +
        `  test: {\n` +
        `    include: ["**/*.spec.ts"],\n` +
        `    setupFiles: ["./test/setup.ts"],\n` +
        `  },\n` +
        `});\n`,
    );
    const cfg = resolveTestConfigSync(await ctxFor());
    expect(cfg.runner).toBe("vitest");
    expect(cfg.testMatch).toEqual(["**/*.spec.ts"]);
    expect(cfg.setupFiles).toEqual(["test/setup.ts"]);
    expect(cfg.configFiles).toEqual(["vitest.config.ts"]);
  });

  test("falls back to runner defaults when no config is present", async () => {
    await write("package.json", JSON.stringify({ devDependencies: { vitest: "^2" } }));
    const cfg = resolveTestConfigSync(await ctxFor());
    expect(cfg.runner).toBe("vitest");
    expect(cfg.testMatch.length).toBeGreaterThan(0);
  });
});

describe("entryPatterns", () => {
  test("marks test files, setup, and config as test-kind entries", async () => {
    await write("package.json", JSON.stringify({ devDependencies: { vitest: "^2" } }));
    await write(
      "vitest.config.ts",
      `export default { test: { include: ["**/*.spec.ts"], setupFiles: ["./test/setup.ts"] } };\n`,
    );
    const entries = createTestRunnerPlugin().entryPatterns(await ctxFor());
    const globs = entries.map((e) => e.glob);

    expect(globs).toContain("**/*.spec.ts");
    expect(globs).toContain("test/setup.ts");
    expect(globs).toContain("vitest.config.ts");
    expect(globs).toContain("**/__mocks__/**");
    expect(entries.every((e) => e.kind === "test")).toBe(true);
  });
});

describe("taintRules", () => {
  test("taints non-literal jest.mock calls", async () => {
    await write("package.json", JSON.stringify({ devDependencies: { jest: "^29" } }));
    const rules = createTestRunnerPlugin().taintRules(await ctxFor());
    expect(rules.some((r) => r.pattern.includes("jest.mock") && r.action === "taint-scope")).toBe(true);
  });
});

describe("resolveEdges (auto-mocks)", () => {
  test("links a __mocks__ file to its sibling module", async () => {
    await write("package.json", JSON.stringify({ devDependencies: { jest: "^29" } }));
    const graph: SymbolGraph = {
      nodes: [
        { id: "a", name: "foo", file: join(dir, "src/foo.ts"), line: 1, exported: true },
        { id: "b", name: "foo", file: join(dir, "src/__mocks__/foo.ts"), line: 1, exported: true },
      ],
      edges: [],
    };
    const edges = createTestRunnerPlugin().resolveEdges(await ctxFor(), graph);
    expect(edges).toContainEqual(
      expect.objectContaining({
        from: join(dir, "src/foo.ts"),
        to: join(dir, "src/__mocks__/foo.ts"),
        kind: "test",
      }),
    );
  });
});

describe("resolveTestConfig (async shell-out wrapper)", () => {
  test("uses the shell-out resolver result when consent is given", async () => {
    await write("package.json", JSON.stringify({ devDependencies: { jest: "^29" } }));
    const cfg = await resolveTestConfig(await ctxFor(), {
      consentToShellOut: true,
      shellOut: async () => ({ testMatch: ["**/from-shell.ts"] }),
    });
    expect(cfg.testMatch).toContain("**/from-shell.ts");
  });

  test("falls back to static parse when consent is withheld (runner uninstalled)", async () => {
    await write(
      "package.json",
      JSON.stringify({ devDependencies: { jest: "^29" }, jest: { testMatch: ["**/*.spec.ts"] } }),
    );
    let called = false;
    const cfg = await resolveTestConfig(await ctxFor(), {
      consentToShellOut: false,
      shellOut: async () => {
        called = true;
        return { testMatch: ["**/from-shell.ts"] };
      },
    });
    expect(called).toBe(false);
    expect(cfg.testMatch).toContain("**/*.spec.ts");
  });
});
