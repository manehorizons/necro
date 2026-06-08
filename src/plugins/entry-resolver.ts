import { detectPlugins } from "./registry.js";
import type { EntrySpec, FrameworkPlugin, RepoContext } from "./types.js";

/**
 * Collect entry specs from every detected plugin. When no plugin matches, this
 * returns no entries — the caller treats an empty entry set as a signal to
 * degrade candidates to `maybe` rather than killing them (§5).
 */
export function resolveEntries(
  plugins: FrameworkPlugin[],
  ctx: RepoContext,
): EntrySpec[] {
  return detectPlugins(plugins, ctx).flatMap((p) => p.entryPatterns(ctx));
}
