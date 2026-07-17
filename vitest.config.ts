import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    include: ["test/**/*.test.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text", "lcov"],
      reportsDirectory: "coverage",
      include: [
        "src/discover.ts",
        "src/glob.ts",
        "src/engine/prod-entries.ts",
        "src/syntactic/parse.ts",
        "src/mcp/tools/scan.ts",
        "src/mcp/tools/verify.ts",
      ],
      // Regression floors set just under the observed baseline (phase 39) —
      // not aspirational targets. A future drop below these trips CI.
      thresholds: {
        "src/discover.ts": { statements: 100, branches: 80, functions: 100, lines: 100 },
        "src/glob.ts": { statements: 100, branches: 100, functions: 100, lines: 100 },
        "src/engine/prod-entries.ts": { statements: 100, branches: 90, functions: 100, lines: 100 },
        "src/syntactic/parse.ts": { statements: 100, branches: 100, functions: 100, lines: 100 },
        "src/mcp/tools/scan.ts": { statements: 100, branches: 30, functions: 100, lines: 100 },
        "src/mcp/tools/verify.ts": { statements: 100, branches: 80, functions: 100, lines: 100 },
      },
    },
  },
});
