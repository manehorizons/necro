import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { loadCoverage } from "../src/analyze/coverage/load.js";

let dir: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "necro-cov-"));
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
  vi.restoreAllMocks();
});

const LCOV = ["SF:/x.ts", "FN:1,f", "FNDA:3,f", "DA:1,3", "end_of_record"].join("\n");

describe("loadCoverage", () => {
  test("no report at default path → null, no warning", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const report = await loadCoverage(dir, {});
    expect(report).toBeNull();
    expect(warn).not.toHaveBeenCalled();
  });

  test("default path coverage/lcov.info is auto-discovered", async () => {
    await mkdir(join(dir, "coverage"), { recursive: true });
    await writeFile(join(dir, "coverage/lcov.info"), LCOV);
    const report = await loadCoverage(dir, {});
    expect(report?.files.get("/x.ts")?.fns).toContainEqual({ name: "f", line: 1, hits: 3 });
  });

  test("explicit coveragePath overrides the default", async () => {
    await writeFile(join(dir, "custom.info"), LCOV);
    const report = await loadCoverage(dir, { coveragePath: "custom.info" });
    expect(report?.files.has("/x.ts")).toBe(true);
  });

  test("unreadable report → null + one warning", async () => {
    // Point coveragePath at a directory → read fails with EISDIR.
    await mkdir(join(dir, "adir"), { recursive: true });
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const report = await loadCoverage(dir, { coveragePath: "adir" });
    expect(report).toBeNull();
    expect(warn).toHaveBeenCalledOnce();
  });
});
