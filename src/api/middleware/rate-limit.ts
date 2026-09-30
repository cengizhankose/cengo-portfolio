// Read rate limit for /api/* (T-08, SEC-10 / BE-18): an in-memory token bucket
// per client, 60 requests per minute by default (capacity 60, refilled at one
// token per second). Over the limit: 429 with the T-01 envelope
// `{ error: "Too many requests", code: "RATE_LIMITED" }` (errorHandler),
// `Retry-After`, `RateLimit-Limit` and `RateLimit-Remaining`.
//
// - Memory is bounded: at most `maxKeys` (10 000) buckets. Buckets are kept in
//   least-recently-used order, so idle ones (untouched for 10 min) are swept
//   from the front in amortised O(1); if the map is still full the least
//   recently used bucket is dropped.
// - One process only (Out Plane runs 1 instance). With more instances each
//   keeps its own counters and the effective limit multiplies: move the
//   buckets to a shared store (Redis/Postgres) before scaling out.
// - The client key is never logged.
// - RL_READ_PER_MIN tunes the limit, RATE_LIMIT_DISABLED=1 turns it off; both
//   without a code change (BE-18 rollback).
import type { Context, MiddlewareHandler } from "hono";
import { getConnInfo } from "hono/bun";
import { HTTPException } from "hono/http-exception";
import { isIP } from "node:net";
import { CLOUDFLARE_HOSTS, requestHost } from "./canonical-host";

export const DEFAULT_READ_PER_MIN = 60;
export const DEFAULT_MAX_KEYS = 10_000;
export const DEFAULT_IDLE_MS = 10 * 60_000;
/** Absorbs float drift from fractional refills (e.g. 12 s at 5/min adding up to 0.9999…). */
const TOKEN_EPSILON = 1e-9;
/** Upper bound for RL_READ_PER_MIN; larger values fall back to the default. */
const MAX_READ_PER_MIN = 100_000;

interface Bucket {
  tokens: number;
  /** Clock value (ms) of the last refill, i.e. the last time the key was seen. */
  last: number;
}

export interface TakeResult {
  allowed: boolean;
  /** Whole tokens left after this request. */
  remaining: number;
  /** Seconds until one token is available again (0 when allowed). */
  retryAfterS: number;
}

export interface TokenBucketOptions {
  /** Burst size: requests allowed back to back from a full bucket. */
  capacity: number;
  /** Tokens added per second. */
  refillPerSec: number;
  /** Most buckets kept in memory. */
  maxKeys?: number;
  /** A bucket untouched this long (ms) is dropped. */
  idleMs?: number;
  /** Monotonic clock in ms; injectable for tests. */
  now?: () => number;
}

export class TokenBucketStore {
  readonly capacity: number;
  readonly refillPerSec: number;
  readonly maxKeys: number;
  readonly idleMs: number;
  readonly now: () => number;
  // Map iteration order = insertion order; every take() re-inserts its key,
  // so the first entries are always the least recently used ones.
  readonly #buckets = new Map<string, Bucket>();

  constructor({
    capacity,
    refillPerSec,
    maxKeys = DEFAULT_MAX_KEYS,
    idleMs = DEFAULT_IDLE_MS,
    now = () => performance.now(),
  }: TokenBucketOptions) {
    if (!(capacity >= 1) || !(refillPerSec > 0) || !(maxKeys >= 1)) {
      throw new RangeError(
        "TokenBucketStore: invalid capacity, refill or maxKeys",
      );
    }
    this.capacity = capacity;
    this.refillPerSec = refillPerSec;
    this.maxKeys = maxKeys;
    this.idleMs = idleMs;
    this.now = now;
  }

  /** Buckets currently held. */
  get size(): number {
    return this.#buckets.size;
  }

  /** Spends one token for `key` if it has one. */
  take(key: string): TakeResult {
    const now = this.now();
    this.sweep(now);

    let bucket = this.#buckets.get(key);
    if (bucket) {
      this.#buckets.delete(key); // re-inserted below: most recently used
      const elapsedS = Math.max(0, now - bucket.last) / 1000;
      bucket.tokens = Math.min(
        this.capacity,
        bucket.tokens + elapsedS * this.refillPerSec,
      );
      bucket.last = now;
    } else {
      if (this.#buckets.size >= this.maxKeys) this.#evictOldest();
      bucket = { tokens: this.capacity, last: now };
    }
    this.#buckets.set(key, bucket);

    if (bucket.tokens >= 1 - TOKEN_EPSILON) {
      bucket.tokens = Math.max(0, bucket.tokens - 1);
      return {
        allowed: true,
        remaining: Math.floor(bucket.tokens),
        retryAfterS: 0,
      };
    }
    return {
      allowed: false,
      remaining: 0,
      retryAfterS: Math.max(
        1,
        Math.ceil((1 - bucket.tokens) / this.refillPerSec),
      ),
    };
  }

  /** Drops buckets idle for `idleMs` or longer; stops at the first recent one. */
  sweep(now: number = this.now()): void {
    for (const [key, bucket] of this.#buckets) {
      if (now - bucket.last < this.idleMs) break;
      this.#buckets.delete(key);
    }
  }

  #evictOldest(): void {
    const oldest = this.#buckets.keys().next();
    if (!oldest.done) this.#buckets.delete(oldest.value);
  }
}

