import { describe, expect, it } from "vitest";
import { forecastNextWeekSpend, hasEnoughForecastHistory, likelyToNeedTab } from "@/lib/forecast";
import type { BuyingPowerHistory } from "@/lib/buyingPower";
import { seedHistories, seedNow } from "./seedHistory";

const DAY = 24 * 60 * 60 * 1000;

function cashSale(id: string, daysAgo: number, totalCents: number) {
  return {
    id,
    createdAt: new Date(seedNow.getTime() - daysAgo * DAY),
    totalCents,
    method: "cash" as const,
    status: "paid" as const,
  };
}

describe("spend and tab-need forecasts", () => {
  it("forecasts next-week spend from the four-week moving average", () => {
    const history: BuyingPowerHistory = {
      sales: [
        cashSale("week-one", 2, 20_000),
        cashSale("week-two", 9, 40_000),
        cashSale("week-three", 16, 60_000),
        cashSale("week-four", 23, 80_000),
      ],
      repayments: [],
    };

    expect(forecastNextWeekSpend(history, seedNow)).toBe(50_000);
    expect(hasEnoughForecastHistory(history, seedNow)).toBe(true);
  });

  it("withholds a four-week estimate until each of the four weeks has a completed purchase", () => {
    const history: BuyingPowerHistory = {
      sales: [cashSale("week-one", 2, 10_000), cashSale("week-two", 9, 10_000), cashSale("week-three", 16, 10_000)],
      repayments: [],
    };

    expect(hasEnoughForecastHistory(history, seedNow)).toBe(false);
  });

  it("predicts a tab from a purchase pattern near month end", () => {
    const monthEndHistory: BuyingPowerHistory = {
      sales: [{
        id: "month-end-tab",
        createdAt: new Date("2026-09-29T12:00:00.000Z"),
        totalCents: 7_840,
        method: "tab",
        status: "approved",
        tabCents: 7_840,
        paidNowCents: 0,
      }],
      repayments: [],
    };
    const result = likelyToNeedTab(monthEndHistory, seedNow);

    expect(result.likely).toBe(true);
    expect(result.reason).toMatch(/tab around month end/i);
  });

  it("recognizes Thabo's seeded month-end tab pattern", () => {
    const result = likelyToNeedTab(seedHistories.thabo, seedNow);

    expect(result.likely).toBe(true);
    expect(result.reason).toMatch(/tab around month end/i);
  });

  it("does not predict a tab when there is no purchase history", () => {
    expect(forecastNextWeekSpend(seedHistories.newCustomer, seedNow)).toBe(0);
    expect(likelyToNeedTab(seedHistories.newCustomer, seedNow)).toEqual({
      likely: false,
      reason: "There is not enough recent purchase history to predict a tab need yet.",
    });
  });

  it("does not flag a customer with cash purchases but no month-end tab pattern", () => {
    const history: BuyingPowerHistory = {
      sales: [
        cashSale("cash-one", 6, 10_000),
        cashSale("cash-two", 5, 10_000),
        cashSale("cash-three", 4, 10_000),
      ],
      repayments: [],
    };

    expect(likelyToNeedTab(history, seedNow).likely).toBe(false);
  });
});
