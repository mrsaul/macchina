import "server-only";

// Sliding-window limiter kept in memory. Good enough to stop a runaway client
// in dev and on a single server, but on Vercel each function instance has its
// own memory: replace with a shared store (Upstash Redis, Postgres) before
// relying on it in production.

const hits = new Map<string, number[]>();
let lastSweep = Date.now();

export type RateLimitResult = { ok: true } | { ok: false; retryAfterSeconds: number };

export function rateLimit(key: string, limit: number, windowMs: number): RateLimitResult {
  const now = Date.now();

  // Drop stale keys now and then so the map cannot grow without bound.
  if (now - lastSweep > windowMs) {
    for (const [k, times] of hits) if (times.every((t) => now - t >= windowMs)) hits.delete(k);
    lastSweep = now;
  }

  const recent = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
  if (recent.length >= limit) {
    hits.set(key, recent);
    return { ok: false, retryAfterSeconds: Math.ceil((recent[0] + windowMs - now) / 1000) };
  }
  recent.push(now);
  hits.set(key, recent);
  return { ok: true };
}
