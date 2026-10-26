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
  created_at: string;
};
export type PaymentCustomer = { id: string; display_name: string; customer_profile_id: string | null };
export type PaymentCursor = Pick<PendingPayment, "created_at" | "id">;
const PAGE_SIZE = 100;

/** Read the active QR's persisted state even after it leaves the pending request list. */
export async function loadOwnerSaleState(shopId: string, saleId: string) {
  const { data, error } = await createClient().from("sales").select("id, status")
    .eq("shop_id", shopId).eq("id", saleId).maybeSingle();
  if (error || !data) throw new Error("sale_state_unavailable");
  return data;
}

/**
 * Read one owner request page through the session client and RLS. A timestamp/ID cursor
 * keeps equally dated requests reachable when newer sales arrive or prior rows are settled.
 * Customer labels are fetched only for this page; no PIN or QR secrets are selected.
 */
export async function loadOwnerPaymentPage(shopId: string, cursor: PaymentCursor | null = null) {
  const supabase = createClient();
  // WHY: Expiry blocks QR redemption, not cash confirmation or approval for an already consumed request.
  const availableRequests = "or(expires_at.is.null,expires_at.gt.now,and(status.eq.tab_requested,used_at.not.is.null),and(method.eq.cash,used_at.not.is.null))";
  const older = cursor
    ? `or(created_at.lt.${cursor.created_at},and(created_at.eq.${cursor.created_at},id.lt.${cursor.id}))` : null;
  const { data, error } = await supabase.from("sales")
    .select("id, shop_customer_id, total_cents, tab_cents, paid_now_cents, paid_now_method, paid_now_confirmed_at, method, status, expires_at, created_at")
    .eq("shop_id", shopId).in("status", ["pending", "tab_requested"])
    .or(older ? `and(${availableRequests},${older})` : `and(${availableRequests})`)
    .order("created_at", { ascending: false }).order("id", { ascending: false }).limit(PAGE_SIZE + 1);
  if (error) throw new Error("requests_unavailable");
  const sales: PendingPayment[] = (data ?? []).slice(0, PAGE_SIZE);
  const customerIds = [...new Set(sales.flatMap((sale) => sale.shop_customer_id ? [sale.shop_customer_id] : []))];
  let customers: PaymentCustomer[] = [];
  if (customerIds.length > 0) {
    const result = await supabase.from("shop_customers")
      .select("id, display_name, customer_profile_id").eq("shop_id", shopId).in("id", customerIds);
    if (result.error) throw new Error("requests_unavailable");
    customers = result.data ?? [];
  }
  const last = sales.at(-1);
  return {
    sales, customers,
    nextCursor: data && data.length > PAGE_SIZE && last ? { created_at: last.created_at, id: last.id } : null,
  };
}

/** Describe the recovery action for an owner payment failure without implying refresh clears PIN lockouts. */
export function ownerPaymentError(error: string): string {
  switch (error) {
    case "invalid_pin": return "That PIN doesn't match. Ask the customer to enter it again.";
    case "pin_locked": return "Too many incorrect PIN attempts. Wait 15 minutes, then refresh this page to try again.";
    case "pin_rate_limited": return "Too many PIN attempts from this device. Wait 15 minutes before trying again.";
    case "pin_required": case "pin_not_set": return "Ask the customer to enter their PIN. If no PIN is set, set it up before approving the tab.";
    case "pin_state_changed": return "The customer's PIN setup changed. Refresh this page, then ask the customer to enter their PIN again.";
    case "pin_state_unavailable": return "The PIN could not be checked. Try again; report the problem if it continues. No approval was confirmed.";
    case "customer_not_owner_confirmed": return "Refresh this page to confirm the customer's identity above, then try again.";
    case "insufficient_buying_power": return "The customer no longer has enough buying power. Reject this request and create a new sale.";
    case "immediate_payment_unconfirmed": return "Confirm the cash remainder before approving this tab.";
    case "unauthorized": case "forbidden": return "Sign in as this shop's owner to continue.";
    case "sale_expired": return "This sale has expired. Create a new sale.";
    default: return "The action could not be completed. Refresh requests to check the latest state before trying again.";
  }
}
