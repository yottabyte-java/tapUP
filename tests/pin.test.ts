import { describe, expect, it } from "vitest";
import {
  isLocked,
  registerFailure,
  reset,
  verifyPin,
  type PinLockoutState,
} from "@/lib/pin";

const DEMO_PIN_HASH =
  "$2b$10$c7.9pRKnnHbm4p8iiLoGWO3VeFWfBKxYX8l6phC0.UTyc1QNhtLue";
const now = new Date("2026-10-17T00:00:00.000Z");

describe("PIN verification", () => {
  it("verifies the seeded demo PIN hash", async () => {
    expect(await verifyPin("2468", DEMO_PIN_HASH)).toBe(true);
  });

  it("rejects a wrong PIN against the seeded demo hash", async () => {
    expect(await verifyPin("1357", DEMO_PIN_HASH)).toBe(false);
  });
});

describe("PIN lockout", () => {
  it("locks after five failed attempts", () => {
    let state: PinLockoutState = { failedAttempts: 0, lockedUntil: null };
    for (let attempt = 0; attempt < 5; attempt += 1) {
      state = registerFailure(state, now);
    }

    expect(state).toEqual({
      failedAttempts: 5,
      lockedUntil: "2026-10-17T00:15:00.000Z",
    });
    expect(isLocked(state, now)).toBe(true);
  });

  it("unlocks when the 15-minute lockout window ends", () => {
    const lockedState: PinLockoutState = {
      failedAttempts: 5,
      lockedUntil: "2026-10-17T00:15:00.000Z",
    };
    const unlockedAt = new Date("2026-10-17T00:15:00.000Z");

    expect(isLocked(lockedState, unlockedAt)).toBe(false);
    // WHY: The first failure after expiry starts a fresh attempt window rather than relocking the customer.
    expect(registerFailure(lockedState, unlockedAt)).toEqual({
      failedAttempts: 1,
      lockedUntil: null,
    });
  });

  it("clears the failure count after a successful approval", () => {
    expect(reset()).toEqual({ failedAttempts: 0, lockedUntil: null });
  });
});
