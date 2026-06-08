import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { resolveEntries } from "../src/plugins/entry-resolver.js";
import { createRepoContext, detectPlugins } from "../src/plugins/registry.js";
import type { FrameworkPlugin } from "../src/plugins/types.js";

let dir: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "necro-plugins-"));
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

async function writePkg(pkg: unknown): Promise<void> {
  await writeFile(join(dir, "package.json"), JSON.stringify(pkg));
}

const fakeTestPlugin: FrameworkPlugin = {
  name: "fake-test",
  detect: (ctx) => ctx.hasDep(["vitest", "jest"]) || ctx.hasConfig(["vitest.config.*"]),
  entryPatterns: () => [
    { glob: "**/*.test.ts", kind: "test" },
    { glob: "vitest.config.*", kind: "test" },
  ],
  resolveEdges: () => [],
  taintRules: () => [],
};

describe("createRepoContext", () => {
  test("hasDep finds deps across dependencies and devDependencies", async () => {
    await writePkg({ devDependencies: { vitest: "^2.0.0" } });
    const ctx = await createRepoContext(dir);
    expect(ctx.hasDep(["vitest"])).toBe(true);
    expect(ctx.hasDep(["jest"])).toBe(false);
  });

  test("hasConfig matches a config file glob at the repo root", async () => {
    await writePkg({});
    await writeFile(join(dir, "vitest.config.ts"), "export default {}");
    const ctx = await createRepoContext(dir);
    expect(ctx.hasConfig(["vitest.config.*"])).toBe(true);
    expect(ctx.hasConfig(["jest.config.*"])).toBe(false);
  });

  test("packageJsonHas detects a top-level key", async () => {
    await writePkg({ jest: { testMatch: ["**/*.spec.ts"] } });
    const ctx = await createRepoContext(dir);
    expect(ctx.packageJsonHas("jest")).toBe(true);
    expect(ctx.packageJsonHas("mocha")).toBe(false);
  });
});

describe("detectPlugins", () => {
  test("detects a plugin from a fixture package.json", async () => {
    await writePkg({ devDependencies: { vitest: "^2.0.0" } });
    const ctx = await createRepoContext(dir);
    const detected = detectPlugins([fakeTestPlugin], ctx);
    expect(detected.map((p) => p.name)).toEqual(["fake-test"]);
  });

  test("detects nothing when no plugin matches", async () => {
    await writePkg({ dependencies: { lodash: "^4.0.0" } });
    const ctx = await createRepoContext(dir);
    expect(detectPlugins([fakeTestPlugin], ctx)).toEqual([]);
  });
});

describe("resolveEntries", () => {
  test("aggregates entry specs from detected plugins with correct kind", async () => {
    await writePkg({ devDependencies: { vitest: "^2.0.0" } });
    const ctx = await createRepoContext(dir);
    const entries = resolveEntries([fakeTestPlugin], ctx);
    expect(entries).toEqual([
      { glob: "**/*.test.ts", kind: "test" },
      { glob: "vitest.config.*", kind: "test" },
    ]);
  });

  test("returns no entries when no plugin is detected", async () => {
    await writePkg({});
    const ctx = await createRepoContext(dir);
    expect(resolveEntries([fakeTestPlugin], ctx)).toEqual([]);
  });
});
