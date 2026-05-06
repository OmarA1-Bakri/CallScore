const DEFAULT_CRON_DEADLINE_MS = 50_000;

export function createCronDeadlineSignal(timeoutMs = DEFAULT_CRON_DEADLINE_MS): AbortSignal {
  return AbortSignal.timeout(timeoutMs);
}

export function isCronDeadlineExceeded(signal: AbortSignal): boolean {
  return signal.aborted;
}

export function throwIfCronDeadlineExceeded(signal: AbortSignal): void {
  if (!signal.aborted) return;

  const reason = signal.reason;
  if (reason instanceof Error) throw reason;

  throw new DOMException("Cron deadline exceeded", "AbortError");
}

export async function withCronDeadline<T>(
  work: Promise<T>,
  signal: AbortSignal,
): Promise<{ readonly completed: true; readonly value: T } | { readonly completed: false }> {
  if (signal.aborted) return { completed: false };

  return Promise.race([
    work
      .then((value) => ({ completed: true as const, value }))
      .catch((error: unknown) => {
        if (signal.aborted) return { completed: false as const };
        throw error;
      }),
    new Promise<{ readonly completed: false }>((resolve) => {
      signal.addEventListener("abort", () => resolve({ completed: false }), { once: true });
    }),
  ]);
}
