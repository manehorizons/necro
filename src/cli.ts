import { resolve } from "node:path";
import { Command } from "commander";
import { loadConfig } from "./config.js";
import { scan } from "./engine/index.js";
import { toJson } from "./report/json.js";
import { renderTerminal } from "./report/terminal.js";

interface ScanOptions {
  json?: boolean;
  top?: string;
}

const program = new Command();

program
  .name("necro")
  .description("Find anti-pattern code and propose LLM-assisted fixes.")
  .version("0.0.0");

program
  .command("scan")
  .description("Scan a path for anti-pattern code")
  .argument("[path]", "directory or file to scan", ".")
  .option("--json", "emit findings as JSON")
  .option("--top <n>", "show only the worst N findings")
  .action(async (path: string, opts: ScanOptions) => {
    const target = resolve(process.cwd(), path);
    const config = await loadConfig(process.cwd());
    const { findings } = await scan(target, config);

    const top = opts.top ? Number.parseInt(opts.top, 10) : undefined;
    const shown = top && top > 0 ? findings.slice(0, top) : findings;

    console.log(opts.json ? toJson(shown) : renderTerminal(shown));
  });

program.parseAsync().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exitCode = 1;
});