/**
 * The client a request is counted against (T-08):
 *
 * 1. On the Cloudflare-proxied hosts (www, apex) `CF-Connecting-IP`, which
 *    Cloudflare sets to the visitor's address.
 * 2. Everywhere else (the default *.outplane.app address skips Cloudflare, so
 *    anybody could send that header there, SEC-30), or when it is missing: the
 *    right-most `X-Forwarded-For` entry, the address the platform proxy saw.
 * 3. Otherwise the socket address (`hono/bun` getConnInfo).
 *
 * Values that are not IP addresses are ignored. IPv6 clients are grouped by
 * their /64 network, which one subscriber usually owns in full, so rotating
 * addresses inside it does not reset the limit. `CF-Connecting-IP` can still
 * be forged by a request that reaches the origin directly with a canonical
 * Host; only an origin IP allowlist (open question S13) closes that.
 */
export function clientKey(c: Context): string {
  if (CLOUDFLARE_HOSTS.has(requestHost(c))) {
    const viaCloudflare = ipKey(c.req.header("cf-connecting-ip"));
    if (viaCloudflare) return viaCloudflare;
  }
  const forwarded = c.req.header("x-forwarded-for")?.split(",");
  const fromProxy = ipKey(forwarded?.[forwarded.length - 1]);
  if (fromProxy) return fromProxy;
  try {
    return ipKey(getConnInfo(c).remote.address) ?? "unknown";
  } catch {
    return "unknown"; // no Bun server in c.env (app.request in tests)
  }
}

/** Normalised bucket key for an address, or null when it is not an IP. */
export function ipKey(raw: string | undefined): string | null {
  let value = raw?.trim() ?? "";
  if (value.startsWith("[") && value.endsWith("]")) value = value.slice(1, -1);
  switch (isIP(value)) {
    case 4:
      return value;
    case 6: {
      const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(value);
      if (mapped && isIP(mapped[1]) === 4) return mapped[1];
      const groups = ipv6Groups(value);
      return groups ? `${groups.slice(0, 4).join(":")}::/64` : null;
    }
    default:
      return null;
  }
}

/** The eight 16-bit groups of a valid IPv6 address, lower-case, no leading zeros. */
function ipv6Groups(address: string): string[] | null {
  let text = address.toLowerCase().split("%")[0]; // drop a zone id
  const v4 = /(\d+\.\d+\.\d+\.\d+)$/.exec(text);
  if (v4) {
    const [a, b, c, d] = v4[1].split(".").map(Number);
    text =
      text.slice(0, -v4[1].length) +
      `${((a << 8) | b).toString(16)}:${((c << 8) | d).toString(16)}`;
  }
  const [head, tail] = text.split("::");
  const left = head ? head.split(":") : [];
  const right = tail === undefined ? [] : tail ? tail.split(":") : [];
  const missing = 8 - left.length - right.length;
  if (missing < 0 || (tail === undefined && missing !== 0)) return null;
  const groups = [...left, ...Array<string>(missing).fill("0"), ...right];
  return groups.map((g) => parseInt(g, 16).toString(16));
}

export interface RateLimitOptions {
  store: TokenBucketStore;
  /** Maps a request to its bucket; default clientKey. */
  key?: (c: Context) => string;
}

export function rateLimit({
  store,
  key = clientKey,
}: RateLimitOptions): MiddlewareHandler {
  const limit = String(store.capacity);
  return async (c, next) => {
    const result = store.take(key(c));
    if (result.allowed) return next();
    // errorHandler turns this into the T-01 envelope (code RATE_LIMITED) and
    // copies these headers. Limit/Remaining are sent on the 429 only: /api GET
    // responses become shared edge-cache entries (BE-06), where a per-client
    // counter would be wrong for everyone else.
    throw new HTTPException(429, {
      message: "Too many requests",
      res: new Response(null, {
        status: 429,
        headers: {
          "Retry-After": String(result.retryAfterS),
          "RateLimit-Limit": limit,
          "RateLimit-Remaining": "0",
        },
      }),
    });
  };
}

export interface RateLimitSettings {
  enabled: boolean;
  perMinute: number;
}

/** RATE_LIMIT_DISABLED=1|true turns the limiter off; RL_READ_PER_MIN is a positive integer, else 60. */
export function rateLimitSettingsFromEnv(
  env: Record<string, string | undefined>,
): RateLimitSettings {
  const disabled = env.RATE_LIMIT_DISABLED?.trim().toLowerCase();
  const perMinute = Number(env.RL_READ_PER_MIN?.trim());
  return {
    enabled: !(disabled === "1" || disabled === "true"),
    perMinute:
      Number.isInteger(perMinute) &&
      perMinute >= 1 &&
      perMinute <= MAX_READ_PER_MIN
        ? perMinute
        : DEFAULT_READ_PER_MIN,
  };
}

/** The T-08 read bucket: `perMinute` requests, refilled evenly over a minute. */
export function readBucketStore(
  perMinute: number,
  now?: () => number,
): TokenBucketStore {
  return new TokenBucketStore({
    capacity: perMinute,
    refillPerSec: perMinute / 60,
    now,
  });
}
