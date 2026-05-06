import { NextResponse } from "next/server";

export const NO_STORE_CACHE_CONTROL = "no-store";

export function noStoreHeaders(): HeadersInit {
  return { "Cache-Control": NO_STORE_CACHE_CONTROL };
}

export function withNoStore<T extends NextResponse>(response: T): T {
  response.headers.set("Cache-Control", NO_STORE_CACHE_CONTROL);
  return response;
}
