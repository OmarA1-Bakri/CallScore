import { query } from "../lib/db";
import { createLogger } from "../lib/logger";
import { loadEnv } from "./script-helpers";
import {
  MAX_CANDLE_OPEN_TIME_MS,
  MIN_CANDLE_OPEN_TIME_MS,
} from "./refresh-candles";

const CONSTRAINT_NAME = "candles_open_time_ms_check";
const logger = createLogger({ component: "validate-candle-open-time-constraint" });

function shouldExecute(argv = process.argv.slice(2)): boolean {
  return argv.includes("--execute") && !argv.includes("--dry-run");
}

export const INVALID_CANDLE_OPEN_TIME_SQL = `
  SELECT COUNT(*)::bigint AS invalid_count
  FROM candles
  WHERE open_time <= $1 OR open_time >= $2
`;

export async function countInvalidCandleOpenTimes(): Promise<bigint> {
  const rows = await query<{ invalid_count: string | bigint }>(
    INVALID_CANDLE_OPEN_TIME_SQL,
    [MIN_CANDLE_OPEN_TIME_MS, MAX_CANDLE_OPEN_TIME_MS],
  );
  return BigInt(rows[0]?.invalid_count ?? 0);
}

export async function validateCandleOpenTimeConstraint(argv = process.argv.slice(2)): Promise<void> {
  loadEnv();
  const execute = shouldExecute(argv);
  const invalidCount = await countInvalidCandleOpenTimes();

  logger.info("candle_open_time_audit_complete", {
    constraint: CONSTRAINT_NAME,
    invalid_count: invalidCount.toString(),
    execute,
  });

  if (invalidCount > BigInt(0)) {
    throw new Error(
      `Refusing to validate ${CONSTRAINT_NAME}: ${invalidCount.toString()} invalid candle rows found`,
    );
  }

  if (!execute) {
    logger.info("candle_open_time_validate_dry_run", {
      next_step: `rerun with --execute to ALTER TABLE candles VALIDATE CONSTRAINT ${CONSTRAINT_NAME}`,
    });
    return;
  }

  await query(`ALTER TABLE candles VALIDATE CONSTRAINT ${CONSTRAINT_NAME}`);
  logger.info("candle_open_time_constraint_validated", {
    constraint: CONSTRAINT_NAME,
  });
}

if (require.main === module) {
  validateCandleOpenTimeConstraint().catch((error) => {
    logger.error("fatal_error", {
      error: error instanceof Error ? error.stack ?? error.message : String(error),
    });
    process.exit(1);
  });
}
