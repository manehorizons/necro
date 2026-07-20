import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { resolvePublicApiIds } from "../src/graph/symbol-graph-public-api.js";
import { symbolNodeId } from "../src/graph/symbol-graph.js";

let dir: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "necro-public-api-"));
  await mkdir(join(dir, "src"), { recursive: true });
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe("resolvePublicApiIds (AC-1)", () => {
  test("resolves a symbol directly exported from the entry file", async () => {
    const entry = join(dir, "src", "index.ts");
    await writeFile(entry, "export function greet() { return 'hi'; }\n");

    const ids = resolvePublicApiIds([entry], [entry]);

    expect(ids).toEqual(new Set([symbolNodeId(entry, 1, "greet")]));
  });

  test("resolves a symbol through an `export * from` barrel", async () => {
    const entry = join(dir, "src", "index.ts");
    const sub = join(dir, "src", "sub.ts");
    await writeFile(entry, "export * from './sub.js';\n");
    await writeFile(sub, "export function helper() { return 1; }\n");

    const ids = resolvePublicApiIds([entry], [entry, sub]);

    expect(ids).toEqual(new Set([symbolNodeId(sub, 1, "helper")]));
  });

  test("resolves an aliased `export { x as y } from` to x's own id, not y", async () => {
    const entry = join(dir, "src", "index.ts");
    const sub = join(dir, "src", "sub.ts");
    await writeFile(entry, "export { original as renamed } from './sub.js';\n");
    await writeFile(sub, "export function original() { return 1; }\n");

    const ids = resolvePublicApiIds([entry], [entry, sub]);

    expect(ids).toEqual(new Set([symbolNodeId(sub, 1, "original")]));
  });

  test("a symbol not reachable from any entry file is absent", async () => {
    const entry = join(dir, "src", "index.ts");
    const notExported = join(dir, "src", "internal.ts");
    await writeFile(entry, "export function greet() { return 'hi'; }\n");
    await writeFile(notExported, "export function secret() { return 1; }\n");

    const ids = resolvePublicApiIds([entry], [entry, notExported]);

    expect(ids).toEqual(new Set([symbolNodeId(entry, 1, "greet")]));
  });

  test("an entry file with no exports returns an empty set", async () => {
    const entry = join(dir, "src", "index.ts");
    await writeFile(entry, "const internal = 1;\nconsole.log(internal);\n");

    const ids = resolvePublicApiIds([entry], [entry]);

    expect(ids).toEqual(new Set());
  });
});
