import { describe, expect, test } from "vitest";
import config from "../vitest.config.js";

const COVERED_MODULES = [
  "src/discover.ts",
  "src/glob.ts",
  "src/engine/prod-entries.ts",
  "src/syntactic/parse.ts",
  "src/mcp/tools/scan.ts",
  "src/mcp/tools/verify.ts",
];

describe("vitest coverage config (AC-1)", () => {
  test("coverage produces text + lcov reports with thresholds for the six named modules (AC-1)", () => {
    const coverage = config.test?.coverage as
      | { provider?: string; reporter?: string[]; reportsDirectory?: string; thresholds?: Record<string, unknown> }
      | undefined;
    expect(coverage?.provider).toBe("v8");
    expect(coverage?.reporter).toContain("text");
    expect(coverage?.reporter).toContain("lcov");
    expect(coverage?.reportsDirectory).toBe("coverage");
    expect(coverage?.thresholds).toBeDefined();
    for (const mod of COVERED_MODULES) {
      expect(coverage?.thresholds?.[mod], `missing coverage threshold for ${mod}`).toBeDefined();
    }
  });
});
