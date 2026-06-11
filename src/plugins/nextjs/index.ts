import type { SymbolGraph } from "../../graph/types.js";
import type {
  EntrySpec,
  FrameworkPlugin,
  RepoContext,
  SyntheticEdge,
  TaintRule,
} from "../types.js";

const EXT = "{ts,tsx,js,jsx,mjs}";

/** App Router special files that are alive by file-routing convention (§5). */
const APP_SPECIAL =
  "{page,layout,route,loading,error,template,default,not-found,global-error}";

/**
 * Next.js framework plugin. Next invokes file-routing entrypoints
 * (`app/**​/page.tsx`, `pages/**`, `middleware`, `instrumentation`) by
 * convention — nothing imports them, so every symbol they export reads as dead.
 * The plugin marks those files as `prod` entries; the engine then roots the
 * symbols they export. Detection is zero-config: a `next` dependency or a
 * `next.config.*` is enough.
 */
export function createNextjsPlugin(): FrameworkPlugin {
  return {
    name: "nextjs",

    detect(ctx) {
      return ctx.hasDep(["next"]) || ctx.hasConfig(["next.config.*"]);
    },

    entryPatterns(): EntrySpec[] {
      const globs = [
        // App Router (with and without a `src/` dir).
        `app/**/${APP_SPECIAL}.${EXT}`,
        `src/app/**/${APP_SPECIAL}.${EXT}`,
        // Pages Router — every file is a route (includes `pages/api/**`).
        `pages/**/*.${EXT}`,
        `src/pages/**/*.${EXT}`,
        // Root specials.
        `middleware.${EXT}`,
        `src/middleware.${EXT}`,
        `instrumentation.${EXT}`,
        `src/instrumentation.${EXT}`,
      ];
      return globs.map((glob) => ({ glob, kind: "prod" }));
    },

    resolveEdges(_ctx: RepoContext, _graph: SymbolGraph): SyntheticEdge[] {
      return [];
    },

    taintRules(): TaintRule[] {
      return [];
    },
  };
}
