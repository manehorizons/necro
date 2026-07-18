import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { DEFAULT_CONFIG } from "../src/config.js";
import { scan } from "../src/engine/index.js";

let dir: string;
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "necro-py-reach-"));
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

async function write(rel: string, contents: string): Promise<void> {
  const path = join(dir, rel);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, contents);
}

/**
 * A synthetic Python repo exercising the full end-to-end truth table:
 * - `used_directly` (pkg/core.py): alive via a direct submodule import chain from the entry.
 * - `alive_via_reexport` (pkg/impl.py): alive only via `pkg/__init__.py`'s re-export pass-through.
 * - `_dead_private` (pkg/core.py): certain-dead by TS rules, capped to `likely` (AC-6).
 * - `dead_exported` (pkg/core.py): exported, zero refs -> `likely`.
 * - `test_dead_pytest` (pkg/core.py): pytest-convention exemption -> exported -> `likely`.
 * - `_dead_in_tainted_file` (pkg/startainted.py): private + zero refs, but its own file
 *   does `from .core import *` -> tainted -> `maybe` (taint wins over the private/certain path).
 */
async function writeFixture(): Promise<void> {
  await write(
    "app.py",
    ["from pkg.core import used_directly", "from pkg import alive_via_reexport", "", "used_directly()", "alive_via_reexport()"].join(
      "\n",
    ),
  );
  await write("pkg/__init__.py", "from .impl import alive_via_reexport\n");
  await write(
    "pkg/core.py",
    [
      "def used_directly():",
      "    pass",
      "",
      "def _dead_private():",
      "    pass",
      "",
      "def dead_exported():",
      "    pass",
      "",
      "def test_dead_pytest():",
      "    assert True",
    ].join("\n"),
  );
  await write("pkg/impl.py", "def alive_via_reexport():\n    pass\n");
  await write("pkg/startainted.py", ["from .core import *", "", "def _dead_in_tainted_file():", "    pass"].join("\n"));
  await write("necro.config.json", JSON.stringify({ include: ["**/*.py"], entries: ["app.py"] }));
}

function findingFor(findings: { node: { name: string }; verdict: string; tier: string; autoFixEligible: boolean }[], name: string) {
  return findings.find((f) => f.node.name === name);
}

describe("necro scan on a synthetic Python reachability fixture", () => {
  test("AC-9: every symbol's verdict/tier matches the truth table", async () => {
    await writeFixture();
    const config = { ...DEFAULT_CONFIG, include: ["**/*.py"], entries: ["app.py"] };
    const { findings, diagnostics } = await scan(dir, config, { complexity: false });

    expect(diagnostics.entryResolution.collapsed).toBe(false);

    // Alive symbols are not findings at all.
    expect(findingFor(findings, "used_directly")).toBeUndefined();
    expect(findingFor(findings, "alive_via_reexport")).toBeUndefined();

    const deadPrivate = findingFor(findings, "_dead_private");
    expect(deadPrivate?.verdict).toBe("dead");
    expect(deadPrivate?.tier).toBe("likely"); // capped from `certain` (AC-6)
    expect(deadPrivate?.autoFixEligible).toBe(false);

    const deadExported = findingFor(findings, "dead_exported");
    expect(deadExported?.verdict).toBe("dead");
    expect(deadExported?.tier).toBe("likely");
    expect(deadExported?.autoFixEligible).toBe(false);

    const pytestFn = findingFor(findings, "test_dead_pytest");
    expect(pytestFn?.verdict).toBe("dead");
    expect(pytestFn?.tier).toBe("likely");
    expect(pytestFn?.autoFixEligible).toBe(false);

    const taintedDead = findingFor(findings, "_dead_in_tainted_file");
    expect(taintedDead?.verdict).toBe("dead");
    expect(taintedDead?.tier).toBe("maybe"); // taint wins
    expect(taintedDead?.autoFixEligible).toBe(false);
  });

  test("no Python symbol in this scan ever reaches certain/auto-fix-eligible", async () => {
    await writeFixture();
    const config = { ...DEFAULT_CONFIG, include: ["**/*.py"], entries: ["app.py"] };
    const { findings } = await scan(dir, config, { complexity: false });
    expect(findings.every((f) => f.tier !== "certain")).toBe(true);
    expect(findings.every((f) => f.autoFixEligible === false)).toBe(true);
  });
});
