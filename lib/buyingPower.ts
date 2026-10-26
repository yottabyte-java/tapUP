import { formatRand } from "@/lib/money";

const HISTORY_DAYS = 30;
const DAY_MILLISECONDS = 24 * 60 * 60 * 1000;
const MAX_LIMIT_CENTS = 30_000;
const LIMIT_STEP_CENTS = 5_000;

// WHY: Requests and expired/cancelled sales are not purchases until payment or tab approval completes.
const COMPLETED_STATUSES = new Set(["approved", "paid", "repaid"]);

// WHY: These score bands map directly to the MVP's explainable R50 steps and R300 cap.
const LIMIT_BANDS = [
  { minimumScore: 0, limitCents: 0 },
  { minimumScore: 10, limitCents: 5_000 },
  { minimumScore: 20, limitCents: 10_000 },
  { minimumScore: 35, limitCents: 15_000 },
  { minimumScore: 50, limitCents: 20_000 },
  { minimumScore: 65, limitCents: 25_000 },
  { minimumScore: 80, limitCents: 30_000 },
] as const;

export type SaleStatus =
  | "pending"
  | "tab_requested"
  | "approved"
  | "paid"
  | "repaid"
  | "expired"
  | "cancelled";

export type SaleMethod = "tab" | "demo_card" | "cash" | "pending";
export type ImmediatePaymentMethod = "cash" | "demo_card";

export interface BuyingPowerSale {
  id: string;
  createdAt: string | Date;
  totalCents: number;
  method: SaleMethod;
  status: SaleStatus;
  tabCents?: number;
  paidNowCents?: number;
  paidNowMethod?: ImmediatePaymentMethod | null;
  dueAt?: string | Date | null;
}

export interface BuyingPowerRepayment {
  saleId: string;
  amountCents: number;
  paidAt: string | Date;
  onTime: boolean;
}

export interface BuyingPowerHistory {
  sales: BuyingPowerSale[];
  repayments: BuyingPowerRepayment[];
}

export function hasCompletedPurchase(
  history: BuyingPowerHistory,
  now: string | Date,
): boolean {
  const nowMilliseconds = timestamp(now, "now");
  const start = nowMilliseconds - HISTORY_DAYS * DAY_MILLISECONDS;
  return history.sales.some((sale) =>
    COMPLETED_STATUSES.has(sale.status)
      && isInWindow(sale.createdAt, start, nowMilliseconds, "sale.createdAt"),
  );
}

export interface BuyingPowerResult {
  limitCents: number;
  level: number;
  score: number;
  pointsToNextLevel: number;
  nextLimitCents: number;
  reasons: string[];
}

function assertCents(value: number, name: string, allowZero = true): void {
  if (
    !Number.isSafeInteger(value)
    || value < 0
    || (!allowZero && value === 0)
  ) {
    throw new RangeError(`${name} must be a ${allowZero ? "non-negative" : "positive"} safe integer in cents`);
  }
}

function timestamp(value: string | Date, name: string): number {
  const milliseconds = value instanceof Date ? value.getTime() : Date.parse(value);
  if (!Number.isFinite(milliseconds)) {
    throw new TypeError(`${name} must be a valid date`);
  }
  return milliseconds;
}

function isInWindow(value: string | Date, start: number, end: number, name: string): boolean {
  const milliseconds = timestamp(value, name);
  return milliseconds >= start && milliseconds <= end;
}

function weightedSpendCents(sale: BuyingPowerSale): number {
  assertCents(sale.totalCents, "sale.totalCents", false);

  if (sale.method === "cash") {
    // WHY: Cash purchases count at half value because they are easier to misattribute.
    return Math.floor(sale.totalCents / 2);
  }

  if (sale.method !== "tab") {
    return sale.totalCents;
  }

  const tabCents = sale.tabCents ?? sale.totalCents - (sale.paidNowCents ?? 0);
  const paidNowCents = sale.paidNowCents ?? sale.totalCents - tabCents;
  assertCents(tabCents, "sale.tabCents");
  assertCents(paidNowCents, "sale.paidNowCents");

  if (tabCents + paidNowCents !== sale.totalCents) {
    throw new RangeError("A tab sale's tab and immediate amounts must equal its total");
  }
  if (paidNowCents > 0 && !sale.paidNowMethod) {
    throw new TypeError("sale.paidNowMethod is required when immediate payment is recorded");
  }

  // WHY: A tab is still a real purchase; only its cash-paid portion receives the cash discount.
  const paidNowWeight = sale.paidNowMethod === "cash"
    ? Math.floor(paidNowCents / 2)
    : paidNowCents;
  return tabCents + paidNowWeight;
}

