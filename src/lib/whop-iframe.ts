import { verifyUserToken as verifyWhopUserToken } from "@whop/sdk/lib/verify-user-token";
import { createLogger } from "./logger";

export { verifyWhopUserToken as verifyUserToken };

const WHOP_USER_TOKEN_HEADER_NAME = "x-whop-user-token";
const whopIframeLogger = createLogger({ component: "whop-iframe" });

interface HeaderStoreLike {
  get(name: string): string | null;
}

export interface WhopIframeUser {
  readonly userId: string;
  readonly appId: string;
}

interface VerifyOptions {
  readonly appId: string;
  readonly dontThrow: true;
  readonly publicKey?: string;
  readonly jwksUrl?: string;
}

function whopAppId(): string | undefined {
  return process.env.WHOP_APP_ID ?? process.env.NEXT_PUBLIC_WHOP_APP_ID;
}

function buildVerifyOptions(appId: string): VerifyOptions {
  const options: {
    appId: string;
    dontThrow: true;
    publicKey?: string;
    jwksUrl?: string;
  } = { appId, dontThrow: true };

  const publicKey = process.env.WHOP_USER_TOKEN_PUBLIC_KEY;
  const jwksUrl = process.env.WHOP_USER_TOKEN_JWKS_URL;
  if (publicKey) {
    options.publicKey = publicKey;
    if (jwksUrl) {
      whopIframeLogger.warn("whop_user_token_jwks_ignored", {
        reason: "public_key_takes_precedence",
      });
    }
  } else if (jwksUrl) {
    options.jwksUrl = jwksUrl;
  }

  return options;
}

export async function verifyWhopIframeUser(
  requestHeaders: HeaderStoreLike,
): Promise<WhopIframeUser | null> {
  const token = requestHeaders.get(WHOP_USER_TOKEN_HEADER_NAME);
  const appId = whopAppId();

  if (!token || !appId) return null;

  const payload = await verifyWhopUserToken(token, buildVerifyOptions(appId));
  if (!payload) return null;

  return { userId: payload.userId, appId: payload.appId };
}