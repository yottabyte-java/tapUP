import bcrypt from "bcryptjs";

const PIN_LENGTH = 4;
const MAX_FAILURES = 5;
const LOCKOUT_MILLISECONDS = 15 * 60 * 1000;
const BCRYPT_ROUNDS = 10;

export interface PinLockoutState {
  failedAttempts: number;
  lockedUntil: string | null;
}

function assertPin(pin: string): void {
  if (typeof pin !== "string" || !/^\d{4}$/.test(pin)) {
    throw new TypeError(`PIN must contain exactly ${PIN_LENGTH} digits`);
  }
}

function assertLockoutState(state: PinLockoutState): void {
  if (!Number.isInteger(state.failedAttempts)
    || state.failedAttempts < 0
    || state.failedAttempts > MAX_FAILURES
  ) {
    throw new RangeError("failedAttempts must be an integer from 0 to 5");
  }

  if (state.lockedUntil !== null) {
    const lockEnd = Date.parse(state.lockedUntil);
    if (!Number.isFinite(lockEnd)) {
      throw new TypeError("lockedUntil must be a valid date or null");
    }
    if (state.failedAttempts !== MAX_FAILURES) {
      throw new RangeError("A lockout requires five failed attempts");
    }
  }
}

function timeMilliseconds(now: string | Date): number {
  const value = now instanceof Date ? now.getTime() : Date.parse(now);
  if (!Number.isFinite(value)) {
    throw new TypeError("now must be a valid date");
  }
  return value;
}

export async function hashPin(pin: string): Promise<string> {
  assertPin(pin);

  // WHY: bcryptjs is pure JavaScript, so hashing works on Vercel without native build dependencies.
  return bcrypt.hash(pin, BCRYPT_ROUNDS);
}

export async function verifyPin(pin: string, hash: string): Promise<boolean> {
  assertPin(pin);
  // WHY: Reject malformed stored data explicitly before asking bcrypt to compare credentials.
  if (typeof hash !== "string" || !/^\$2[aby]\$\d{2}\$[./A-Za-z0-9]{53}$/.test(hash)) {
    throw new TypeError("PIN hash is invalid");
  }

  // WHY: bcrypt.compare performs the salted password comparison without exposing timing by mismatch position.
  return bcrypt.compare(pin, hash);
}

export function isLocked(
  state: PinLockoutState,
  now: string | Date = new Date(),
): boolean {
  assertLockoutState(state);
  const currentTime = timeMilliseconds(now);
  if (state.lockedUntil === null) {
    return false;
  }

  // WHY: Expired locks stop blocking approval as soon as the 15-minute window ends.
  return currentTime < Date.parse(state.lockedUntil);
}

export function registerFailure(
  state: PinLockoutState,
  now: string | Date = new Date(),
): PinLockoutState {
  assertLockoutState(state);
  const currentTime = timeMilliseconds(now);

  // WHY: An active lock cannot be extended by repeated attempts while it is already enforced.
  if (state.lockedUntil !== null && currentTime < Date.parse(state.lockedUntil)) {
    return { ...state };
  }

  // WHY: A failure after an expired lock starts a fresh five-attempt window.
  const previousAttempts = state.lockedUntil === null ? state.failedAttempts : 0;
  const failedAttempts = previousAttempts + 1;
  if (failedAttempts >= MAX_FAILURES) {
    return {
      failedAttempts: MAX_FAILURES,
      lockedUntil: new Date(currentTime + LOCKOUT_MILLISECONDS).toISOString(),
    };
  }

  return {
    failedAttempts,
    lockedUntil: null,
  };
}

export function reset(): PinLockoutState {
  // WHY: A successful PIN check clears failures so old mistakes do not count against future attempts.
  return {
    failedAttempts: 0,
    lockedUntil: null,
  };
}
