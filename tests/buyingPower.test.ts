import { describe, expect, it } from "vitest";
import { calculateBuyingPower, type BuyingPowerHistory } from "@/lib/buyingPower";
import { seedHistories, seedNow } from "./seedHistory";

const DAY = 24 * 60 * 60 * 1000;

function sale(
  id: string,
  daysAgo: number,
  totalCents: number,
  method: "cash" | "demo_card" | "tab" = "demo_card",
  status: "approved" | "paid" | "repaid" = method === "tab" ? "approved" : "paid",
) {
  return {
    id,
    createdAt: new Date(seedNow.getTime() - daysAgo * DAY),
    totalCents,
    method,
    status,
    ...(method === "tab" ? { tabCents: totalCents, paidNowCents: 0 } : {}),
  };
}

function historyWithDailySales(
  days: number,
  amountCents: number,
  method: "cash" | "demo_card" = "demo_card",
): BuyingPowerHistory {
  return {
    sales: Array.from({ length: days }, (_, index) =>
      sale(`sale-${index}`, index, amountCents, method),
    ),
    repayments: [],
  };
}

function stepBoundaryHistory(scoreCase: number): BuyingPowerHistory {
  // WHY: Each case uses valid sale/repayment shapes to exercise the corresponding R50 band threshold.
  if (scoreCase === 19) {
    return historyWithDailySales(1, 1);
  }
  if (scoreCase === 20) {
    const sales = Array.from({ length: 2 }, (_, index) =>
      sale(`sale-${index}`, index, 1, "tab", "approved"),
    );
    return {
      sales,
      // WHY: One late partial repayment on an open tab lowers points while keeping repayment history neutral.
      repayments: [{
        saleId: sales[0].id,
        amountCents: 1,
        paidAt: seedNow,
        onTime: false,
      }],
    };
  }
  if (scoreCase === 35) {
    return historyWithDailySales(2, 22_501);
  }
  if (scoreCase === 50 || scoreCase === 80) {
    const sales = Array.from({ length: 4 }, (_, index) =>
      sale(
        `sale-${index}`,
        index,
        scoreCase === 50 ? 1 : 55_001,
        index < 2 ? "tab" : "demo_card",
        index < 2 ? "repaid" : "paid",
      ),
    );
    return {
      sales,
      repayments: sales.slice(0, 2).map((item, index) => ({
        saleId: item.id,
        amountCents: item.tabCents ?? 0,
        paidAt: new Date(seedNow.getTime() - index * DAY),
        onTime: true,
      })),
    };
  }
  if (scoreCase === 65) {
    return historyWithDailySales(4, 55_001);
  }

  throw new RangeError(`No boundary history for score ${scoreCase}`);
}

