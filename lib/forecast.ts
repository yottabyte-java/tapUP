import { formatRand } from "@/lib/money";
import type { BuyingPowerHistory, BuyingPowerSale } from "@/lib/buyingPower";

const FOUR_WEEKS_MILLISECONDS = 28 * 24 * 60 * 60 * 1000;
const MONTH_END_HISTORY_MILLISECONDS = 30 * 24 * 60 * 60 * 1000;
const CLEAR_SPEND_INCREASE_PERCENT = 150;

function milliseconds(value: string | Date, name: string): number {
  const result = value instanceof Date ? value.getTime() : Date.parse(value);
  if (!Number.isFinite(result)) {
    throw new TypeError(`${name} must be a valid date`);
  }
  return result;
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

function isCompletedPurchase(sale: BuyingPowerSale): boolean {
  // WHY: Ignore payment requests and cancelled/expired sales so only actual purchases affect the forecast.
  return sale.status === "approved" || sale.status === "paid" || sale.status === "repaid";
}

function cashSpendCents(sale: BuyingPowerSale): number {
  if (sale.method === "cash") {
    return sale.totalCents;
  }
  if (sale.method !== "tab" || sale.paidNowMethod !== "cash") {
    return 0;
  }

  const paidNowCents = sale.paidNowCents ?? sale.totalCents - (sale.tabCents ?? 0);
  assertCents(paidNowCents, "sale.paidNowCents");
  return paidNowCents;
}

function recentPurchases(
  history: BuyingPowerHistory,
  nowMilliseconds: number,
  windowMilliseconds: number,
): BuyingPowerSale[] {
  const start = nowMilliseconds - windowMilliseconds;
  return history.sales.filter((sale) => {
    assertCents(sale.totalCents, "sale.totalCents", false);
    const createdAt = milliseconds(sale.createdAt, "sale.createdAt");
    return isCompletedPurchase(sale) && createdAt >= start && createdAt <= nowMilliseconds;
  });
}

function tabPurchaseAmountCents(sale: BuyingPowerSale): number {
  // WHY: Only the portion actually placed on the tab signals that cash alone did not cover a purchase.
  if (sale.method !== "tab") {
    return 0;
  }
  const tabCents = sale.tabCents ?? sale.totalCents - (sale.paidNowCents ?? 0);
  assertCents(tabCents, "sale.tabCents");
  return tabCents;
}

function isNearMonthEnd(date: Date): boolean {
  const dayOfMonth = date.getUTCDate();
  const daysInMonth = new Date(Date.UTC(
    date.getUTCFullYear(),
    date.getUTCMonth() + 1,
    0,
  )).getUTCDate();

  // WHY: The last five and first three calendar days are the agreed month-end pressure window.
  return dayOfMonth >= daysInMonth - 4 || dayOfMonth <= 3;
}

function validateTabSplit(sale: BuyingPowerSale): void {
  if (sale.method !== "tab") {
    return;
  }

  const tabCents = sale.tabCents ?? sale.totalCents - (sale.paidNowCents ?? 0);
  const paidNowCents = sale.paidNowCents ?? sale.totalCents - tabCents;
  assertCents(tabCents, "sale.tabCents");
  assertCents(paidNowCents, "sale.paidNowCents");
  if (tabCents + paidNowCents !== sale.totalCents) {
    throw new RangeError("A tab sale's tab and immediate amounts must equal its total");
  }
}

function referenceTime(now: string | Date): number {
  return milliseconds(now, "now");
}

function fourWeekAverage(totalCents: number): number {
  const wholeCents = Math.floor(totalCents / 4);
  const remainder = totalCents % 4;
  // WHY: Round a quarter-average to the nearest cent without converting money to floating point.
  return wholeCents + (remainder >= 2 ? 1 : 0);
}

export function forecastNextWeekSpend(
  history: BuyingPowerHistory,
  now: string | Date = new Date(),
): number {
  const nowMilliseconds = referenceTime(now);
  const purchases = recentPurchases(history, nowMilliseconds, FOUR_WEEKS_MILLISECONDS);

  let totalCents = 0;
  for (const sale of purchases) {
    validateTabSplit(sale);
    totalCents += sale.totalCents;
    assertCents(totalCents, "four-week spend total");
  }

  // WHY: Dividing four weeks of completed purchases by four is a simple moving weekly average;
  // the rolling window naturally treats weeks without purchases as zero.
  return fourWeekAverage(totalCents);
}

export interface TabNeedForecast {
  likely: boolean;
  reason: string;
}

export function likelyToNeedTab(
  history: BuyingPowerHistory,
  now: string | Date = new Date(),
): TabNeedForecast {
  const nowMilliseconds = referenceTime(now);
  const purchases = recentPurchases(history, nowMilliseconds, MONTH_END_HISTORY_MILLISECONDS);

  for (const sale of purchases) {
    validateTabSplit(sale);
  }

  const monthEndTabs = purchases.filter((sale) =>
    tabPurchaseAmountCents(sale) > 0
      && isNearMonthEnd(new Date(milliseconds(sale.createdAt, "sale.createdAt"))),
  );
  if (monthEndTabs.length > 0) {
    // WHY: A real tab purchase during the agreed pressure window is direct, understandable evidence of need.
    return {
      likely: true,
      reason: "You have used a tab around month end before.",
    };
  }

  const weeklyForecastCents = forecastNextWeekSpend(history, now);
  if (weeklyForecastCents === 0) {
    // WHY: With no recent purchasing activity there is no evidence to predict a future tab need.
    return {
      likely: false,
      reason: "There is not enough recent purchase history to predict a tab need yet.",
    };
  }

  let cashTotalCents = 0;
  for (const sale of purchases) {
    cashTotalCents += cashSpendCents(sale);
    assertCents(cashTotalCents, "four-week cash spend total");
  }
  const usualWeeklyCashCents = fourWeekAverage(cashTotalCents);

  // WHY: Require a non-zero cash baseline and a 50% increase to avoid flagging ordinary or empty histories.
  if (
    usualWeeklyCashCents > 0
    && BigInt(weeklyForecastCents) * BigInt(100)
      >= BigInt(usualWeeklyCashCents) * BigInt(CLEAR_SPEND_INCREASE_PERCENT)
  ) {
    return {
      likely: true,
      reason: `Your forecast spend of ${formatRand(weeklyForecastCents)} is clearly above your usual cash pattern of ${formatRand(usualWeeklyCashCents)} per week.`,
    };
  }

  // WHY: A negative prediction is still explained so the customer can see why no flag was raised.
  return {
    likely: false,
    reason: "Your recent spend is close to your usual cash pattern, with no month-end tab pattern.",
  };
}
