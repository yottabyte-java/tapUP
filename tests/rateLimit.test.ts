import { describe, expect, it } from "vitest";
import { checkRateLimit, getClientIp } from "@/lib/rateLimit";

describe("fixed-window rate limiter", () => {
  it("blocks requests beyond the limit until the window resets", () => {
    const policy = { limit: 2, windowMs: 60_000 };
    const first = checkRateLimit("192.0.2.1", "login-test", policy, 1_000);
    const second = checkRateLimit("192.0.2.1", "login-test", policy, 2_000);
    const blocked = checkRateLimit("192.0.2.1", "login-test", policy, 3_000);

    expect(first).toMatchObject({ allowed: true, remaining: 1 });
    expect(second).toMatchObject({ allowed: true, remaining: 0 });
    expect(blocked).toMatchObject({
      allowed: false,
      remaining: 0,
      resetAt: 61_000,
      retryAfterSeconds: 58,
    });
  });

  it("starts a new window after expiry and separates IP and route keys", () => {
    const policy = { limit: 1, windowMs: 10_000 };
    expect(checkRateLimit("192.0.2.2", "pin-a-test", policy, 5_000).allowed).toBe(true);
    expect(checkRateLimit("192.0.2.3", "pin-a-test", policy, 5_000).allowed).toBe(true);
    expect(checkRateLimit("192.0.2.2", "pin-b-test", policy, 5_000).allowed).toBe(true);
    expect(checkRateLimit("192.0.2.2", "pin-a-test", policy, 15_000).allowed).toBe(true);
  });

  it("prefers a single real-ip address and takes the rightmost forwarded address", () => {
    expect(getClientIp(new Headers({
      "x-real-ip": "198.51.100.4",
      "x-forwarded-for": "198.51.100.1, 198.51.100.2",
    }))).toBe("198.51.100.4");
    expect(getClientIp(new Headers({
      "x-forwarded-for": "198.51.100.1, 198.51.100.2",
    }))).toBe("198.51.100.2");
    expect(getClientIp(new Headers())).toBe("unknown");
  });
});
