"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { PinPad } from "@/components/PinPad";
import { approveTab, payCash, rejectTab } from "@/lib/actions/sales";
import { formatRand } from "@/lib/money";
import { loadOwnerPaymentPage, ownerPaymentError, type PendingPayment, type PaymentCursor, type PaymentCustomer } from "@/lib/ownerPayments";
export type { PendingPayment } from "@/lib/ownerPayments";

type Result = { ok: true } | { ok: false; error: string };

export function PaymentControls({ sale, customer, onAction, busy }: {
  sale: PendingPayment;
  customer?: PaymentCustomer;
  onAction: (action: "approve" | "reject" | "cash", pin?: string) => Promise<Result>;
  busy: boolean;
}) {
  const cashDue = sale.status === "pending" || (
    sale.paid_now_method === "cash" && sale.paid_now_cents > 0 && !sale.paid_now_confirmed_at
  );
  const buttonClass = "min-h-11 rounded-lg border border-teal/50 px-3 text-sm disabled:opacity-50";
  return (
    <li className="space-y-3 rounded-xl border border-white/15 p-3">
      <p className="text-sm font-semibold">{customer?.display_name ?? "Walk-in customer"} · {formatRand(sale.total_cents)}</p>
      {sale.status === "tab_requested" && <p className="text-xs">Tab requested: {formatRand(sale.tab_cents)}</p>}
      {sale.paid_now_confirmed_at && sale.paid_now_cents > 0 && (
        <p className="text-xs text-foreground/70">Received: {formatRand(sale.paid_now_cents)}. Rejecting the tab keeps this receipt recorded; arrange any return separately.</p>
      )}
      <div className="flex flex-wrap gap-2">
        {cashDue && <button className={buttonClass} disabled={busy} onClick={() => void onAction("cash")} type="button">
          Confirm cash received · {formatRand(sale.status === "pending" ? sale.total_cents : sale.paid_now_cents)}
        </button>}
        {sale.status === "tab_requested" && <>
          {customer?.customer_profile_id && <button className={buttonClass} disabled={busy || cashDue} onClick={() => void onAction("approve")} type="button">Approve tab</button>}
          <button className={buttonClass} disabled={busy} onClick={() => void onAction("reject")} type="button">Reject tab</button>
        </>}
      </div>
      {sale.status === "tab_requested" && customer && !customer.customer_profile_id && !cashDue && (
        <PinPad disabled={busy} formatError={ownerPaymentError} onSubmit={(pin) => onAction("approve", pin)} />
      )}
    </li>
  );
}

type OwnerPaymentsProps = {
  shopId: string;
  refreshKey: string;
  onCompleted: (saleId: string) => void;
};

/** Reset request pages, feedback and PIN state whenever the active shop changes. */
export function OwnerPayments(props: OwnerPaymentsProps) {
  return <OwnerPaymentRequests key={props.shopId} {...props} />;
}

function OwnerPaymentRequests({ shopId, refreshKey, onCompleted }: OwnerPaymentsProps) {
  const [sales, setSales] = useState<PendingPayment[]>([]);
  const [customers, setCustomers] = useState<PaymentCustomer[]>([]);
  const [cursor, setCursor] = useState<PaymentCursor | null>(null);
  const [nextCursor, setNextCursor] = useState<PaymentCursor | null>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busy, startTransition] = useTransition();
  const submitting = useRef(false);
  const generation = useRef(0);
  const load = useCallback(async (pageCursor: PaymentCursor | null = null) => {
    const request = ++generation.current;
    const page = await loadOwnerPaymentPage(shopId, pageCursor);
    // A refresh or shop change may finish before an older read; never restore its stale page.
    if (request !== generation.current) return;
    setSales(page.sales);
    setCustomers(page.customers);
    setCursor(pageCursor);
    setNextCursor(page.nextCursor);
  }, [shopId]);

  useEffect(() => {
    let active = true;
    startTransition(async () => {
      try { await load(); } catch { if (active) setError("Could not load payment requests. Refresh to try again."); }
    });
    return () => { active = false; generation.current += 1; };
  }, [load, refreshKey]);

  function refresh(pageCursor: PaymentCursor | null = null) {
    if (submitting.current) return;
    startTransition(async () => {
      try { await load(pageCursor); setError(""); } catch { setError("Could not refresh payment requests."); }
    });
  }

  async function act(sale: PendingPayment, action: "approve" | "reject" | "cash", pin?: string): Promise<Result> {
    // WHY: The ref closes the gap before React renders disabled buttons; server CAS/RPC checks handle other tabs/devices.
    if (submitting.current) return { ok: false, error: "action_in_progress" };
    const actionGeneration = generation.current;
    submitting.current = true;
    setError(""); setMessage("");
    try {
      const result = action === "cash" ? await payCash({ saleId: sale.id })
        : action === "reject" ? await rejectTab({ saleId: sale.id })
        : await approveTab({ saleId: sale.id, shopCustomerId: sale.shop_customer_id, ...(pin ? { pin } : {}) });
      // A shop change/unmount or newer read invalidates this action's displayed result and refresh.
      if (actionGeneration !== generation.current) return result;
      if (!result.ok) {
        // The mounted keypad clears a mismatch as soon as the customer edits their PIN.
        if (result.error !== "invalid_pin") setError(ownerPaymentError(result.error));
        return result;
      }
      setMessage(action === "cash" ? "Cash receipt recorded." : action === "reject" ? "Tab rejected. Any confirmed receipt remains recorded." : "Tab approved.");
      if (action !== "cash" || sale.status === "pending") onCompleted(sale.id);
      if (actionGeneration === generation.current) {
        try { await load(cursor); } catch { setError("Action succeeded, but requests could not refresh. Refresh before continuing."); }
      }
      return { ok: true };
    } catch {
      if (actionGeneration === generation.current) setError("Connection failed. Refresh requests to check whether the action completed before trying again.");
      return { ok: false, error: "unavailable" };
    } finally { submitting.current = false; }
  }

  return (
    <section aria-label="Owner payment requests" className="mt-3 space-y-3 rounded-2xl border border-teal/40 bg-card p-4">
      <h2 className="text-sm font-semibold">Payment requests</h2>
      <p className="text-xs text-foreground/70">Refresh after the customer chooses how to pay. Confirm cash only after receiving it.</p>
      <button className="min-h-11 rounded-lg border border-white/20 px-3 text-sm disabled:opacity-50" disabled={busy} onClick={() => refresh()} type="button">{busy ? "Updating…" : cursor ? "Newest requests" : "Refresh requests"}</button>
      {nextCursor && <button className="min-h-11 rounded-lg border border-white/20 px-3 text-sm disabled:opacity-50" disabled={busy}
        onClick={() => refresh(nextCursor)} type="button">Older requests</button>}
      {message && <p className="text-sm text-teal" role="status">{message}</p>}
      {error && <p className="text-sm text-red-200" role="alert">{error}</p>}
      <ul className="space-y-3">{sales.map((sale) => <PaymentControls key={sale.id} sale={sale}
        customer={customers.find((customer) => customer.id === sale.shop_customer_id)} busy={busy}
        onAction={(action, pin) => new Promise<Result>((resolve) => startTransition(async () => { resolve(await act(sale, action, pin)); }))} />)}</ul>
    </section>
  );
}
