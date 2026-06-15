import { existsSync, readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { parse } from "dotenv";

export const CANONICAL_ENV_PATH = "/opt/crypto-tuber-ranked/.env.hermes";

export const REQUIRED_KEYS = [
  "CALLSCORE_APP_DIR",
  "CALLSCORE_ENV_FILE",
  "DATABASE_PROVIDER",
  "DATABASE_URL",
  "CRON_SECRET",
  "HERMES_WORKER_ID",
  "HH_ENQUEUE_SECRET",
  "OLLAMA_HOST",
  "YTDLP_BIN",
  "YTDLP_COOKIES_PATH",
  "WHOP_API_KEY",
  "WHOP_CLIENT_ID",
  "WHOP_CLIENT_SECRET",
  "WHOP_PRO_PRODUCT_ID",
  "X_API_KEY",
  "X_API_SECRET",
  "X_ACCESS_TOKEN",
  "X_ACCESS_TOKEN_SECRET",
  "COMPOSIO_API_KEY",
  "COMPOSIO_MCP_URL",
] as const;

export const OPTIONAL_KEYS = [
  "HH_READ_API_BASE",
  "HH_READ_SECRET",
  "HH_READ_API_HOST",
  "HH_READ_API_PORT",
  "HH_ENQUEUE_HOST",
  "HH_ENQUEUE_PORT",
  "PIPELINE_STATUS_SECRET",
  "REVIEW_ACCESS_TOKEN",
  "SESSION_SECRET",
  "NETLIFY_AUTH_TOKEN",
  "NETLIFY_SITE_ID",
  "WHOP_WEBHOOK_KEY",
  "WHOP_COMPANY_ID",
  "WHOP_ALPHA_PRODUCT_ID",
  "WHOP_FREE_PRODUCT_ID",
  "NEXT_PUBLIC_WHOP_APP_ID",
  "X_BEARER_TOKEN",
  "ATTIO_API_KEY",
  "RESEND_API_KEY",
  "RESEND_FROM_EMAIL",
  "DISCORD_BOT_TOKEN",
  "DISCORD_ALLOWED_USERS",
  "TELEGRAM_BOT_TOKEN",
  "TELEGRAM_ALLOWED_USERS",
  "POSTHOG_API_KEY",
  "POSTHOG_PROJECT_ID",
  "POSTHOG_HOST",
  "LINKEDIN_ACCESS_TOKEN",
  "GMAIL_CLIENT_ID",
  "GMAIL_CLIENT_SECRET",
  "HUGGINGFACE_TOKEN",
  "HF_TOKEN",
  "OLLAMA_API_KEY",
  "OLLAMA_BASE_URL",
  "ML_VERIFIER_PROVIDER",
  "ML_VERIFIER_MODEL",
  "ML_VERIFIER_PROMPT_VERSION",
  "ML_VERIFIER_TIMEOUT_MS",
] as const;

export type EnvValidation = {
  status: "OK" | "MISSING" | "ERROR";
  path: string;
  mode: string | null;
  present: string[];
  missing: string[];
  optionalPresent: string[];
  optionalMissing: string[];
};

function isNonEmpty(value: string | undefined): boolean {
  return typeof value === "string" && value.trim().length > 0;
}

export function validateHermesEnv(envPath = CANONICAL_ENV_PATH): EnvValidation {
  const path = resolve(envPath);
  if (!existsSync(path)) {
    return {
      status: "ERROR",
      path,
      mode: null,
      present: [],
      missing: [...REQUIRED_KEYS],
      optionalPresent: [],
      optionalMissing: [...OPTIONAL_KEYS],
    };
  }

  const stat = statSync(path);
  const mode = (stat.mode & 0o777).toString(8).padStart(3, "0");
  const parsed = parse(readFileSync(path));
  const present = REQUIRED_KEYS.filter((key) => isNonEmpty(parsed[key]));
  const missing = REQUIRED_KEYS.filter((key) => !isNonEmpty(parsed[key]));
  const optionalPresent = OPTIONAL_KEYS.filter((key) => isNonEmpty(parsed[key]));
  const optionalMissing = OPTIONAL_KEYS.filter((key) => !isNonEmpty(parsed[key]));

  return {
    status: missing.length === 0 ? "OK" : "MISSING",
    path,
    mode,
    present,
    missing,
    optionalPresent,
    optionalMissing,
  };
}

function main(): void {
  const envPath = process.argv[2] ?? CANONICAL_ENV_PATH;
  const result = validateHermesEnv(envPath);
  console.log(`CALLSCORE_ENV_STATUS=${result.status}`);
  console.log(`CANONICAL_ENV_PATH=${result.path}`);
  console.log(`CANONICAL_ENV_MODE=${result.mode ?? "missing"}`);
  for (const key of result.present) console.log(`PRESENT: ${key}`);
  for (const key of result.missing) console.log(`MISSING: ${key}`);
  for (const key of result.optionalPresent) console.log(`OPTIONAL_PRESENT: ${key}`);
  for (const key of result.optionalMissing) console.log(`OPTIONAL_MISSING: ${key}`);
  if (result.status !== "OK") process.exitCode = 1;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
