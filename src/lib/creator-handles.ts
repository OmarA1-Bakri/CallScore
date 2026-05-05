export function creatorHandlePath(handle: string): string {
  const normalized = handle.trim().replace(/^@+/, "");
  return encodeURIComponent(normalized || handle.trim());
}
