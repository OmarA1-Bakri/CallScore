import type { Tier } from "./types";
import { createLogger } from "./logger";

const GRANTED_ACCESS_LEVELS = new Set(["customer", "admin"]);
const GRANTED_BOOLEAN_FIELDS = ["has_access", "access"] as const;
const WHOP_ACCESS_TIMEOUT_MS = 5_000;
const whopAccessLogger = createLogger({ component: "whop-access" });

interface AccessCredential {
  readonly bearer: string;
  readonly userId?: string;
}

interface TierAccessCheck {
  readonly tier: Tier;
  readonly resourceId: string | undefined;
}

function whopApiBase(): string {
  return (
    process.env.WHOP_API_BASE_URL ??
    process.env.WHOP_BASE_URL ??
    "https://api.whop.com/api/v1"
  );
}

function proAccessResourceId(): string | undefined {
  return process.env.WHOP_PRO_PRODUCT_ID ?? process.env.WHOP_PRO_PLAN_ID;
}

function alphaAccessResourceId(): string | undefined {
  return (
    process.env.WHOP_ALPHA_PRODUCT_ID ??
    process.env.WHOP_ELITE_PRODUCT_ID ??
    process.env.WHOP_ALPHA_PLAN_ID ??
    process.env.WHOP_ELITE_PLAN_ID
  );
}

function isRecord(data: unknown): data is Record<string, unknown> {
  return Boolean(data && typeof data === "object" && !Array.isArray(data));
}

function hasGrantedBoolean(record: Record<string, unknown>): boolean {
  return GRANTED_BOOLEAN_FIELDS.some((field) => record[field] === true);
}

function isAccessGranted(data: unknown): boolean {
  if (!isRecord(data)) return false;
  return (
    hasGrantedBoolean(data) ||
    GRANTED_ACCESS_LEVELS.has(String(data.access_level))
  );
}

function getAccessCredential(
  accessToken: string | null,
  userId?: string | null,
): AccessCredential | null {
  const apiKey = process.env.WHOP_API_KEY;
  if (apiKey && userId) return { bearer: apiKey, userId };
  return accessToken ? { bearer: accessToken } : null;
}

function buildAccessUrl(resourceId: string, credential: AccessCredential): string {
  if (!credential.userId) {
    return `https://access.api.whop.com/check/${encodeURIComponent(resourceId)}`;
  }

  const base = whopApiBase().replace(/\/$/, "");
  return `${base}/users/${encodeURIComponent(credential.userId)}/access/${encodeURIComponent(resourceId)}`;
}

function maskBearer(value: string): string {
  if (value.length <= 8) return "***";
  return `${value.slice(0, 4)}...${value.slice(-4)}`;
}

async function checkUserAccess(
  resourceId: string | undefined,
  credential: AccessCredential | null,
): Promise<boolean> {
  if (!resourceId) return false;
  if (!credential) return false;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), WHOP_ACCESS_TIMEOUT_MS);

  let response: Response;
  try {
    response = await fetch(buildAccessUrl(resourceId, credential), {
      headers: {
        Authorization: `Bearer ${credential.bearer}`,
      },
      signal: controller.signal,
    });
  } catch (error) {
    whopAccessLogger.warn("whop_access_request_failed", {
      resource_id: resourceId,
      bearer: maskBearer(credential.bearer),
      error: error instanceof Error ? error.message : String(error),
    });
    return false;
  } finally {
    clearTimeout(timeout);
  }

  if (!response.ok) return false;
  try {
    return isAccessGranted(await response.json());
  } catch (error) {
    whopAccessLogger.warn("whop_access_response_parse_failed", {
      resource_id: resourceId,
      bearer: maskBearer(credential.bearer),
      error: error instanceof Error ? error.message : String(error),
    });
    return false;
  }
}

async function findAccessibleTier(
  credential: AccessCredential | null,
): Promise<Tier | null> {
  const checks: readonly TierAccessCheck[] = [
    { tier: "alpha", resourceId: alphaAccessResourceId() },
    { tier: "pro", resourceId: proAccessResourceId() },
  ];

  for (const check of checks) {
    if (await checkUserAccess(check.resourceId, credential)) return check.tier;
  }

  return null;
}

/**
 * Verify a user's subscription tier via Whop API.
 * Returns the highest active tier found.
 */
export async function getUserTier(
  accessToken: string | null,
  userId?: string | null,
): Promise<Tier> {
  const credential = getAccessCredential(accessToken, userId);
  if (!credential) return "free";

  try {
    return (await findAccessibleTier(credential)) ?? "free";
  } catch (error) {
    whopAccessLogger.warn("get_user_tier_failed", {
      user_id: credential.userId,
      error: error instanceof Error ? error.message : String(error),
    });
    return "free";
  }
}