describe("calculateBuyingPower", () => {
  it("keeps a brand-new customer at zero buying power", () => {
    const result = calculateBuyingPower(seedHistories.newCustomer, seedNow);

    expect(result.limitCents).toBe(0);
    expect(result.level).toBe(0);
  });

  it("weights cash-only shopping below equivalent simulated-card shopping", () => {
    const cashResult = calculateBuyingPower(historyWithDailySales(4, 30_000, "cash"), seedNow);
    const cardResult = calculateBuyingPower(historyWithDailySales(4, 30_000, "demo_card"), seedNow);

    expect(cashResult.score).toBeLessThan(cardResult.score);
    expect(cashResult.reasons).toContain("Cash-only purchase days and cash spend count at 50% weight");
    expect(cashResult.reasons).toContain("Average weekly spend: R140.00 (10/30 spend points)");
  });

  it("rewards a weekly shopper whose tabs are all repaid on time", () => {
    const sales = Array.from({ length: 4 }, (_, index) =>
      sale(`weekly-tab-${index}`, index * 7, 1_000, "tab", "repaid"),
    );
    const history: BuyingPowerHistory = {
      sales,
      repayments: sales.map((item, index) => ({
        saleId: item.id,
        amountCents: item.tabCents ?? 0,
        paidAt: new Date(seedNow.getTime() - index * 7 * DAY),
        onTime: true,
      })),
    };
    const result = calculateBuyingPower(history, seedNow);

    expect(result.score).toBe(50);
    expect(result.reasons).toContain("4 of 4 tabs repaid on time (30/30 repayment points)");
  });

  it("lowers the score when one of several tab repayments is late", () => {
    const sales = Array.from({ length: 4 }, (_, index) =>
      sale(`tab-${index}`, index * 3, 1_000, "tab", "repaid"),
    );
    const repayments = sales.map((item, index) => ({
      saleId: item.id,
      amountCents: item.tabCents ?? 0,
      paidAt: new Date(seedNow.getTime() - index * 3 * DAY),
      onTime: index !== 0,
    }));
    const onTimeResult = calculateBuyingPower({
      sales,
      repayments: repayments.map((repayment) => ({ ...repayment, onTime: true })),
    }, seedNow);
    const lateResult = calculateBuyingPower({ sales, repayments }, seedNow);

    expect(lateResult.score).toBeLessThan(onTimeResult.score);
    expect(lateResult.reasons).toContain("1 late repayment: -5 points each");
  });

  it("caps buying power at level one after two late repayments", () => {
    const sales = Array.from({ length: 20 }, (_, index) =>
      sale(`high-volume-${index}`, index, 100_000,
        index < 10 ? "tab" : "demo_card",
        index < 10 ? "repaid" : "paid"),
    );
    const repayments = sales.slice(0, 10).map((item, index) => ({
      saleId: item.id,
      amountCents: item.tabCents ?? 0,
      paidAt: new Date(seedNow.getTime() - index * DAY),
      onTime: index >= 2,
    }));
    const result = calculateBuyingPower({ sales, repayments }, seedNow);

    expect(result.score).toBeGreaterThanOrEqual(80);
    expect(result.limitCents).toBe(5_000);
    expect(result.level).toBe(1);
  });

  it("never grants more than the R300 MVP cap", () => {
    const history = historyWithDailySales(30, 100_000);

    expect(calculateBuyingPower(history, seedNow).limitCents).toBe(30_000);
  });

  it.each([
    { inputScore: 19, expectedLimitCents: 5_000 },
    { inputScore: 20, expectedLimitCents: 10_000 },
    { inputScore: 35, expectedLimitCents: 15_000 },
    { inputScore: 50, expectedLimitCents: 20_000 },
    { inputScore: 65, expectedLimitCents: 25_000 },
    { inputScore: 80, expectedLimitCents: 30_000 },
  ])("maps score $inputScore to its R50-step limit", ({ inputScore, expectedLimitCents }) => {
    const result = calculateBuyingPower(stepBoundaryHistory(inputScore), seedNow);

    expect(result.score).toBe(inputScore);
    expect(result.limitCents).toBe(expectedLimitCents);
    expect(result.limitCents % 5_000).toBe(0);
  });

  it("scores seeded Thabo above Nomsa and Nomsa above Sipho", () => {
    const thabo = calculateBuyingPower(seedHistories.thabo, seedNow);
    const nomsa = calculateBuyingPower(seedHistories.nomsa, seedNow);
    const sipho = calculateBuyingPower(seedHistories.sipho, seedNow);

    expect(thabo.score).toBeGreaterThan(nomsa.score);
    expect(nomsa.score).toBeGreaterThan(sipho.score);
    expect(thabo.reasons).toContain("No late repayments in the last 30 days");
    expect(nomsa.reasons).toContain("1 late repayment: -5 points each");
    expect(sipho.reasons).toContain("No tabs fully repaid in the last 30 days; repayment score is neutral (15/30)");
  });

  it("sets Sipho's buying power to zero while his seeded tab is overdue and unpaid", () => {
    const result = calculateBuyingPower(seedHistories.sipho, seedNow);

    expect(result.limitCents).toBe(0);
    expect(result.level).toBe(0);
    expect(result.reasons).toContain("A tab is overdue. Repay it to unlock new credit.");
  });

  it("restores normal buying power after Sipho repays the overdue tab", () => {
    const overdueTab = seedHistories.sipho.sales.find((item) => item.status === "approved");
    expect(overdueTab).toBeDefined();
    if (!overdueTab) {
      throw new Error("Seeded Sipho history must include an approved tab");
    }

    const afterRepayment: BuyingPowerHistory = {
      sales: seedHistories.sipho.sales.map((item) =>
        item.id === overdueTab.id ? { ...item, status: "repaid" } : item,
      ),
      repayments: [{
        saleId: overdueTab.id,
        amountCents: overdueTab.tabCents ?? 0,
        paidAt: seedNow,
        onTime: true,
      }],
    };
    const result = calculateBuyingPower(afterRepayment, seedNow);

    expect(result.limitCents).toBeGreaterThan(0);
    expect(result.reasons).not.toContain("A tab is overdue. Repay it to unlock new credit.");
  });

  it("does not penalise an approved tab that is not yet due", () => {
    const futureDueTab = {
      ...sale("future-tab", 2, 10_000, "tab", "approved"),
      dueAt: new Date(seedNow.getTime() + DAY),
    };
    const history: BuyingPowerHistory = {
      sales: [...historyWithDailySales(4, 55_001).sales, futureDueTab],
      repayments: [],
    };
    const result = calculateBuyingPower(history, seedNow);

    expect(result.limitCents).toBeGreaterThan(0);
    expect(result.reasons).not.toContain("A tab is overdue. Repay it to unlock new credit.");
  });

  it("raises the same customer's score after their first on-time tab repayment", () => {
    const tab = sale("first-tab", 5, 10_000, "tab", "approved");
    const earlierPurchase = sale("earlier-purchase", 10, 1_000);
    const beforeRepayment: BuyingPowerHistory = {
      sales: [tab, earlierPurchase],
      repayments: [],
    };
    const afterRepayment: BuyingPowerHistory = {
      sales: [{ ...tab, status: "repaid" }, earlierPurchase],
      repayments: [{
        saleId: tab.id,
        amountCents: tab.tabCents ?? 0,
        paidAt: new Date(seedNow.getTime() - 2 * DAY),
        onTime: true,
      }],
    };

    expect(calculateBuyingPower(afterRepayment, seedNow).score)
      .toBeGreaterThan(calculateBuyingPower(beforeRepayment, seedNow).score);
  });
});
