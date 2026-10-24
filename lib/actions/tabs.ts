"use server";

import {
  calculateBuyingPower,
  type BuyingPowerHistory,
  type BuyingPowerSale,
} from "@/lib/buyingPower";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient as createSessionClient } from "@/lib/supabase/server";
import { repayTabSchema } from "@/lib/validation";

type ActionFailure = { ok: false; error: string };
type ActionSuccess<T extends object> = { ok: true } & T;

type OwnerContext =
  | {
    ok: true;
    admin: ReturnType<typeof createAdminClient>;
    shopId: string;
  }
  | ActionFailure;

type RepaymentSale = {
  id: string;
  shopCustomerId: string;
  status: "approved" | "repaid";
  tabCents: number;
  dueAt: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isSafeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value);
}

async function getOwnerContext(): Promise<OwnerContext> {
  let sessionClient;
  try {
    sessionClient = await createSessionClient();
  } catch {
    return { ok: false, error: "unavailable" };
  }

  const { data: { user }, error: authError } = await sessionClient.auth.getUser();
  if (authError || !user) return { ok: false, error: "unauthorized" };

  // WHY: A saved profile role, rather than a client-supplied role, authorizes shop-owner actions.
  const { data: profile, error: profileError } = await sessionClient
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();
  if (profileError) return { ok: false, error: "unavailable" };
  if (!profile || profile.role !== "shop_owner") {
    return { ok: false, error: "forbidden" };
  }

  // WHY: Resolve the shop from the authenticated owner so a caller cannot choose another shop.
  const { data: shops, error: shopError } = await sessionClient
    .from("shops")
    .select("id")
    .eq("owner_id", user.id)
    .limit(2);
  if (shopError) return { ok: false, error: "unavailable" };
  if (!shops || shops.length !== 1) return { ok: false, error: "shop_unavailable" };

  let admin;
  try {
    admin = createAdminClient();
  } catch {
    return { ok: false, error: "unavailable" };
  }

  return { ok: true, admin, shopId: shops[0].id };
}

async function loadCustomerHistory(
  admin: ReturnType<typeof createAdminClient>,
  shopId: string,
  customerId: string,
): Promise<BuyingPowerHistory> {
  const pageSize = 1_000;
  const salesRows: unknown[] = [];

  for (let offset = 0; ; offset += pageSize) {
    const { data, error } = await admin
      .from("sales")
      .select("id, created_at, total_cents, method, status, tab_cents, paid_now_cents, paid_now_method, due_at")
      .eq("shop_id", shopId)
      .eq("shop_customer_id", customerId)
      .order("created_at", { ascending: true })
      .range(offset, offset + pageSize - 1);
    if (error || !data) throw new Error("sales_history_unavailable");
    salesRows.push(...data);
    if (data.length < pageSize) break;
  }

  const sales: BuyingPowerSale[] = salesRows.map((entry) => {
    if (
      !isRecord(entry)
      || typeof entry.id !== "string"
      || typeof entry.created_at !== "string"
      || !isSafeInteger(entry.total_cents)
      || (entry.method !== "pending" && entry.method !== "tab" && entry.method !== "demo_card" && entry.method !== "cash")
      || (entry.status !== "pending"
        && entry.status !== "tab_requested"
        && entry.status !== "approved"
        && entry.status !== "paid"
        && entry.status !== "repaid"
        && entry.status !== "expired"
        && entry.status !== "cancelled")
      || !isSafeInteger(entry.tab_cents)
      || !isSafeInteger(entry.paid_now_cents)
      || (entry.paid_now_method !== null && entry.paid_now_method !== "cash" && entry.paid_now_method !== "demo_card")
      || (entry.due_at !== null && typeof entry.due_at !== "string")
    ) {
      throw new Error("invalid_sales_history");
    }
    return {
      id: entry.id,
      createdAt: entry.created_at,
      totalCents: entry.total_cents,
      method: entry.method,
      status: entry.status,
      tabCents: entry.tab_cents,
      paidNowCents: entry.paid_now_cents,
      paidNowMethod: entry.paid_now_method,
      dueAt: entry.due_at,
    };
  });

  const repayments: BuyingPowerHistory["repayments"] = [];
  for (let saleOffset = 0; saleOffset < sales.length; saleOffset += 200) {
    const saleIds = sales.slice(saleOffset, saleOffset + 200).map((sale) => sale.id);
    for (let offset = 0; ; offset += pageSize) {
      const { data, error } = await admin
        .from("repayments")
        .select("sale_id, amount_cents, paid_at, on_time")
        .in("sale_id", saleIds)
        .order("paid_at", { ascending: true })
        .range(offset, offset + pageSize - 1);
      if (error || !data) throw new Error("repayment_history_unavailable");

      for (const entry of data) {
        if (
          !isRecord(entry)
          || typeof entry.sale_id !== "string"
          || !isSafeInteger(entry.amount_cents)
          || typeof entry.paid_at !== "string"
          || typeof entry.on_time !== "boolean"
        ) {
          throw new Error("invalid_repayment_history");
        }
        repayments.push({
          saleId: entry.sale_id,
          amountCents: entry.amount_cents,
          paidAt: entry.paid_at,
          onTime: entry.on_time,
        });
      }
      if (data.length < pageSize) break;
    }
  }

  return { sales, repayments };
}

