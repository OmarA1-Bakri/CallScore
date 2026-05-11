import { createLogger } from "../lib/logger";
import { main as openRouterExtractionMain } from "./extract-calls-openrouter";

const logger = createLogger({ component: "extract-calls-batch-legacy" });

const UNSUPPORTED_LEGACY_VALUE_FLAGS = new Set([
  "--cooldown-every",
  "--cooldown-ms",
]);

export function mapLegacyBatchArgs(argv: readonly string[]): string[] {
  const mapped: string[] = [];
  const ignored: string[] = [];
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (UNSUPPORTED_LEGACY_VALUE_FLAGS.has(arg)) {
      ignored.push(arg);
      // Skip the legacy flag and its value; the loop increment handles the next index even if the value is absent.
      index += 1;
      continue;
    }
    mapped.push(arg);
  }
  if (ignored.length > 0) {
    logger.warn("legacy_batch_flags_ignored", { ignored });
  }
  return mapped;
}

export async function main(argv = process.argv.slice(2)): Promise<void> {
  logger.warn("legacy_entrypoint_redirect", {
    from: "src/scripts/extract-calls-batch.ts",
    to: "src/scripts/extract-calls-llm.ts",
  });
  await openRouterExtractionMain(mapLegacyBatchArgs(argv));
}

if (require.main === module) {
  main().catch((err) => {
    logger.error("fatal_error", {
      error: err instanceof Error ? err.stack ?? err.message : String(err),
    });
    process.exit(1);
  });
}
