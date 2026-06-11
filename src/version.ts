import pkg from "../package.json";

/**
 * Single source of truth for the CLI/MCP version. Sourced from package.json at
 * build time (esbuild inlines it; `prepublishOnly` and the release workflow both
 * rebuild after `npm version`, so this can never drift from the published tag).
 */
export const VERSION: string = pkg.version;
