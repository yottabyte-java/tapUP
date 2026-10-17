import type { BuyingPowerHistory, BuyingPowerSale } from "@/lib/buyingPower";

export const seedNow = new Date("2026-10-16T12:00:00.000Z");

interface SeedSale {
  saleNo: number;
  daysAgo: number;
  customer: "thabo" | "nomsa" | "sipho";
  method: "tab" | "demo_card" | "cash";
  totalCents: number;
  repaymentDaysAfterSale: number | null;
}

const seedRows: SeedSale[] = [
  { saleNo: 1, daysAgo: 29, customer: "thabo", method: "demo_card", totalCents: 3850, repaymentDaysAfterSale: null },
  { saleNo: 2, daysAgo: 27, customer: "thabo", method: "cash", totalCents: 2140, repaymentDaysAfterSale: null },
  { saleNo: 3, daysAgo: 26, customer: "nomsa", method: "tab", totalCents: 6800, repaymentDaysAfterSale: 20 },
  { saleNo: 4, daysAgo: 25, customer: "thabo", method: "tab", totalCents: 5200, repaymentDaysAfterSale: 8 },
  { saleNo: 5, daysAgo: 23, customer: "sipho", method: "cash", totalCents: 2480, repaymentDaysAfterSale: null },
  { saleNo: 6, daysAgo: 22, customer: "thabo", method: "demo_card", totalCents: 2990, repaymentDaysAfterSale: null },
  { saleNo: 7, daysAgo: 20, customer: "thabo", method: "cash", totalCents: 4850, repaymentDaysAfterSale: null },
  { saleNo: 8, daysAgo: 19, customer: "nomsa", method: "demo_card", totalCents: 4760, repaymentDaysAfterSale: null },
  { saleNo: 9, daysAgo: 18, customer: "thabo", method: "tab", totalCents: 3950, repaymentDaysAfterSale: 8 },
  { saleNo: 10, daysAgo: 17, customer: "sipho", method: "tab", totalCents: 7840, repaymentDaysAfterSale: null },
  { saleNo: 11, daysAgo: 15, customer: "thabo", method: "cash", totalCents: 2480, repaymentDaysAfterSale: null },
  { saleNo: 12, daysAgo: 7, customer: "nomsa", method: "cash", totalCents: 3190, repaymentDaysAfterSale: null },
  { saleNo: 13, daysAgo: 12, customer: "thabo", method: "tab", totalCents: 4600, repaymentDaysAfterSale: 7 },
  { saleNo: 14, daysAgo: 10, customer: "thabo", method: "demo_card", totalCents: 5390, repaymentDaysAfterSale: null },
  { saleNo: 15, daysAgo: 8, customer: "thabo", method: "cash", totalCents: 2270, repaymentDaysAfterSale: null },
  { saleNo: 16, daysAgo: 14, customer: "nomsa", method: "tab", totalCents: 5600, repaymentDaysAfterSale: 5 },
  { saleNo: 17, daysAgo: 6, customer: "thabo", method: "tab", totalCents: 3280, repaymentDaysAfterSale: 3 },
  { saleNo: 18, daysAgo: 5, customer: "thabo", method: "demo_card", totalCents: 3990, repaymentDaysAfterSale: null },
  { saleNo: 19, daysAgo: 3, customer: "nomsa", method: "demo_card", totalCents: 4550, repaymentDaysAfterSale: null },
  { saleNo: 20, daysAgo: 0, customer: "thabo", method: "cash", totalCents: 2670, repaymentDaysAfterSale: null },
];

function dateDaysAgo(daysAgo: number): Date {
  return new Date(seedNow.getTime() - daysAgo * 24 * 60 * 60 * 1000);
}

function makeSale(row: SeedSale): BuyingPowerSale {
  const saleId = `tapup-demo-sale-${row.saleNo}`;
  const createdAt = dateDaysAgo(row.daysAgo);
  const isRepaidTab = row.method === "tab" && row.repaymentDaysAfterSale !== null;

  return {
    id: saleId,
    createdAt,
    totalCents: row.totalCents,
    method: row.method,
    status: row.method === "tab"
      ? isRepaidTab ? "repaid" : "approved"
      : "paid",
    ...(row.method === "tab" ? { tabCents: row.totalCents, paidNowCents: 0 } : {}),
  };
}

function historyFor(customer: SeedSale["customer"]): BuyingPowerHistory {
  const rows = seedRows.filter((row) => row.customer === customer);
  const sales = rows.map(makeSale);
  const repayments = rows.flatMap((row) => {
    if (row.method !== "tab" || row.repaymentDaysAfterSale === null) {
      return [];
    }

    const paidAt = new Date(
      dateDaysAgo(row.daysAgo).getTime()
        + row.repaymentDaysAfterSale * 24 * 60 * 60 * 1000,
    );
    return [{
      saleId: `tapup-demo-sale-${row.saleNo}`,
      paidAt,
      onTime: row.repaymentDaysAfterSale <= 14,
    }];
  });

  return { sales, repayments };
}

// WHY: This fixture mirrors the fixed sale rows in seed.sql while anchoring relative days for deterministic tests.
export const seedHistories = {
  thabo: historyFor("thabo"),
  nomsa: historyFor("nomsa"),
  sipho: historyFor("sipho"),
  newCustomer: { sales: [], repayments: [] } satisfies BuyingPowerHistory,
};
