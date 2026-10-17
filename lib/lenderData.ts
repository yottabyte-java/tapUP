import "server-only";
import { createClient } from "@supabase/supabase-js";
import type {
  BuyingPowerHistory,
  BuyingPowerRepayment,
  BuyingPowerSale,
  ImmediatePaymentMethod,
  SaleMethod,
  SaleStatus,
} from "@/lib/buyingPower";

export class LenderDataAccessError extends Error {}

function isSafeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isSaleMethod(value: unknown): value is SaleMethod {
  return value === "tab"
    || value === "demo_card"
    || value === "cash"
    || value === "pending";
}

function isSaleStatus(value: unknown): value is SaleStatus {
  return value === "pending"
    || value === "tab_requested"
    || value === "approved"
    || value === "paid"
    || value === "repaid"
    || value === "expired"
    || value === "cancelled";
}

function isImmediatePaymentMethod(value: unknown): value is ImmediatePaymentMethod | null {
  return value === null || value === "cash" || value === "demo_card";
}

function parseSales(value: unknown): BuyingPowerSale[] {
  if (!Array.isArray(value)) {
    throw new LenderDataAccessError("Sales history response is invalid");
  }

  return value.map((entry): BuyingPowerSale => {
    if (
      !isRecord(entry)
      || typeof entry.id !== "string"
      || typeof entry.created_at !== "string"
      || !isSafeInteger(entry.total_cents)
      || !isSaleMethod(entry.method)
      || !isSaleStatus(entry.status)
      || !isSafeInteger(entry.tab_cents)
      || !isSafeInteger(entry.paid_now_cents)
      || !isImmediatePaymentMethod(entry.paid_now_method)
    ) {
      throw new LenderDataAccessError("Sales history contains an invalid record");
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
    };
  });
}

function parseRepayments(value: unknown): BuyingPowerRepayment[] {
  if (!Array.isArray(value)) {
    throw new LenderDataAccessError("Repayment history response is invalid");
  }

  return value.map((entry): BuyingPowerRepayment => {
    if (
      !isRecord(entry)
      || typeof entry.sale_id !== "string"
      || typeof entry.paid_at !== "string"
      || typeof entry.on_time !== "boolean"
    ) {
      throw new LenderDataAccessError("Repayment history contains an invalid record");
    }

    return {
      saleId: entry.sale_id,
      paidAt: entry.paid_at,
      onTime: entry.on_time,
    };
  });
}

function createServiceRoleClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) {
    throw new LenderDataAccessError("Server database configuration is missing");
  }

  // WHY: The service-role key bypasses RLS, so this client must stay in a server-only module.
  return createClient(url, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false,
    },
  });
}

export async function loadBuyingPowerHistory(
  shopId: string,
  customerId: string,
  now: Date,
): Promise<BuyingPowerHistory | null> {
  const supabase = createServiceRoleClient();
  const { data: customer, error: customerError } = await supabase
    .from("shop_customers")
    .select("id")
    .eq("shop_id", shopId)
    .eq("id", customerId)
    .maybeSingle();

  if (customerError) {
    throw new LenderDataAccessError("Could not load shop customer");
  }
  if (!customer) {
    // WHY: A single scoped lookup hides whether the shop or customer identifier was absent.
    return null;
  }

  const { data: salesData, error: salesError } = await supabase
    .from("sales")
    .select("id, created_at, total_cents, method, status, tab_cents, paid_now_cents, paid_now_method")
    .eq("shop_id", shopId)
    .eq("shop_customer_id", customerId);

  if (salesError) {
    throw new LenderDataAccessError("Could not load sales history");
  }
  const sales = parseSales(salesData);
  if (sales.length === 0) {
    return { sales, repayments: [] };
  }

  const saleIds = sales.map((sale) => sale.id);
  const since = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const { data: repaymentsData, error: repaymentsError } = await supabase
    .from("repayments")
    .select("sale_id, paid_at, on_time")
    .in("sale_id", saleIds)
    .gte("paid_at", since);

  if (repaymentsError) {
    throw new LenderDataAccessError("Could not load repayment history");
  }

  return {
    sales,
    repayments: parseRepayments(repaymentsData),
  };
}
