import { NextResponse } from "next/server";

/** Cache-Control value used for user-specific and mutable API responses. */
export const NO_STORE_CACHE_CONTROL = "no-store";

/** Build no-store headers for NextResponse.json or redirect options. */
export function noStoreHeaders(): HeadersInit {
  return { "Cache-Control": NO_STORE_CACHE_CONTROL };
}

/** Mutate a NextResponse to add no-store caching while preserving its subtype. */
export function withNoStore<T extends NextResponse>(response: T): T {
  response.headers.set("Cache-Control", NO_STORE_CACHE_CONTROL);
  return response;
}
