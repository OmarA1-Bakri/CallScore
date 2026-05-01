import * as fs from "fs";
import * as path from "path";
import { getDb } from "../lib/db";
import type {
  CallType,
  Direction,
  StrategyType,
} from "../lib/types";

interface PersistedCallInput {
  readonly symbol: string;
  readonly direction: Direction;
  readonly call_type: CallType;
  readonly entry_price: number | null;
  readonly target_price: number | null;
  readonly stop_loss: number | null;
  readonly timeframe: string | null;
  readonly confidence: "high" | "medium" | "low";
  readonly strategy_type: StrategyType;
  readonly raw_quote: string;
  readonly extraction_confidence: number;
  readonly specificity_score: number;
}

interface ReplaceVideoCallsOptions {
  readonly creatorId: number;
  readonly videoId: number;
  readonly callDate: string | null;
  readonly calls: readonly PersistedCallInput[];
  readonly markVideoExtracted?: boolean;
}

const DELETE_VIDEO_CALLS_SQL = "DELETE FROM calls WHERE video_id = $1";
const INSERT_CALL_SQL = `INSERT INTO calls (
  creator_id, video_id, symbol, direction, call_type,
  entry_price, target_price, stop_loss, timeframe,
  confidence, strategy_type, raw_quote,
  extraction_confidence, specificity_score, call_date
) VALUES (
  $1, $2, $3, $4, $5,
  $6, $7, $8, $9,
  $10, $11, $12,
  $13, $14, $15
)`;
const MARK_VIDEO_EXTRACTED_SQL =
  "UPDATE videos SET calls_extracted = true, extraction_pass = extraction_pass + 1 WHERE id = $1";

export function loadEnv(): void {
  const root = path.resolve(__dirname, "../..");
  const envPath = fs.existsSync(path.join(root, ".env.local"))
    ? path.join(root, ".env.local")
    : path.join(root, ".env");

  if (!fs.existsSync(envPath)) return;

  const lines = fs.readFileSync(envPath, "utf-8").split("\n");
  for (const raw of lines) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;

    const eqIdx = line.indexOf("=");
    if (eqIdx < 0) continue;

    const key = line.slice(0, eqIdx).trim();
    const value = line.slice(eqIdx + 1).trim();

    if (!process.env[key]) {
      process.env[key] = value;
    }
  }
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function timestamp(): string {
  return new Date().toISOString();
}

export async function replaceStoredCallsForVideo({
  creatorId,
  videoId,
  callDate,
  calls,
  markVideoExtracted = false,
}: ReplaceVideoCallsOptions): Promise<void> {
  const db = getDb();
  await db.transaction((txn) => [
    txn(DELETE_VIDEO_CALLS_SQL, [videoId]),
    ...calls.map((call) =>
      txn(INSERT_CALL_SQL, [
        creatorId,
        videoId,
        call.symbol,
        call.direction,
        call.call_type,
        call.entry_price,
        call.target_price,
        call.stop_loss,
        call.timeframe,
        call.confidence,
        call.strategy_type,
        call.raw_quote,
        call.extraction_confidence,
        call.specificity_score,
        callDate,
      ]),
    ),
    ...(markVideoExtracted ? [txn(MARK_VIDEO_EXTRACTED_SQL, [videoId])] : []),
  ]);
}
