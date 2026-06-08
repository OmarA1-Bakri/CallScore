import { PUBLIC_APP_PRODUCTION_URL } from "./site";

type Env = Record<string, string | undefined>;

function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/, "");
}

export function getWhopOAuthBaseUrl(env: Env = process.env): string {
  const explicit = env.WHOP_OAUTH_BASE_URL?.trim();
  if (explicit) return trimTrailingSlash(explicit);

  if (env.NODE_ENV === "production") return PUBLIC_APP_PRODUCTION_URL;

  return trimTrailingSlash(env.NEXT_PUBLIC_BASE_URL ?? "http://localhost:3000");
}

export function getWhopOAuthCallbackUrl(env: Env = process.env): string {
  return `${getWhopOAuthBaseUrl(env)}/api/auth/whop/callback`;
}

export function getCanonicalWhopAuthUrl(env: Env = process.env): string {
  return `${getWhopOAuthBaseUrl(env)}/api/auth/whop`;
}
