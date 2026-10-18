// Waiting for the server without ever guessing: a request that fails or does
// not answer in time is "unconfirmed" -- NOT "failed" (it may still have been
// saved). The caller retries with the SAME idempotency key, and a late answer
// is still delivered through onLate.

export type Outcome<T> = { kind: "value"; value: T } | { kind: "unconfirmed" };

export function settle<T>(
  promise: Promise<T>,
  timeoutMs: number,
  onLate?: (value: T) => void
): Promise<Outcome<T>> {
  return new Promise((resolve) => {
    let done = false;
    const timer = setTimeout(() => {
      if (done) return;
      done = true;
      resolve({ kind: "unconfirmed" });
    }, timeoutMs);

    promise.then(
      (value) => {
        if (done) {
          onLate?.(value);
          return;
        }
        done = true;
        clearTimeout(timer);
        resolve({ kind: "value", value });
      },
      () => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        resolve({ kind: "unconfirmed" });
      }
    );
  });
}

export const UNCONFIRMED_MESSAGE =
  "The server didn't answer, so this isn't confirmed. Don't give change or let the customer go until this says it's paid.";
