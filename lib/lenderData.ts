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
export class LenderConsentRequiredError extends Error {}

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
      || (entry.due_at !== null && typeof entry.due_at !== "string")
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
      dueAt: entry.due_at,
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
      || !isSafeInteger(entry.amount_cents)
      || entry.amount_cents <= 0
      || typeof entry.paid_at !== "string"
      || typeof entry.on_time !== "boolean"
    ) {
      throw new LenderDataAccessError("Repayment history contains an invalid record");
    }

    return {
      saleId: entry.sale_id,
      amountCents: entry.amount_cents,
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

async function consentIsCurrent(
  supabase: ReturnType<typeof createServiceRoleClient>,
  shopId: string,
  customerId: string,
): Promise<boolean> {
  const { data, error } = await supabase
    .from("shop_customers")
    .select("lender_sharing_consent_at")
    .eq("shop_id", shopId)
    .eq("id", customerId)
    .maybeSingle();
  if (error) throw new LenderDataAccessError("Could not recheck lender consent");
  if (!data) return false;
  if (typeof data.lender_sharing_consent_at !== "string") {
    throw new LenderConsentRequiredError("Customer has revoked lender sharing");
  }
  return true;
}

export async function loadBuyingPowerHistory(
  shopId: string,
  customerId: string,
): Promise<BuyingPowerHistory | null> {
  const supabase = createServiceRoleClient();
  const { data: customer, error: customerError } = await supabase
    .from("shop_customers")
    .select("id, lender_sharing_consent_at")
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
  if (typeof customer.lender_sharing_consent_at !== "string") {
    throw new LenderConsentRequiredError("Customer has not authorized lender sharing");
  }

  const { data: salesData, error: salesError } = await supabase
    .from("sales")
    .select("id, created_at, total_cents, method, status, tab_cents, paid_now_cents, paid_now_method, due_at")
    .eq("shop_id", shopId)
    .eq("shop_customer_id", customerId);

  if (salesError) {
    throw new LenderDataAccessError("Could not load sales history");
  }
  const sales = parseSales(salesData);
  if (sales.length === 0) {
    if (!await consentIsCurrent(supabase, shopId, customerId)) return null;
    return { sales, repayments: [] };
  }

  const saleIds = sales.map((sale) => sale.id);
  const { data: repaymentsData, error: repaymentsError } = await supabase
    .from("repayments")
    .select("sale_id, amount_cents, paid_at, on_time")
    .in("sale_id", saleIds);

  if (repaymentsError) {
    throw new LenderDataAccessError("Could not load repayment history");
  }

  // WHY: Recheck just before disclosure so a revoke during history loading fails closed.
  if (!await consentIsCurrent(supabase, shopId, customerId)) return null;

  return {
    sales,
    repayments: parseRepayments(repaymentsData),
  };
}
