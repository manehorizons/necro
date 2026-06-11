import { usedCrossPackage } from "@mono/core";

// Executed at module top level in the member's own entry — must be alive.
export function appMain() {
  return usedCrossPackage();
}

appMain();
