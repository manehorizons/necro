import picomatch from "picomatch";

/** Compile a set of globs into a single matcher (path is matched in posix form). */
export function globMatcher(globs: string[]): (relPath: string) => boolean {
  if (globs.length === 0) return () => false;
  const matchers = globs.map((g) => picomatch(g, { dot: true }));
  return (relPath) => {
    const posix = relPath.replace(/\\/g, "/");
    return matchers.some((m) => m(posix));
  };
}
