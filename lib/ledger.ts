type SaleReceipt = { paid_now_cents: number; paid_now_confirmed_at: string | null };
type RepaymentReceipt = { amount_cents: number; paid_at: string };

function dateKey(date: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Africa/Johannesburg",
    year: "numeric", month: "2-digit", day: "2-digit",
  }).format(date);
}

export function calculateTodayTakings(
  sales: SaleReceipt[],
  repayments: RepaymentReceipt[],
  now: Date,
): number {
  const today = dateKey(now);
  let total = 0;
  // WHY: A confirmed receipt survives later settlement/cancellation. Status is not a receipt date.
  // Refunds/reversals are not represented in the current model; never invent a reversal from status.
  for (const sale of sales) {
    if (sale.paid_now_confirmed_at && dateKey(new Date(sale.paid_now_confirmed_at)) === today) {
      total += sale.paid_now_cents;
    }
  }
  for (const repayment of repayments) {
    if (dateKey(new Date(repayment.paid_at)) === today) total += repayment.amount_cents;
  }
  if (!Number.isSafeInteger(total)) throw new RangeError("Invalid daily receipt total");
  return total;
}
