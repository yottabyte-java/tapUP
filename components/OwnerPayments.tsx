"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { PinPad } from "@/components/PinPad";
import { approveTab, payCash, rejectTab } from "@/lib/actions/sales";
import { formatRand } from "@/lib/money";
import { createClient } from "@/lib/supabase/client";

export type PendingPayment = {
  id: string;
  shop_customer_id: string | null;
  total_cents: number;
  tab_cents: number;
  paid_now_cents: number;
  paid_now_method: string | null;
  paid_now_confirmed_at: string | null;
  method: string;
  status: string;
  expires_at: string | null;
};
type Customer = { id: string; display_name: string; customer_profile_id: string | null };
type Result = { ok: true } | { ok: false; error: string };

function errorMessage(error: string): string {
  switch (error) {
    case "customer_not_owner_confirmed": return "Confirm the customer's identity above, then try again.";
    case "insufficient_buying_power": return "The customer no longer has enough buying power. Reject this request and create a new sale.";
    case "immediate_payment_unconfirmed": return "Confirm the cash remainder before approving this tab.";
    case "unauthorized": case "forbidden": return "Sign in as this shop's owner to continue.";
    case "sale_expired": return "This sale has expired. Create a new sale.";
    default: return "The action could not be completed. Refresh requests to check the latest state before trying again.";
  }
}

export function PaymentControls({ sale, customer, onAction, busy }: {
  sale: PendingPayment;
  customer?: Customer;
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
      {sale.status === "tab_requested" && customer && !customer.customer_profile_id && !cashDue && !busy && (
        <PinPad onSubmit={(pin) => onAction("approve", pin)} />
      )}
    </li>
  );
}

export function OwnerPayments({ shopId, refreshKey, onCompleted }: {
  shopId: string;
  refreshKey: string;
  onCompleted: (saleId: string) => void;
}) {
  const [sales, setSales] = useState<PendingPayment[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busy, startTransition] = useTransition();
  const submitting = useRef(false);
  const load = useCallback(async () => {
    const supabase = createClient();
    // WHY: Session-scoped reads expose only RLS-approved, safe columns. Mutations remain server actions.
    const [saleResult, customerResult] = await Promise.all([
      supabase.from("sales")
        .select("id, shop_customer_id, total_cents, tab_cents, paid_now_cents, paid_now_method, paid_now_confirmed_at, method, status, expires_at")
        .eq("shop_id", shopId).in("status", ["pending", "tab_requested"])
        .or(`expires_at.is.null,expires_at.gt.${new Date().toISOString()}`)
        .order("created_at", { ascending: false }).limit(100),
      supabase.from("shop_customers").select("id, display_name, customer_profile_id").eq("shop_id", shopId),
    ]);
    if (saleResult.error || customerResult.error) throw new Error("requests_unavailable");
    setSales(saleResult.data ?? []);
    setCustomers(customerResult.data ?? []);
  }, [shopId]);

  useEffect(() => {
    let active = true;
    startTransition(async () => {
      try { await load(); } catch { if (active) setError("Could not load payment requests. Refresh to try again."); }
    });
    return () => { active = false; };
  }, [load, refreshKey]);

  function refresh() {
    if (submitting.current) return;
    startTransition(async () => {
      try { await load(); setError(""); } catch { setError("Could not refresh payment requests."); }
    });
  }

  async function act(sale: PendingPayment, action: "approve" | "reject" | "cash", pin?: string): Promise<Result> {
    // WHY: The ref closes the gap before React renders disabled buttons; server CAS/RPC checks handle other tabs/devices.
    if (submitting.current) return { ok: false, error: "action_in_progress" };
    submitting.current = true;
    setError(""); setMessage("");
    try {
      const result = action === "cash" ? await payCash({ saleId: sale.id })
        : action === "reject" ? await rejectTab({ saleId: sale.id })
        : await approveTab({ saleId: sale.id, shopCustomerId: sale.shop_customer_id, ...(pin ? { pin } : {}) });
      if (!result.ok) { setError(errorMessage(result.error)); return result; }
      setMessage(action === "cash" ? "Cash receipt recorded." : action === "reject" ? "Tab rejected. Any confirmed receipt remains recorded." : "Tab approved.");
      if (action !== "cash" || sale.status === "pending") onCompleted(sale.id);
      try { await load(); } catch { setError("Action succeeded, but requests could not refresh. Refresh before continuing."); }
      return { ok: true };
    } catch {
      setError("Connection failed. Refresh requests to check whether the action completed before trying again.");
      return { ok: false, error: "unavailable" };
    } finally { submitting.current = false; }
  }

  return (
    <section aria-label="Owner payment requests" className="mt-3 space-y-3 rounded-2xl border border-teal/40 bg-card p-4">
      <h2 className="text-sm font-semibold">Payment requests</h2>
      <p className="text-xs text-foreground/70">Refresh after the customer chooses how to pay. Confirm cash only after receiving it.</p>
      <button className="min-h-11 rounded-lg border border-white/20 px-3 text-sm disabled:opacity-50" disabled={busy} onClick={refresh} type="button">{busy ? "Updating…" : "Refresh requests"}</button>
      {message && <p className="text-sm text-teal" role="status">{message}</p>}
      {error && <p className="text-sm text-red-200" role="alert">{error}</p>}
      <ul className="space-y-3">{sales.map((sale) => <PaymentControls key={sale.id} sale={sale}
        customer={customers.find((customer) => customer.id === sale.shop_customer_id)} busy={busy}
        onAction={(action, pin) => new Promise<Result>((resolve) => startTransition(async () => { resolve(await act(sale, action, pin)); }))} />)}</ul>
    </section>
  );
}
