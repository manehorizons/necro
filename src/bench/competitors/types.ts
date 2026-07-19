/** One symbol a competitor tool flagged as an unused export, keyed the same
 * way corpus case provenance is: repo-root-relative file path + symbol name. */
export interface RawUnusedExport {
  file: string;
  symbol: string;
}

/** One competitor tool's raw findings across a repo checkout, plus the exact
 * version that produced them (provenance for the snapshot). */
export interface CompetitorToolRun {
  tool: string;
  version: string;
  unused: RawUnusedExport[];
}
