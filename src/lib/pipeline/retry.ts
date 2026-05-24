export async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  opts: { maxAttempts?: number; baseDelayMs?: number; shouldRetry?: (err: Error) => boolean } = {}
): Promise<T> {
  const { maxAttempts = 3, baseDelayMs = 2000, shouldRetry = () => true } = opts;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      if (attempt === maxAttempts || !shouldRetry(err as Error)) throw err;
      await new Promise((r) => setTimeout(r, baseDelayMs * Math.pow(2, attempt - 1)));
    }
  }
  throw new Error("unreachable");
}
