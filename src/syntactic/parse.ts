import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { Language, Parser } from "web-tree-sitter";

let parserPromise: Promise<Parser> | null = null;

/**
 * Lazily initialize a tree-sitter parser bound to the TypeScript grammar.
 * Heavy (WASM init + grammar load), so it is created once and cached — callers
 * on the dead-code/`fix` paths never trigger it. The grammar wasm is resolved
 * at runtime from `node_modules` (kept external; never bundled by esbuild).
 */
export async function getParser(): Promise<Parser> {
  if (!parserPromise) parserPromise = init();
  return parserPromise;
}

async function init(): Promise<Parser> {
  await Parser.init();
  const require = createRequire(import.meta.url);
  const grammarRoot = dirname(require.resolve("tree-sitter-wasms/package.json"));
  const wasmPath = join(grammarRoot, "out", "tree-sitter-typescript.wasm");
  const ts = await Language.load(wasmPath);
  const parser = new Parser();
  parser.setLanguage(ts);
  return parser;
}
