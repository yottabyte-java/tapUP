import { describe, expect, it } from "vitest";
import { createSaleToken, verifySaleToken } from "@/lib/qr";

const now = new Date("2026-10-17T00:00:00.000Z");

describe("sale tokens", () => {
  it("accepts a valid, unused token before its five-minute expiry", () => {
    const saleToken = createSaleToken(now);

    expect(saleToken.token).toMatch(/^[0-9a-f]{32}$/);
    expect(saleToken.expiresAt).toBe("2026-10-17T00:05:00.000Z");
    expect(
      verifySaleToken(saleToken.token, saleToken.tokenHash, saleToken.expiresAt, null, now),
    ).toBe("ok");
  });

  it("expires a token exactly five minutes after creation", () => {
    const saleToken = createSaleToken(now);
    const fiveMinutesLater = new Date(now.getTime() + 5 * 60 * 1000);

    expect(
      verifySaleToken(
        saleToken.token,
        saleToken.tokenHash,
        saleToken.expiresAt,
        null,
        fiveMinutesLater,
      ),
    ).toBe("expired");
  });

  it("rejects a token that has already been used", () => {
    const saleToken = createSaleToken(now);
    const usedAt = new Date(now.getTime() + 1_000);

    expect(
      verifySaleToken(saleToken.token, saleToken.tokenHash, saleToken.expiresAt, usedAt, now),
    ).toBe("used");
  });

  it("rejects a token whose value has been tampered with", () => {
    const saleToken = createSaleToken(now);
    const tamperedToken = `${saleToken.token[0] === "0" ? "1" : "0"}${saleToken.token.slice(1)}`;

    expect(
      verifySaleToken(tamperedToken, saleToken.tokenHash, saleToken.expiresAt, null, now),
    ).toBe("invalid");
  });
});
