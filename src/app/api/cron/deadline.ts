const DEFAULT_CRON_DEADLINE_MS = 50_000;

export function createCronDeadlineSignal(timeoutMs = DEFAULT_CRON_DEADLINE_MS): AbortSignal {
  return AbortSignal.timeout(timeoutMs);
}

export function isCronDeadlineExceeded(signal: AbortSignal | undefined): boolean {
  return signal?.aborted ?? false;
}

export function throwIfCronDeadlineExceeded(signal: AbortSignal | undefined): void {
  if (!signal?.aborted) return;

  const reason = signal.reason;
  if (reason instanceof Error) throw reason;

  throw new DOMException("Cron deadline exceeded", "AbortError");
}

export async function withCronDeadline<T>(
  workFactory: (signal: AbortSignal) => Promise<T>,
  signal: AbortSignal,
): Promise<{ readonly completed: true; readonly value: T } | { readonly completed: false }> {
  if (signal.aborted) return { completed: false };
  const work = workFactory(signal);

  return new Promise((resolve, reject) => {
    const onAbort = (): void => {
      resolve({ completed: false });
    };
    signal.addEventListener("abort", onAbort, { once: true });

    work.then(
      (value) => {
        signal.removeEventListener("abort", onAbort);
        resolve({ completed: true, value });
      },
      (error: unknown) => {
        signal.removeEventListener("abort", onAbort);
        // Treat the failure as a deadline miss only when the signal aborted
        // AND the error came from that abort (AbortError). Otherwise the
        // failure is unrelated and must propagate so callers can observe it.
        if (signal.aborted && isAbortError(error)) {
          resolve({ completed: false });
          return;
        }
        reject(error);
      },
    );
  });
}

function isAbortError(error: unknown): boolean {
  if (error instanceof DOMException) return error.name === "AbortError";
  return (
    typeof error === "object" &&
    error !== null &&
    "name" in error &&
    (error as { name: unknown }).name === "AbortError"
  );
}
