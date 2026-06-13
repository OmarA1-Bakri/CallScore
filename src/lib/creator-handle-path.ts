export function normalizeCreatorHandle(rawHandle: string): string {
  return rawHandle.trim().replace(/^@+/, "");
}

export function creatorHandlePath(rawHandle: string): string {
  return encodeURIComponent(normalizeCreatorHandle(rawHandle).toLowerCase());
}
