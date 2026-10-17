import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

const TOKEN_BYTES = 16;
const TOKEN_LIFETIME_MILLISECONDS = 5 * 60 * 1000;

export interface SaleToken {
  token: string;
  tokenHash: string;
  expiresAt: string;
}

export type SaleTokenStatus = "ok" | "expired" | "used" | "invalid";

function sha256Hex(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function toMilliseconds(value: string | Date): number | null {
  const milliseconds = value instanceof Date ? value.getTime() : Date.parse(value);
  return Number.isFinite(milliseconds) ? milliseconds : null;
}

export function createSaleToken(now: string | Date = new Date()): SaleToken {
  const currentTime = toMilliseconds(now);
  if (currentTime === null) {
    throw new TypeError("now must be a valid date");
  }

  const token = randomBytes(TOKEN_BYTES).toString("hex");
  return {
    token,
    tokenHash: sha256Hex(token),
    expiresAt: new Date(currentTime + TOKEN_LIFETIME_MILLISECONDS).toISOString(),
  };
}

export function verifySaleToken(
  token: string,
  storedHash: string | null,
  expiresAt: string | Date | null,
  usedAt: string | Date | null,
  now: string | Date = new Date(),
): SaleTokenStatus {
  if (
    typeof token !== "string"
    || !/^[0-9a-f]{32}$/.test(token)
    || typeof storedHash !== "string"
    || !/^[0-9a-f]{64}$/.test(storedHash)
    || expiresAt === null
  ) {
    return "invalid";
  }

  // WHY: Persisting only a one-way hash limits the damage if the sales table is exposed.
  const candidateHash = Buffer.from(sha256Hex(token), "hex");
  const expectedHash = Buffer.from(storedHash, "hex");
  if (!timingSafeEqual(candidateHash, expectedHash)) {
    return "invalid";
  }

  // WHY: A known token already marked used must never become valid again, even if its expiry also passed.
  if (usedAt !== null) {
    return "used";
  }

  const expirationTime = toMilliseconds(expiresAt);
  const currentTime = toMilliseconds(now);
  if (expirationTime === null || currentTime === null) {
    return "invalid";
  }
  if (currentTime >= expirationTime) {
    return "expired";
  }

  // WHY: The caller must atomically set used_at when this check succeeds so concurrent requests cannot replay it.
  return "ok";
}