export async function repayTab(input: unknown): Promise<
  ActionFailure | ActionSuccess<{
    saleId: string;
    amountCents: number;
    onTime: boolean;
    status: "approved" | "repaid";
    buyingPower: ReturnType<typeof calculateBuyingPower>;
  }>
> {
  const parsed = repayTabSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid_input" };

  const owner = await getOwnerContext();
  if (!owner.ok) return owner;

  const { data: saleData, error: saleError } = await owner.admin
    .from("sales")
    .select("id, shop_customer_id, status, tab_cents, due_at")
    .eq("id", parsed.data.saleId)
    .eq("shop_id", owner.shopId)
    .maybeSingle();
  if (saleError) return { ok: false, error: "sale_unavailable" };
  if (
    !isRecord(saleData)
    || typeof saleData.id !== "string"
    || typeof saleData.shop_customer_id !== "string"
    || (saleData.status !== "approved" && saleData.status !== "repaid")
    || !isSafeInteger(saleData.tab_cents)
    || typeof saleData.due_at !== "string"
    || !Number.isFinite(Date.parse(saleData.due_at))
  ) {
    return { ok: false, error: "sale_not_found_or_not_payable" };
  }

  const sale: RepaymentSale = {
    id: saleData.id,
    shopCustomerId: saleData.shop_customer_id,
    status: saleData.status,
    tabCents: saleData.tab_cents,
    dueAt: saleData.due_at,
  };
  if (sale.status !== "approved") {
    return { ok: false, error: "sale_has_no_outstanding_balance" };
  }

  const { data: repaymentRows, error: repaymentError } = await owner.admin
    .from("repayments")
    .select("amount_cents")
    .eq("sale_id", sale.id);
  if (repaymentError || !repaymentRows) {
    return { ok: false, error: "repayment_history_unavailable" };
  }

  let repaidCents = 0;
  for (const row of repaymentRows) {
    if (!isRecord(row) || !isSafeInteger(row.amount_cents) || row.amount_cents <= 0) {
      return { ok: false, error: "repayment_history_unavailable" };
    }
    repaidCents += row.amount_cents;
    if (!Number.isSafeInteger(repaidCents)) {
      return { ok: false, error: "repayment_history_unavailable" };
    }
  }

  const owedCents = sale.tabCents - repaidCents;
  if (owedCents <= 0) return { ok: false, error: "sale_has_no_outstanding_balance" };
  if (parsed.data.amountCents > owedCents) {
    return { ok: false, error: "amount_exceeds_outstanding_balance" };
  }

  const paidAt = new Date();
  // WHY: The database trigger locks and rechecks the balance, then uses its clock as authority for paid_at/on_time.
  const { data: repayment, error: insertError } = await owner.admin
    .from("repayments")
    .insert({
      sale_id: sale.id,
      amount_cents: parsed.data.amountCents,
      paid_at: paidAt.toISOString(),
      on_time: paidAt.getTime() <= Date.parse(sale.dueAt),
    })
    .select("paid_at, on_time")
    .maybeSingle();
  if (
    insertError
    || !isRecord(repayment)
    || typeof repayment.paid_at !== "string"
    || typeof repayment.on_time !== "boolean"
  ) {
    return { ok: false, error: "repayment_recording_failed" };
  }

  const { data: updatedSale, error: updatedSaleError } = await owner.admin
    .from("sales")
    .select("status")
    .eq("id", sale.id)
    .eq("shop_id", owner.shopId)
    .maybeSingle();
  if (
    updatedSaleError
    || !isRecord(updatedSale)
    || (updatedSale.status !== "approved" && updatedSale.status !== "repaid")
  ) {
    return { ok: false, error: "repayment_recorded_sale_status_unavailable" };
  }

  let buyingPower: ReturnType<typeof calculateBuyingPower>;
  try {
    buyingPower = calculateBuyingPower(
      await loadCustomerHistory(owner.admin, owner.shopId, sale.shopCustomerId),
      new Date(),
    );
  } catch {
    return { ok: false, error: "repayment_recorded_buying_power_unavailable" };
  }

  const { data: customer, error: limitError } = await owner.admin
    .from("shop_customers")
    .update({ credit_limit_cents: buyingPower.limitCents })
    .eq("id", sale.shopCustomerId)
    .eq("shop_id", owner.shopId)
    .select("id")
    .maybeSingle();
  if (limitError || !customer) {
    return { ok: false, error: "repayment_recorded_buying_power_unavailable" };
  }

  return {
    ok: true,
    saleId: sale.id,
    amountCents: parsed.data.amountCents,
    onTime: repayment.on_time,
    status: updatedSale.status,
    buyingPower,
  };
}
