import { createRequire } from "node:module";

/**
 * Single source of truth for the CLI/MCP version. Read from package.json at
 * runtime via `createRequire` rather than a static import — a static
 * `import pkg from "../package.json"` resolves outside the library build's
 * `rootDir: "src"` and breaks `tsc` declaration emit (see tsconfig.build.json);
 * `prepublishOnly` and the release workflow both rebuild after `npm version`,
 * so this can never drift from the published tag.
 */
const pkg = createRequire(import.meta.url)("../package.json") as {
  version: string;
};

export const VERSION: string = pkg.version;
