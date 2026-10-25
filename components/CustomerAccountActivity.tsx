import { type BuyingPowerHistory } from "@/lib/buyingPower";
import { formatRand } from "@/lib/money";

const labels = {
  pending: "Awaiting cash confirmation",
  tab_requested: "Awaiting owner approval",
  approved: "Tab approved",
  paid: "Paid",
  repaid: "Tab repaid",
  cancelled: "Rejected or cancelled",
  expired: "Expired",
} as const;

export function CustomerAccountActivity({ history }: { history: BuyingPowerHistory }) {
  const repaid = new Map<string, number>();
  for (const payment of history.repayments) repaid.set(payment.saleId, (repaid.get(payment.saleId) ?? 0) + payment.amountCents);
  // WHY: Pending requests are not debt. Settled tabs retain their receipt history but have no outstanding balance.
  const owedCents = history.sales.filter((sale) => sale.status === "approved").reduce(
    (sum, sale) => sum + Math.max(0, (sale.tabCents ?? 0) - (repaid.get(sale.id) ?? 0)), 0,
  );
  const activity = [
    ...history.sales.map((sale) => ({ id: sale.id, date: sale.createdAt,
      label: labels[sale.status], amount: sale.totalCents })),
    ...history.repayments.map((payment, index) => ({ id: `${payment.saleId}-${index}`, date: payment.paidAt,
      label: "Repayment received", amount: payment.amountCents })),
  ].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  return (
    <div className="mt-4 space-y-3 border-t border-white/10 pt-4">
      <section aria-label="Tabs owed" className="rounded-xl bg-bg p-3">
        <h3 className="text-xs text-foreground/70">Tabs owed</h3>
        <p className="mt-1 font-semibold text-amber">{formatRand(owedCents)}</p>
      </section>
      <section aria-label="Recent activity">
        <h3 className="text-sm font-semibold">Recent activity</h3>
        {activity.length === 0 ? <p className="mt-2 text-xs text-foreground/70">No transactions yet.</p> : (
          <ul className="mt-2 space-y-2">{activity.map((entry) => (
            <li key={entry.id} className="rounded-xl bg-bg p-3 text-xs">
              <p className="flex justify-between gap-2"><span>{entry.label}</span><span>{formatRand(entry.amount)}</span></p>
              <time className="mt-1 block text-foreground/60" dateTime={new Date(entry.date).toISOString()}>
                {new Intl.DateTimeFormat("en-ZA", { timeZone: "Africa/Johannesburg", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(entry.date))}
              </time>
            </li>
          ))}</ul>
        )}
      </section>
    </div>
  );
}
