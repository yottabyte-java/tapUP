export type RateLimitPolicy = {
  limit: number;
  windowMs: number;
};

export type RateLimitResult = {
  allowed: boolean;
  limit: number;
  remaining: number;
  resetAt: number;
  retryAfterSeconds: number;
};

const FIFTEEN_MINUTES = 15 * 60 * 1_000;
const ONE_MINUTE = 60 * 1_000;

export const RATE_LIMITS = {
  login: { limit: 10, windowMs: FIFTEEN_MINUTES },
  pin: { limit: 5, windowMs: FIFTEEN_MINUTES },
  lenderApi: { limit: 60, windowMs: ONE_MINUTE },
} as const satisfies Record<string, RateLimitPolicy>;

type FixedWindow = {
  count: number;
  resetAt: number;
};

const MAX_TRACKED_KEYS = 20_000;
const CLEANUP_INTERVAL = 256;
const windows = new Map<string, FixedWindow>();
let checksSinceCleanup = 0;

// WHY: This fixed-window map is intentionally demo-only; production instances need a shared
// atomic store such as Upstash Redis so limits are consistent across workers and deployments.
export function checkRateLimit(
  ipAddress: string,
  route: string,
  policy: RateLimitPolicy,
  now = Date.now(),
): RateLimitResult {
  if (!Number.isSafeInteger(policy.limit) || policy.limit < 1) {
    throw new RangeError("Rate-limit policy limit must be a positive safe integer");
  }
  if (!Number.isSafeInteger(policy.windowMs) || policy.windowMs < 1) {
    throw new RangeError("Rate-limit window must be a positive safe integer");
  }
  if (!Number.isFinite(now)) {
    throw new TypeError("Rate-limit clock must be finite");
  }

  const normalizedIp = ipAddress.trim().slice(0, 128) || "unknown";
  const normalizedRoute = route.trim().slice(0, 128);
  if (!normalizedRoute) {
    throw new TypeError("Rate-limit route must not be empty");
  }

  checksSinceCleanup += 1;
  if (checksSinceCleanup >= CLEANUP_INTERVAL || windows.size >= MAX_TRACKED_KEYS) {
    for (const [key, entry] of windows) {
      if (entry.resetAt <= now) windows.delete(key);
    }
    checksSinceCleanup = 0;
  }

  const key = `${normalizedIp}\u0000${normalizedRoute}`;
  let entry = windows.get(key);
  if (!entry || entry.resetAt <= now) {
    if (!entry && windows.size >= MAX_TRACKED_KEYS) {
      // WHY: Refusing new keys at capacity avoids unbounded memory growth without evicting live limits.
      return {
        allowed: false,
        limit: policy.limit,
        remaining: 0,
        resetAt: now + policy.windowMs,
        retryAfterSeconds: Math.ceil(policy.windowMs / 1_000),
      };
    }
    entry = { count: 0, resetAt: now + policy.windowMs };
    windows.set(key, entry);
  }

  if (entry.count >= policy.limit) {
    return {
      allowed: false,
      limit: policy.limit,
      remaining: 0,
      resetAt: entry.resetAt,
      retryAfterSeconds: Math.max(1, Math.ceil((entry.resetAt - now) / 1_000)),
    };
  }

  entry.count += 1;
  return {
    allowed: true,
    limit: policy.limit,
    remaining: policy.limit - entry.count,
    resetAt: entry.resetAt,
    retryAfterSeconds: 0,
  };
}

// WHY: Use proxy-provided client addresses for stable IP buckets, preferring the single-address
// x-real-ip value and the rightmost address in a forwarded chain added by the trusted edge.
export function getClientIp(requestHeaders: Headers): string {
  const realIp = requestHeaders.get("x-real-ip")?.trim();
  if (realIp && realIp.length <= 128 && !/[\s,]/.test(realIp)) return realIp;

  const forwardedFor = requestHeaders.get("x-forwarded-for");
  if (forwardedFor) {
    const addresses = forwardedFor.split(",").map((address) => address.trim()).filter(Boolean);
    const edgeClientIp = addresses.at(-1);
    if (edgeClientIp && edgeClientIp.length <= 128 && !/[\s,]/.test(edgeClientIp)) {
      return edgeClientIp;
    }
  }

  return "unknown";
}