function averageWeeklySpendCents(weightedSpend: number): number {
  // WHY: Split the division to keep every intermediate amount within safe integer arithmetic.
  const wholeWeeks = Math.floor(weightedSpend / HISTORY_DAYS) * 7;
  const remainingDaysCents = Math.floor(
    ((weightedSpend % HISTORY_DAYS) * 7 + 15) / HISTORY_DAYS,
  );
  return wholeWeeks + remainingDaysCents;
}

function frequencyPoints(weightedPurchaseDayHalves: number): number {
  // WHY: Distinct days reward a dependable routine without letting same-day basket splitting inflate a score.
  if (weightedPurchaseDayHalves === 0) return 0;
  if (weightedPurchaseDayHalves === 1) return 5;
  if (weightedPurchaseDayHalves <= 6) return 10;
  if (weightedPurchaseDayHalves <= 14) return 20;
  if (weightedPurchaseDayHalves <= 28) return 30;
  return 40;
}

function spendPoints(averageWeeklySpend: number): number {
  // WHY: R100/R250/R500 weekly bands give gradual credit for spend without rewarding one tiny basket.
  if (averageWeeklySpend < 10_000) return 0;
  if (averageWeeklySpend < 25_000) return 10;
  if (averageWeeklySpend < 50_000) return 20;
  return 30;
}

function limitForScore(score: number): number {
  let limitCents = 0;
  for (const band of LIMIT_BANDS) {
    if (score < band.minimumScore) break;
    limitCents = band.limitCents;
  }
  return limitCents;
}

function pointsNeededForLevel(level: number): number {
  if (level >= MAX_LIMIT_CENTS / LIMIT_STEP_CENTS) return 0;
  return LIMIT_BANDS[level + 1].minimumScore;
}

function plural(count: number, singular: string): string {
  return `${count} ${singular}${count === 1 ? "" : "s"}`;
}

