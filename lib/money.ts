// WHY: Binary floating-point cannot exactly represent many decimal amounts, so money is
// parsed and combined as integer cents to prevent rounding errors from changing a sale.

function assertCents(cents: number, name: string): void {
  if (!Number.isSafeInteger(cents) || cents < 0) {
    throw new RangeError(`${name} must be a non-negative safe integer number of cents`);
  }
}

export function toCents(rand: number | string): number {
  let source: string;

  if (typeof rand === "number") {
    if (!Number.isFinite(rand)) {
      throw new TypeError("rand must be a finite amount");
    }
    if (rand < 0) {
      throw new RangeError("rand cannot be negative");
    }
    source = rand.toString();
  } else {
    source = rand.trim();
    if (source.startsWith("-")) {
      throw new RangeError("rand cannot be negative");
    }
  }

  const match = /^(\+?)(\d*)(?:\.(\d*))?(?:[eE]([+-]?\d+))?$/.exec(source);
  if (!match || (!match[2] && !match[3])) {
    throw new TypeError("rand must be a non-negative decimal amount");
  }

  const whole = match[2] ?? "";
  const fraction = match[3] ?? "";
  const exponent = match[4] ? Number(match[4]) : 0;
  if (!Number.isSafeInteger(exponent)) {
    throw new RangeError("rand is outside the supported amount range");
  }

  const digits = `${whole}${fraction}`.replace(/^0+/, "") || "0";
  if (digits === "0") {
    return 0;
  }

  if (exponent > fraction.length + 16) {
    throw new RangeError("rand is outside the supported amount range");
  }
  if (exponent < -source.length - 2) {
    return 0;
  }

  const centsShift = exponent - fraction.length + 2;
  if (centsShift >= 0) {
    const centsDigits = `${digits}${"0".repeat(centsShift)}`;
    if (centsDigits.length > 16) {
      throw new RangeError("rand is outside the supported amount range");
    }

    const cents = Number(centsDigits);
    assertCents(cents, "converted amount");
    return cents;
  }

  const centsPosition = digits.length + centsShift;
  if (centsPosition < 0) {
    return 0;
  }

  const wholeCents = centsPosition === 0 ? "0" : digits.slice(0, centsPosition);
  const roundsUp = digits[centsPosition] >= "5";
  const cents = Number(wholeCents) + (roundsUp ? 1 : 0);
  assertCents(cents, "converted amount");
  return cents;
}

export function formatRand(cents: number): string {
  assertCents(cents, "cents");

  const digits = cents.toString();
  const whole = (digits.length > 2 ? digits.slice(0, -2) : "0")
    .replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  const fraction = digits.slice(-2).padStart(2, "0");

  return `R${whole}.${fraction}`;
}

export function addCents(leftCents: number, rightCents: number): number {
  assertCents(leftCents, "leftCents");
  assertCents(rightCents, "rightCents");

  const total = leftCents + rightCents;
  assertCents(total, "total");
  return total;
}

export function subCents(leftCents: number, rightCents: number): number {
  assertCents(leftCents, "leftCents");
  assertCents(rightCents, "rightCents");

  const difference = leftCents - rightCents;
  assertCents(difference, "difference");
  return difference;
}

export function clampCents(cents: number, minCents: number, maxCents: number): number {
  assertCents(cents, "cents");
  assertCents(minCents, "minCents");
  assertCents(maxCents, "maxCents");

  if (minCents > maxCents) {
    throw new RangeError("minCents cannot be greater than maxCents");
  }

  return Math.min(maxCents, Math.max(minCents, cents));
}
