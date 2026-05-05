export function creatorHandlePath(handle: string): string {
  const normalized = handle.trim().replace(/^@+/, "").toLowerCase();
  return encodeURIComponent(normalized || handle.trim());
}
