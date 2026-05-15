import { NextResponse, type NextRequest } from "next/server";

const isDev = process.env.NODE_ENV !== "production";

function createNonce(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes));
}

function buildContentSecurityPolicy(nonce: string): string {
  return [
    "default-src 'self'",
    "base-uri 'self'",
    "object-src 'none'",
    "frame-ancestors 'self' https://whop.com https://*.whop.com",
    "form-action 'self'",
    "img-src 'self' data: blob: https://yt3.ggpht.com https://i.ytimg.com",
    "font-src 'self' data:",
    `style-src 'self' 'nonce-${nonce}'`,
    "style-src-attr 'unsafe-inline'",
    `script-src 'self' 'nonce-${nonce}' https://static.cloudflareinsights.com${isDev ? " 'unsafe-eval'" : ""}`,
    "script-src-attr 'none'",
    "connect-src 'self' https://cloudflareinsights.com",
    "manifest-src 'self'",
    "worker-src 'self' blob:",
    "media-src 'self' data: blob:",
    "upgrade-insecure-requests",
  ].join("; ");
}

export function middleware(request: NextRequest): NextResponse {
  const nonce = createNonce();
  const csp = buildContentSecurityPolicy(nonce);
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", csp);

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set("Content-Security-Policy", csp);
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|robots.txt|brand/).*)"],
};