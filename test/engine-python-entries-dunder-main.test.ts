import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { resolvePythonEntries } from "../src/engine/python-entries.js";
import { buildPythonModuleMap, detectImportRoots } from "../src/graph/python/module-resolver.js";

let dir: string;
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "necro-py-entries-dundermain-"));
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

async function write(rel: string, contents: string): Promise<void> {
  const path = join(dir, rel);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, contents);
}

async function resolve(files: string[]) {
  const roots = detectImportRoots(dir, files);
  const map = buildPythonModuleMap(files, roots);
  return resolvePythonEntries(dir, files, map);
}

describe("resolvePythonEntries — __main__.py and if __name__ == \"__main__\" (AC-4)", () => {
  test("AC-4: a __main__.py file roots unconditionally, regardless of content", async () => {
    await write("pkg/__main__.py", "x = 1\n");
    const files = [join(dir, "pkg", "__main__.py")];

    const result = await resolve(files);
    expect(result.entries.has(join(dir, "pkg", "__main__.py"))).toBe(true);
    expect(result.records).toContainEqual({ file: join(dir, "pkg", "__main__.py"), source: "dunder-main" });
  });

  test('AC-4: a module-level if __name__ == "__main__": block roots the file', async () => {
    await write("pkg/run.py", ["def main():", "    pass", "", 'if __name__ == "__main__":', "    main()"].join("\n"));
    const files = [join(dir, "pkg", "run.py")];

    const result = await resolve(files);
    expect(result.entries.has(join(dir, "pkg", "run.py"))).toBe(true);
    expect(result.records).toContainEqual({ file: join(dir, "pkg", "run.py"), source: "dunder-main" });
  });

  test('AC-4: reversed operand order ("__main__" == __name__) also roots', async () => {
    await write("pkg/run2.py", ['if "__main__" == __name__:', "    pass"].join("\n"));
    const files = [join(dir, "pkg", "run2.py")];

    const result = await resolve(files);
    expect(result.entries.has(join(dir, "pkg", "run2.py"))).toBe(true);
  });

  test("AC-4: a plain module with no __main__.py filename and no if-name-main guard is not rooted", async () => {
    await write("pkg/plain.py", "def helper(): pass\n");
    const files = [join(dir, "pkg", "plain.py")];

    const result = await resolve(files);
    expect(result.entries.size).toBe(0);
  });

  test("AC-4: an if __name__ == \"__main__\" guard nested inside a function (not module-level) does not root the file", async () => {
    await write(
      "pkg/nested.py",
      ["def wrapper():", '    if __name__ == "__main__":', "        pass"].join("\n"),
    );
    const files = [join(dir, "pkg", "nested.py")];

    const result = await resolve(files);
    expect(result.entries.size).toBe(0);
  });
});
