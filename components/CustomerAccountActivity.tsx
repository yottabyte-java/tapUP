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
  const transactions = [...history.sales].sort(
    (left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime(),
  );
  const repayments = [...history.repayments].sort(
    (left, right) => new Date(right.paidAt).getTime() - new Date(left.paidAt).getTime(),
  );
  return (
    <div className="mt-4 space-y-3 border-t border-white/10 pt-4">
      <section aria-label="Tabs owed" className="rounded-xl bg-bg p-3">
        <h3 className="text-xs text-foreground/70">Tabs owed</h3>
        <p className="mt-1 font-semibold text-amber">{formatRand(owedCents)}</p>
      </section>
      <section aria-label="Transaction history">
        <h3 className="text-sm font-semibold">Transactions</h3>
        {transactions.length === 0 ? <p className="mt-2 text-xs text-foreground/70">No transactions yet.</p> : (
          <ul className="mt-2 space-y-2">{transactions.map((sale) => (
            <li key={sale.id} className="rounded-xl bg-bg p-3 text-xs">
              <details>
                <summary className="flex cursor-pointer list-none justify-between gap-2">
                  <span>{labels[sale.status]}</span><span>{formatRand(sale.totalCents)}</span>
                </summary>
                <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 border-t border-white/10 pt-2 text-foreground/70">
                  <dt>Type</dt><dd className="text-right">{sale.method === "tab" ? "Tab request" : sale.method === "pending" ? "Payment request" : "Purchase"}</dd>
                  {sale.method === "tab" && <><dt>Tab portion</dt><dd className="text-right">{formatRand(sale.tabCents ?? 0)}</dd></>}
                  {(sale.paidNowCents ?? 0) > 0 && <><dt>Paid now</dt><dd className="text-right">{formatRand(sale.paidNowCents ?? 0)} · {sale.paidNowMethod === "cash" ? "cash" : "demo payment"}</dd></>}
                  {sale.dueAt && <><dt>Due date</dt><dd className="text-right">{formatDate(sale.dueAt)}</dd></>}
                </dl>
              </details>
              <time className="mt-2 block text-foreground/60" dateTime={new Date(sale.createdAt).toISOString()}>
                {formatDate(sale.createdAt)}
              </time>
            </li>
          ))}</ul>
        )}
      </section>
      <section aria-label="Repayment history">
        <h3 className="text-sm font-semibold">Repayments</h3>
        {repayments.length === 0 ? <p className="mt-2 text-xs text-foreground/70">No repayments recorded yet.</p> : (
          <ul className="mt-2 space-y-2">{repayments.map((repayment, index) => (
            <li key={`${repayment.saleId}-${index}`} className="rounded-xl bg-bg p-3 text-xs">
              <p className="flex justify-between gap-2">
                <span>{repayment.onTime ? "On-time repayment" : "Late repayment"}</span>
                <span>{formatRand(repayment.amountCents)}</span>
              </p>
              <time className="mt-1 block text-foreground/60" dateTime={new Date(repayment.paidAt).toISOString()}>
                {formatDate(repayment.paidAt)}
              </time>
            </li>
          ))}</ul>
        )}
      </section>
    </div>
  );
}

function formatDate(value: string | Date): string {
  return new Intl.DateTimeFormat("en-ZA", {
    timeZone: "Africa/Johannesburg",
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}
