import { createLogger } from "../lib/logger";
import { main as scrapeTranscriptsV2Main } from "./scrape-transcripts-v2";

const logger = createLogger({ component: "scrape-transcripts-legacy" });

export async function main(argv = process.argv.slice(2)): Promise<void> {
  logger.warn("legacy_entrypoint_redirect", {
    from: "src/scripts/scrape-transcripts.ts",
    to: "src/scripts/scrape-transcripts-v2.ts",
  });
  await scrapeTranscriptsV2Main(argv);
}

if (require.main === module) {
  main().catch((err) => {
    logger.error("fatal_error", {
      error: err instanceof Error ? err.stack ?? err.message : String(err),
    });
    process.exit(1);
  });
}
