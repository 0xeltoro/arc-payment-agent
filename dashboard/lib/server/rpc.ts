import "server-only";

// Every RPC call in the app (payments scan, forward poll, status route)
// funnels through here. The free-tier endpoint 429s well before any single
// caller's own concurrency limit is hit — a status request landing mid-scan
// got hit with a bare 429 and no retry, taking the whole route down (500).
// So: a global minimum gap between dispatched requests (the scan can't
// starve everyone else by bursting), plus retry-with-backoff on 429s so a
// transient rate limit doesn't surface as a hard failure to callers.
const MIN_GAP_MS = 200;
const MAX_RETRIES = 8;
const RETRY_BASE_MS = 750;
const RETRY_MAX_MS = 20_000;

let gate: Promise<void> = Promise.resolve();

function sleep(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

function isRateLimited(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return msg.includes("429") || msg.includes("Too Many Requests");
}

function nextSlot(): Promise<void> {
  const slot = gate.then(() => sleep(MIN_GAP_MS));
  gate = slot;
  return slot;
}

/** Runs `fn` behind the shared pacing gate, retrying 429s with backoff. */
export async function rpcCall<T>(fn: () => Promise<T>): Promise<T> {
  let attempt = 0;
  for (;;) {
    await nextSlot();
    try {
      return await fn();
    } catch (err) {
      attempt++;
      if (attempt > MAX_RETRIES || !isRateLimited(err)) throw err;
      const backoff = Math.min(RETRY_BASE_MS * 2 ** attempt, RETRY_MAX_MS) + Math.random() * 250;
      await sleep(backoff);
    }
  }
}
