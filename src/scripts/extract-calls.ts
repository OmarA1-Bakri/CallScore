import { createLogger } from "../lib/logger";
import { main as openRouterExtractionMain } from "./extract-calls-openrouter";

const logger = createLogger({ component: "extract-calls-legacy" });

export async function main(argv = process.argv.slice(2)): Promise<void> {
  logger.warn("legacy_entrypoint_redirect", {
    from: "src/scripts/extract-calls.ts",
    to: "src/scripts/extract-calls-openrouter.ts",
  });
  await openRouterExtractionMain(argv);
}

if (require.main === module) {
  main().catch((err) => {
    logger.error("fatal_error", {
      error: err instanceof Error ? err.stack ?? err.message : String(err),
    });
    process.exit(1);
  });
}
