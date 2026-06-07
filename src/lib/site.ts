export const PUBLIC_APP_PRODUCTION_URL = "https://call-score.com";
export const NETLIFY_FALLBACK_URL = "https://call-score.netlify.app";
export const LOCAL_APP_URL = "http://localhost:3000";

export const SITE_URL = PUBLIC_APP_PRODUCTION_URL;

type Env = Record<string, string | undefined>;

function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/, "");
}

function firstConfiguredUrl(env: Env): string | undefined {
  return (
    env.NEXT_PUBLIC_BASE_URL?.trim() ||
    env.SITE_URL?.trim() ||
    env.APP_URL?.trim() ||
    env.BASE_URL?.trim() ||
    undefined
  );
}

export function getPublicAppOrigin(env: Env = process.env): string {
  const configured = firstConfiguredUrl(env);
  if (configured) return trimTrailingSlash(configured);

  if (env.NODE_ENV === "production") return PUBLIC_APP_PRODUCTION_URL;

  return LOCAL_APP_URL;
}

export function getPublicAppUrl(path = "/", env: Env = process.env): string {
  return new URL(path, `${getPublicAppOrigin(env)}/`).toString();
}

export function getCheckoutSuccessUrl(env: Env = process.env): string {
  return getPublicAppUrl("/checkout/success", env);
}

export function getCheckoutCancelledUrl(env: Env = process.env): string {
  return getPublicAppUrl("/checkout/cancelled", env);
}

export function getBillingUrl(env: Env = process.env): string {
  return getPublicAppUrl("/settings/billing", env);
}
