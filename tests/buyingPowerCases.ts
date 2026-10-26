import type { BuyingPowerHistory, BuyingPowerSale } from "@/lib/buyingPower";
const DAY = 86_400_000;

export function buyingPowerCases(now: Date): Array<{ name: string; history: BuyingPowerHistory }> {
  const date = (days: number) => new Date(now.getTime() - days * DAY).toISOString();
  const purchases = (count: number, amount: number, method: "cash" | "demo_card" = "demo_card"): BuyingPowerHistory => ({
    sales: Array.from({ length: count }, (_, i) => ({
      id: `sale-${i}`, createdAt: date(i + 1), method, status: "paid" as const, totalCents: amount,
    })), repayments: [],
  });
  const low: BuyingPowerHistory = {
    sales: [
      { id: "late", createdAt: date(5), totalCents: 600, method: "tab", status: "repaid", tabCents: 600, paidNowCents: 0, dueAt: date(4) },
      { id: "cash", createdAt: date(1), totalCents: 101, method: "cash", status: "paid" },
    ],
    repayments: Array.from({ length: 6 }, (_, i) => ({ saleId: "late", amountCents: 100, paidAt: date(3 - i / 24), onTime: false })),
  };
  const cases = [
    { name: "new customer", history: purchases(0, 100) },
    { name: "one large first purchase stays R50", history: purchases(1, 2_000_000) },
    { name: "late installments reduce score to zero but retain R50", history: low },
    ...[1, 3, 4, 7, 8, 14, 15, 28, 30].map((count) => ({ name: `${count} cash purchase days`, history: purchases(count, 101, "cash") })),
    ...[1, 42_854, 42_855, 107_141, 107_142, 214_283, 214_284].map((amount) => ({
      name: `weekly spend rounding with ${amount} cents`, history: purchases(2, Math.ceil(amount / 2)),
    })),
    { name: "R300 cap", history: purchases(29, 100_000) },
  ];
  for (const late of [false, true]) {
    const history = purchases(15, 100_000);
    const tab: BuyingPowerSale = { id: "tab", createdAt: date(3), totalCents: 10_001, method: "tab", status: "repaid", tabCents: 5000, paidNowCents: 5001, paidNowMethod: "cash", dueAt: date(late ? 2 : 0.5) };
    history.sales.push(tab);
    history.repayments.push({ saleId: "tab", amountCents: 5000, paidAt: date(1), onTime: !late });
    cases.push({ name: `mixed cash rounding and ${late ? "late" : "on-time"} repayment`, history });
  }
  const overdue = purchases(5, 50_000);
  overdue.sales.push({ id: "old-tab", createdAt: date(40), method: "tab", status: "approved", totalCents: 1000, tabCents: 1000, paidNowCents: 0, dueAt: date(1) });
  overdue.repayments.push({ saleId: "old-tab", amountCents: 500, paidAt: date(2), onTime: true });
  cases.push({ name: "overdue partly repaid tab older than scoring window", history: overdue });
  const expired = purchases(0, 100);
  expired.sales.push({ id: "expired", createdAt: date(1), method: "pending", status: "expired", totalCents: 100 });
  cases.push({ name: "expired sales do not unlock credit", history: expired });
  return cases;
}