export function calculateBuyingPower(
  history: BuyingPowerHistory,
  now: string | Date,
): BuyingPowerResult {
  const nowMilliseconds = timestamp(now, "now");
  const start = nowMilliseconds - HISTORY_DAYS * DAY_MILLISECONDS;
  const salesById = new Map<string, BuyingPowerSale>();

  for (const sale of history.sales) {
    if (salesById.has(sale.id)) {
      throw new TypeError(`Duplicate sale id in buying-power history: ${sale.id}`);
    }
    salesById.set(sale.id, sale);
    timestamp(sale.createdAt, "sale.createdAt");
    assertCents(sale.totalCents, "sale.totalCents", false);
  }

  const completedPurchases = history.sales.filter((sale) =>
    COMPLETED_STATUSES.has(sale.status)
      && isInWindow(sale.createdAt, start, nowMilliseconds, "sale.createdAt"),
  );
  const purchaseDayWeights = new Map<string, number>();
  for (const sale of completedPurchases) {
    // WHY: UTC calendar days make the distinct-day rule deterministic across servers and devices.
    const day = new Date(timestamp(sale.createdAt, "sale.createdAt")).toISOString().slice(0, 10);
    // WHY: A cash-only day is half-weighted; any non-cash purchase makes that day full-weighted.
    const weight = sale.method === "cash" ? 1 : 2;
    purchaseDayWeights.set(day, Math.max(purchaseDayWeights.get(day) ?? 0, weight));
  }
  const weightedPurchaseDayHalves = [...purchaseDayWeights.values()]
    .reduce((total, weight) => total + weight, 0);

  let weightedTotalCents = 0;
  for (const sale of completedPurchases) {
    const nextTotal = weightedTotalCents + weightedSpendCents(sale);
    assertCents(nextTotal, "weighted spend total");
    weightedTotalCents = nextTotal;
  }

  const repaymentsInWindow = history.repayments.filter((repayment) => {
    if (!salesById.has(repayment.saleId)) {
      throw new TypeError(`Repayment references an unknown sale: ${repayment.saleId}`);
    }
    if (typeof repayment.onTime !== "boolean") {
      throw new TypeError("repayment.onTime must be a boolean");
    }
    return isInWindow(repayment.paidAt, start, nowMilliseconds, "repayment.paidAt");
  });

  const lateRepayments = repaymentsInWindow.filter((repayment) => !repayment.onTime).length;
  const repaymentEventsBySale = new Map<string, BuyingPowerRepayment[]>();
  const repaidCentsBySale = new Map<string, number>();
  for (const repayment of history.repayments) {
    assertCents(repayment.amountCents, "repayment.amountCents", false);
    const repaidCents = (repaidCentsBySale.get(repayment.saleId) ?? 0) + repayment.amountCents;
    assertCents(repaidCents, "repaid tab balance");
    repaidCentsBySale.set(repayment.saleId, repaidCents);
  }
  for (const repayment of repaymentsInWindow) {
    const events = repaymentEventsBySale.get(repayment.saleId) ?? [];
    events.push(repayment);
    repaymentEventsBySale.set(repayment.saleId, events);
  }

  // WHY: Count a tab once, and only after it is fully repaid; partial installments are not separate loans.
  const settledTabs = history.sales.filter((sale) =>
    sale.method === "tab"
      && sale.status === "repaid"
      && repaymentEventsBySale.has(sale.id),
  );
  const onTimeTabs = settledTabs.filter((sale) =>
    (repaymentEventsBySale.get(sale.id) ?? []).every((repayment) => repayment.onTime),
  ).length;

  // WHY: Customers with no settled tabs are neutral, not treated as risky before they have repayment history.
  const repaymentScore = settledTabs.length === 0
    ? 15
    : Math.round(onTimeTabs * 30 / settledTabs.length);
  const frequencyScore = frequencyPoints(weightedPurchaseDayHalves);
  const averageWeeklySpend = averageWeeklySpendCents(weightedTotalCents);
  const spendingScore = spendPoints(averageWeeklySpend);

  // WHY: Each late repayment reduces points directly, while the score remains bounded and explainable.
  const calculatedScore = Math.max(
    0,
    Math.min(100, frequencyScore + spendingScore + repaymentScore - lateRepayments * 5),
  );
  const hasCompletedPurchase = completedPurchases.length > 0;
  // WHY: The first observed completed purchase must unlock R50, not jump levels on one large basket.
  const firstPurchaseInWindow = completedPurchases.length === 1;
  const score = firstPurchaseInWindow
    ? Math.min(calculatedScore, LIMIT_BANDS[2].minimumScore - 1)
    : calculatedScore;
  const scoreLimit = limitForScore(score);

  const hasOverdueUnpaidTab = history.sales.some((sale) =>
    sale.method === "tab"
      && sale.status === "approved"
      && sale.dueAt !== undefined
      && sale.dueAt !== null
      && timestamp(sale.dueAt, "sale.dueAt") < nowMilliseconds
      && (sale.tabCents ?? 0) - (repaidCentsBySale.get(sale.id) ?? 0) > 0,
  );

  // WHY: No purchase means no buying power; the first completed purchase unlocks exactly R50.
  let limitCents = hasCompletedPurchase
    ? firstPurchaseInWindow ? LIMIT_STEP_CENTS : Math.max(scoreLimit, LIMIT_STEP_CENTS)
    : 0;

  // WHY: Repeated late repayments cap buying power at level 1 until the late events leave the 30-day window.
  const lateRepaymentCap = lateRepayments >= 2;
  if (lateRepaymentCap) {
    limitCents = Math.min(limitCents, LIMIT_STEP_CENTS);
  }
  if (hasOverdueUnpaidTab) {
    limitCents = 0;
  }

  const level = limitCents / LIMIT_STEP_CENTS;
  const nextLimitCents = Math.min(MAX_LIMIT_CENTS, limitCents + LIMIT_STEP_CENTS);
  const nextThreshold = pointsNeededForLevel(level);
  const pointsToNextLevel = Math.max(0, nextThreshold - score);
  const reasons = [
    `${plural(completedPurchases.length, "purchase")} in the last ${HISTORY_DAYS} days`,
    `${purchaseDayWeights.size} distinct purchase ${purchaseDayWeights.size === 1 ? "day" : "days"} in the last ${HISTORY_DAYS} days`,
    "Cash-only purchase days and cash spend count at 50% weight",
    `Average weekly spend: ${formatRand(averageWeeklySpend)} (${spendingScore}/30 spend points)`,
    settledTabs.length === 0
      ? `No tabs fully repaid in the last ${HISTORY_DAYS} days; repayment score is neutral (15/30)`
      : `${onTimeTabs} of ${settledTabs.length} tabs repaid on time (${repaymentScore}/30 repayment points)`,
    `Frequency score: ${frequencyScore}/40`,
    lateRepayments === 0
      ? "No late repayments in the last 30 days"
      : `${lateRepayments} late repayment${lateRepayments === 1 ? "" : "s"}: -5 points each`,
    `Total score: ${score}/100`,
  ];

  if (firstPurchaseInWindow) {
    reasons.push("One completed purchase in the last 30 days keeps the starter limit at R50");
  }
  if (!hasCompletedPurchase) {
    reasons.push("A completed purchase is required to unlock buying power");
  }
  if (lateRepaymentCap) {
    reasons.push("Two or more late repayments cap the limit at R50");
  }
  if (hasOverdueUnpaidTab) {
    reasons.push("A tab is overdue. Repay it to unlock new credit.");
  }
  reasons.push(`Buying-power limit: ${formatRand(limitCents)}`);

  return {
    limitCents,
    level,
    score,
    pointsToNextLevel,
    nextLimitCents,
    reasons,
  };
}

export function explainLimit(result: BuyingPowerResult): string[] {
  return [...result.reasons];
}
