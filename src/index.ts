export type {
  ClassifiedFinding,
  EvidenceSignal,
  Tier,
  Verdict,
} from "./analyze/classify.js";
export type { LlmOptions, NecroConfig } from "./config.js";
export { loadConfig } from "./config.js";
export type {
  ExplainOptions,
  ExplainResult,
  ExplainSymbol,
  InboundRef,
  TraceNode,
} from "./engine/explain.js";
export { explain, resolveQuery } from "./engine/explain.js";
export type {
  Finding,
  ScanDiagnostics,
  ScanOptions,
  ScanResult,
} from "./engine/index.js";
export { scan } from "./engine/index.js";
export type {
  EntryResolution,
  EntryResolutionRecord,
  ReachabilityModel,
} from "./engine/model.js";
export { buildReachabilityModel } from "./engine/model.js";

export type { SymbolNode } from "./graph/types.js";
