import { describe, expect, test } from "vitest";
import { isPythonFile } from "../src/graph/python/language.js";

describe("isPythonFile", () => {
  test("true for .py files", () => {
    expect(isPythonFile("/repo/pkg/mod.py")).toBe(true);
  });

  test("false for non-.py files", () => {
    expect(isPythonFile("/repo/src/mod.ts")).toBe(false);
    expect(isPythonFile("/repo/pkg/mod.pyi")).toBe(false);
  });
});
