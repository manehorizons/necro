// Consumed by @mono/app via the workspace alias — must be alive.
export function usedCrossPackage() {
  return 42;
}

// Exported but referenced by nobody (in-repo or cross-package) — genuine dead
// code that must STAY reported.
export function trulyUnused() {
  return 0;
}
