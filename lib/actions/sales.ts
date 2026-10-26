"use server";

import { createHash } from "node:crypto";
import { headers } from "next/headers";
import { calculateBuyingPower, type BuyingPowerHistory, type BuyingPowerSale } from "@/lib/buyingPower";
import { products } from "@/lib/products";
import { verifyPin } from "@/lib/pin";
import { createSaleToken, verifySaleToken } from "@/lib/qr";
import { checkRateLimit, getClientIp, RATE_LIMITS } from "@/lib/rateLimit";
import {
  approveTabSchema,
  createSaleSchema,
  payCashSchema,
  saleTokenSchema,
} from "@/lib/validation";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient as createSessionClient } from "@/lib/supabase/server";
import { z } from "zod";

type ActionFailure = { ok: false; error: string };

type ActionSuccess<T extends object> = { ok: true } & T;

type OwnerContext =
  | {
    ok: true;
    admin: ReturnType<typeof createAdminClient>;
    shopId: string;
    userId: string;
  }
  | ActionFailure;

type CustomerContext =
  | {
    ok: true;
    admin: ReturnType<typeof createAdminClient>;
    userId: string;
  }
  | ActionFailure;

type SaleRecord = {
  id: string;
  shopId: string;
  shopCustomerId: string | null;
  totalCents: number;
  method: "pending" | "tab" | "demo_card" | "cash";
  status: "pending" | "tab_requested" | "approved" | "paid" | "repaid" | "expired" | "cancelled";
  paidNowCents: number;
  tabCents: number;
  paidNowMethod: "cash" | "demo_card" | null;
  paidNowConfirmedAt: string | null;
  qrTokenHash: string | null;
  expiresAt: string | null;
  usedAt: string | null;
};

type CustomerSecurityRecord = {
  id: string;
  status: "active" | "blocked";
  consentAt: string | null;
  customerProfileId: string | null;
  ownerConfirmedAt: string | null;
  pinHash: string | null;
  failedPinAttempts: number;
  lockedUntil: string | null;
  creditLimitCents: number;
};

function isSaleMethod(value: unknown): value is SaleRecord["method"] {
  return value === "pending" || value === "tab" || value === "demo_card" || value === "cash";
}

function isSaleStatus(value: unknown): value is SaleRecord["status"] {
  return value === "pending"
    || value === "tab_requested"
    || value === "approved"
    || value === "paid"
    || value === "repaid"
    || value === "expired"
    || value === "cancelled";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isSafeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value);
}

function isSaleQrExpiredError(error: { code?: string; message?: string } | null): boolean {
  // WHY: Map only the known database expiry result to customer-safe feedback.
  return error?.code === "P0001" && error.message === "Sale QR has expired";
}

function parseSaleRecord(value: unknown): SaleRecord | null {
  if (!isRecord(value)) return null;
  if (
    typeof value.id !== "string"
    || typeof value.shop_id !== "string"
    || (value.shop_customer_id !== null && typeof value.shop_customer_id !== "string")
    || !isSafeInteger(value.total_cents)
    || !isSaleMethod(value.method)
    || !isSaleStatus(value.status)
    || !isSafeInteger(value.paid_now_cents)
    || !isSafeInteger(value.tab_cents)
    || (value.paid_now_method !== null && value.paid_now_method !== "cash" && value.paid_now_method !== "demo_card")
    || (value.paid_now_confirmed_at !== null && typeof value.paid_now_confirmed_at !== "string")
    || (value.qr_token_hash !== null && typeof value.qr_token_hash !== "string")
    || (value.expires_at !== null && typeof value.expires_at !== "string")
    || (value.used_at !== null && typeof value.used_at !== "string")
  ) {
    return null;
  }

  return {
    id: value.id,
    shopId: value.shop_id,
    shopCustomerId: value.shop_customer_id,
    totalCents: value.total_cents,
    method: value.method,
    status: value.status,
    paidNowCents: value.paid_now_cents,
    tabCents: value.tab_cents,
    paidNowMethod: value.paid_now_method,
    paidNowConfirmedAt: value.paid_now_confirmed_at,
    qrTokenHash: value.qr_token_hash,
    expiresAt: value.expires_at,
    usedAt: value.used_at,
  };
}

function parseCustomerRecord(value: unknown): CustomerSecurityRecord | null {
  if (!isRecord(value)) return null;
  if (
    typeof value.id !== "string"
    || (value.status !== "active" && value.status !== "blocked")
    || (value.consent_at !== null && typeof value.consent_at !== "string")
    || (value.customer_profile_id !== null && typeof value.customer_profile_id !== "string")
    || (value.owner_confirmed_at !== null && typeof value.owner_confirmed_at !== "string")
    || (value.pin_hash !== null && typeof value.pin_hash !== "string")
    || !isSafeInteger(value.failed_pin_attempts)
    || (value.locked_until !== null && typeof value.locked_until !== "string")
    || !isSafeInteger(value.credit_limit_cents)
  ) {
    return null;
  }

  return {
    id: value.id,
    status: value.status,
    consentAt: value.consent_at,
    customerProfileId: value.customer_profile_id,
    ownerConfirmedAt: value.owner_confirmed_at,
    pinHash: value.pin_hash,
    failedPinAttempts: value.failed_pin_attempts,
    lockedUntil: value.locked_until,
    creditLimitCents: value.credit_limit_cents,
  };
}

async function getOwnerContext(): Promise<OwnerContext> {
  let sessionClient;
  try {
    sessionClient = await createSessionClient();
  } catch {
    return { ok: false, error: "unavailable" };
  }

  const { data: { user }, error: authError } = await sessionClient.auth.getUser();
  if (authError || !user) {
    return { ok: false, error: "unauthorized" };
  }

  // WHY: The server checks the saved role instead of trusting a client-supplied role or JWT metadata.
  const { data: profile, error: profileError } = await sessionClient
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();
  if (profileError) {
    return { ok: false, error: "unavailable" };
  }
  if (!profile || profile.role !== "shop_owner") {
    return { ok: false, error: "forbidden" };
  }

  // WHY: Deriving the shop from the authenticated owner prevents callers selecting another shop's data.
  const { data: shops, error: shopsError } = await sessionClient
    .from("shops")
    .select("id")
    .eq("owner_id", user.id)
    .limit(2);
  if (shopsError) {
    return { ok: false, error: "unavailable" };
  }
  if (!shops || shops.length !== 1) {
    return { ok: false, error: "shop_unavailable" };
  }

  let admin;
  try {
    admin = createAdminClient();
  } catch {
    return { ok: false, error: "unavailable" };
  }

  return { ok: true, admin, shopId: shops[0].id, userId: user.id };
}

async function getCustomerContext(): Promise<CustomerContext> {
  let sessionClient;
  try {
    sessionClient = await createSessionClient();
  } catch {
    return { ok: false, error: "unavailable" };
  }

  const { data: { user }, error: authError } = await sessionClient.auth.getUser();
  if (authError || !user) {
    return { ok: false, error: "unauthorized" };
  }

  const { data: profile, error: profileError } = await sessionClient
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();
  if (profileError) {
    return { ok: false, error: "unavailable" };
  }
  if (!profile || profile.role !== "customer") {
    return { ok: false, error: "forbidden" };
  }

  let admin;
  try {
    admin = createAdminClient();
  } catch {
    return { ok: false, error: "unavailable" };
  }
  return { ok: true, admin, userId: user.id };
}

async function getSale(
  admin: ReturnType<typeof createAdminClient>,
  saleId: string,
  shopId: string,
): Promise<SaleRecord | null> {
  // WHY: Scope privileged lookups to the session-derived shop so guessed sale IDs cannot cross shop boundaries.
  const { data, error } = await admin
    .from("sales")
    .select("id, shop_id, shop_customer_id, total_cents, method, status, paid_now_cents, tab_cents, paid_now_method, paid_now_confirmed_at, qr_token_hash, expires_at, used_at")
    .eq("id", saleId)
    .eq("shop_id", shopId)
    .maybeSingle();

  if (error) throw new Error("sale_lookup_failed");
  return parseSaleRecord(data);
}

async function getCustomer(
  admin: ReturnType<typeof createAdminClient>,
  customerId: string,
  shopId: string,
): Promise<CustomerSecurityRecord | null> {
  // WHY: Match both IDs so a customer identifier from a different shop is never authorized.
  const { data, error } = await admin
    .from("shop_customers")
    .select("id, status, consent_at, customer_profile_id, owner_confirmed_at, pin_hash, failed_pin_attempts, locked_until, credit_limit_cents")
    .eq("id", customerId)
    .eq("shop_id", shopId)
    .maybeSingle();

  if (error) throw new Error("customer_lookup_failed");
  return parseCustomerRecord(data);
}

async function loadCustomerHistory(
  admin: ReturnType<typeof createAdminClient>,
  shopId: string,
  customerId: string,
): Promise<BuyingPowerHistory> {
  const salesRows: unknown[] = [];
  const pageSize = 1_000;
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
      || !isSaleMethod(entry.method)
      || !isSaleStatus(entry.status)
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

function outstandingBalanceCents(history: BuyingPowerHistory): number {
  const repaidBySale = new Map<string, number>();
  for (const repayment of history.repayments) {
    const nextAmount = (repaidBySale.get(repayment.saleId) ?? 0) + repayment.amountCents;
    if (!Number.isSafeInteger(nextAmount)) throw new Error("invalid_repayment_total");
    repaidBySale.set(repayment.saleId, nextAmount);
  }

  return history.sales.reduce((total, sale) => {
    if (sale.method !== "tab" || sale.status !== "approved") return total;
    const balance = (sale.tabCents ?? 0) - (repaidBySale.get(sale.id) ?? 0);
    if (balance < 0 || !Number.isSafeInteger(total + balance)) {
      throw new Error("invalid_outstanding_balance");
    }
    return total + balance;
  }, 0);
}

export async function createSale(input: unknown): Promise<
  ActionFailure | ActionSuccess<{ saleId: string; token: string; expiresAt: string; totalCents: number }>
> {
  // WHY: Strict server-side parsing rejects forged totals, price fields, and unexpected request properties.
  const parsed = createSaleSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid_input" };

  const owner = await getOwnerContext();
  if (!owner.ok) return owner;

  const catalogueById = new Map(products.map((product) => [product.id, product]));
  let totalCents = 0;
  const items = [];
  for (const requestedItem of parsed.data.items) {
    const product = catalogueById.get(requestedItem.productId);
    // WHY: Only products from the server's catalogue may determine the persisted sale amount.
    if (!product) return { ok: false, error: "unknown_product" };
    const lineTotal = product.priceCents * requestedItem.qty;
    if (!Number.isSafeInteger(lineTotal) || !Number.isSafeInteger(totalCents + lineTotal)) {
      return { ok: false, error: "invalid_total" };
    }
    totalCents += lineTotal;
    items.push({
      productId: product.id,
      name: product.name,
      unitPriceCents: product.priceCents,
      qty: requestedItem.qty,
    });
  }

  // WHY: The server catalogue and integer-cent arithmetic prevent a browser from setting prices or totals.
  const token = createSaleToken();
  const { data, error } = await owner.admin
    .from("sales")
    .insert({
      shop_id: owner.shopId,
      items,
      total_cents: totalCents,
      qr_token_hash: token.tokenHash,
      expires_at: token.expiresAt,
    })
    .select("id")
    .single();
  if (error || !data) return { ok: false, error: "sale_creation_failed" };

  // WHY: The raw token is returned once for the QR; only its SHA-256 hash is persisted.
  return {
    ok: true,
    saleId: data.id,
    token: token.token,
    expiresAt: token.expiresAt,
    totalCents,
  };
}

const customerPayTokenSchema = saleTokenSchema;
const customerTabRequestSchema = z.object({
  token: saleTokenSchema,
  paidNowMethod: z.enum(["demo_card", "cash"]),
}).strict();

type CustomerPaySaleContext =
  | {
    ok: true;
    admin: ReturnType<typeof createAdminClient>;
    sale: SaleRecord;
    shopName: string;
    shopCustomerId: string;
    limitCents: number;
    availableCents: number;
    level: number;
    nextLimitCents: number;
  }
  | ActionFailure;

async function getCustomerPaySaleContext(input: unknown): Promise<CustomerPaySaleContext> {
  const parsed = customerPayTokenSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid_link" };

  const customer = await getCustomerContext();
  if (!customer.ok) return customer;

  const tokenHash = createHash("sha256").update(parsed.data, "utf8").digest("hex");
  const { data, error } = await customer.admin
    .from("sales")
    .select("id, shop_id, shop_customer_id, total_cents, method, status, paid_now_cents, tab_cents, paid_now_method, paid_now_confirmed_at, qr_token_hash, expires_at, used_at")
    .eq("qr_token_hash", tokenHash)
    .maybeSingle();
  if (error) return { ok: false, error: "unavailable" };

  const sale = parseSaleRecord(data);
  if (
    !sale
    || verifySaleToken(parsed.data, sale.qrTokenHash, sale.expiresAt, sale.usedAt) !== "ok"
    || sale.status !== "pending"
    || sale.method !== "pending"
  ) {
    // WHY: Unknown, expired, used, and otherwise unavailable links get the same public response.
    return { ok: false, error: "invalid_link" };
  }

  const { data: shopCustomer, error: customerError } = await customer.admin
    .from("shop_customers")
    .select("id, status, consent_at")
    .eq("shop_id", sale.shopId)
    .eq("customer_profile_id", customer.userId)
    .maybeSingle();
  if (customerError) return { ok: false, error: "unavailable" };
  if (!shopCustomer || shopCustomer.status !== "active" || !shopCustomer.consent_at) {
    return { ok: false, error: "invalid_link" };
  }
  if (sale.shopCustomerId !== null && sale.shopCustomerId !== shopCustomer.id) {
    return { ok: false, error: "invalid_link" };
  }

  const { data: shop, error: shopError } = await customer.admin
    .from("shops")
    .select("name")
    .eq("id", sale.shopId)
    .maybeSingle();
  if (shopError || typeof shop?.name !== "string") return { ok: false, error: "unavailable" };

  let history: BuyingPowerHistory;
  let buyingPower: ReturnType<typeof calculateBuyingPower>;
  let outstandingCents: number;
  try {
    history = await loadCustomerHistory(customer.admin, sale.shopId, shopCustomer.id);
    buyingPower = calculateBuyingPower(history, new Date());
    outstandingCents = outstandingBalanceCents(history);
  } catch {
    return { ok: false, error: "buying_power_unavailable" };
  }

  return {
    ok: true,
    admin: customer.admin,
    sale,
    shopName: shop.name,
    shopCustomerId: shopCustomer.id,
    limitCents: buyingPower.limitCents,
    availableCents: Math.max(0, buyingPower.limitCents - outstandingCents),
    level: buyingPower.level,
    nextLimitCents: buyingPower.nextLimitCents,
  };
}

export async function getCustomerPayDetails(input: unknown): Promise<
  ActionFailure | ActionSuccess<{
    totalCents: number;
    shopName: string;
    limitCents: number;
    availableCents: number;
    level: number;
    nextLimitCents: number;
    tabCents: number;
    remainderCents: number;
  }>
> {
  const context = await getCustomerPaySaleContext(input);
  if (!context.ok) return context;

  const tabCents = Math.min(context.sale.totalCents, context.availableCents);
  return {
    ok: true,
    totalCents: context.sale.totalCents,
    shopName: context.shopName,
    limitCents: context.limitCents,
    availableCents: context.availableCents,
    level: context.level,
    nextLimitCents: context.nextLimitCents,
    tabCents,
    remainderCents: context.sale.totalCents - tabCents,
  };
}

export async function requestCustomerTab(input: unknown): Promise<
  ActionFailure | ActionSuccess<{
    saleId: string;
    status: "tab_requested";
    tabCents: number;
    paidNowCents: number;
    paidNowMethod: "demo_card" | "cash" | null;
  }>
> {
  const parsed = customerTabRequestSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid_input" };

  const context = await getCustomerPaySaleContext(parsed.data.token);
  if (!context.ok) return context;

  const tabCents = Math.min(context.sale.totalCents, context.availableCents);
  if (tabCents <= 0) return { ok: false, error: "no_buying_power" };

  const now = new Date().toISOString();
  const paidNowCents = context.sale.totalCents - tabCents;
  const paidNowMethod = paidNowCents > 0 ? parsed.data.paidNowMethod : null;
  let request = context.admin
    .from("sales")
    .update({
      shop_customer_id: context.shopCustomerId,
      method: "tab",
      paid_now_cents: paidNowCents,
      tab_cents: tabCents,
      paid_now_method: paidNowMethod,
      // WHY: The card/wallet option is explicitly simulated, so its remainder is confirmed without collecting payment data.
      paid_now_confirmed_at: paidNowMethod === "demo_card" ? now : null,
      used_at: now,
      status: "tab_requested",
    })
    .eq("id", context.sale.id)
    .eq("shop_id", context.sale.shopId)
    .eq("status", "pending")
    .eq("method", "pending")
    .is("used_at", null)
    .gt("expires_at", now);
  request = context.sale.shopCustomerId === null
    ? request.is("shop_customer_id", null)
    : request.eq("shop_customer_id", context.shopCustomerId);
  const { data, error } = await request.select("id").maybeSingle();
  if (error || !data) return { ok: false, error: isSaleQrExpiredError(error) ? "sale_expired" : "sale_not_payable" };

  return {
    ok: true,
    saleId: context.sale.id,
    status: "tab_requested",
    tabCents,
    paidNowCents,
    paidNowMethod,
  };
}

export async function requestCustomerCash(input: unknown): Promise<
  ActionFailure | ActionSuccess<{ saleId: string; status: "cash_requested" }>
> {
  const parsed = customerPayTokenSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid_link" };

  const customer = await getCustomerContext();
  if (!customer.ok) return customer;

  const tokenHash = createHash("sha256").update(parsed.data, "utf8").digest("hex");
  const { data: saleData, error: saleError } = await customer.admin
    .from("sales")
    .select("id, shop_id, shop_customer_id, total_cents, method, status, paid_now_cents, tab_cents, paid_now_method, paid_now_confirmed_at, qr_token_hash, expires_at, used_at")
    .eq("qr_token_hash", tokenHash)
    .maybeSingle();
  if (saleError) return { ok: false, error: "unavailable" };

  const sale = parseSaleRecord(saleData);
  if (
    !sale
    || verifySaleToken(parsed.data, sale.qrTokenHash, sale.expiresAt, sale.usedAt) !== "ok"
    || sale.status !== "pending"
    || sale.method !== "pending"
  ) {
    return { ok: false, error: "invalid_link" };
  }

  const { data: shopCustomer, error: customerError } = await customer.admin
    .from("shop_customers")
    .select("id, status, consent_at")
    .eq("shop_id", sale.shopId)
    .eq("customer_profile_id", customer.userId)
    .maybeSingle();
  if (customerError) return { ok: false, error: "unavailable" };
  if (!shopCustomer || shopCustomer.status !== "active" || !shopCustomer.consent_at) {
    return { ok: false, error: "invalid_link" };
  }
  if (sale.shopCustomerId !== null && sale.shopCustomerId !== shopCustomer.id) {
    return { ok: false, error: "invalid_link" };
  }

  const now = new Date().toISOString();
  let request = customer.admin
    .from("sales")
    .update({
      shop_customer_id: shopCustomer.id,
      method: "cash",
      paid_now_cents: sale.totalCents,
      tab_cents: 0,
      paid_now_method: "cash",
      paid_now_confirmed_at: null,
      used_at: now,
    })
    .eq("id", sale.id)
    .eq("shop_id", sale.shopId)
    .eq("status", "pending")
    .eq("method", "pending")
    .is("used_at", null)
    .gt("expires_at", now);
  request = sale.shopCustomerId === null
    ? request.is("shop_customer_id", null)
    : request.eq("shop_customer_id", shopCustomer.id);
  const { data, error } = await request.select("id").maybeSingle();
  if (error || !data) return { ok: false, error: isSaleQrExpiredError(error) ? "sale_expired" : "sale_not_payable" };

  return { ok: true, saleId: sale.id, status: "cash_requested" };
}

export async function approveTab(input: unknown): Promise<
  ActionFailure | ActionSuccess<{ saleId: string; dueAt: string; limitCents: number }>
> {
  // WHY: The server accepts only sale/customer identifiers and PIN; totals and limits come from persisted data.
  const parsed = approveTabSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid_input" };

  const owner = await getOwnerContext();
  if (!owner.ok) return owner;

  const { saleId, shopCustomerId, pin } = parsed.data;
  let customer: CustomerSecurityRecord | null;
  try {
    customer = await getCustomer(owner.admin, shopCustomerId, owner.shopId);
  } catch {
    return { ok: false, error: "unavailable" };
  }
  if (!customer) return { ok: false, error: "sale_or_customer_not_found" };
  if (customer.customerProfileId !== null && pin !== undefined) {
    return { ok: false, error: "unexpected_pin" };
  }

  if (pin !== undefined) {
    const rateLimit = checkRateLimit(
      getClientIp(await headers()),
      "pin:approve-tab",
      RATE_LIMITS.pin,
    );
    if (!rateLimit.allowed) return { ok: false, error: "pin_rate_limited" };
  }

  let pinVerified = false;
  if (pin !== undefined && customer.customerProfileId === null && customer.pinHash !== null) {
    try {
      pinVerified = await verifyPin(pin, customer.pinHash);
    } catch {
      return { ok: false, error: "pin_state_unavailable" };
    }
  }

  let approval: unknown;
  try {
    const { data, error } = await owner.admin.rpc("approve_tab_atomic", {
      target_sale_id: saleId,
      target_shop_customer_id: shopCustomerId,
      target_shop_id: owner.shopId,
      expected_owner_id: owner.userId,
      verified_pin_hash: customer.customerProfileId === null ? customer.pinHash : null,
      pin_was_supplied: pin !== undefined,
      pin_was_verified: pinVerified,
    });
    if (error) return { ok: false, error: "tab_approval_failed" };
    approval = data;
  } catch {
    return { ok: false, error: "tab_approval_failed" };
  }

  if (!isRecord(approval) || typeof approval.ok !== "boolean") {
    return { ok: false, error: "tab_approval_failed" };
  }
  if (approval.ok === false) {
    return { ok: false, error: typeof approval.error === "string" ? approval.error : "tab_approval_failed" };
  }
  if (
    typeof approval.saleId !== "string"
    || typeof approval.dueAt !== "string"
    || !isSafeInteger(approval.limitCents)
  ) return { ok: false, error: "tab_approval_failed" };
  return {
    ok: true,
    saleId: approval.saleId,
    dueAt: approval.dueAt,
    limitCents: approval.limitCents,
  };
}

const rejectTabSchema = z.object({ saleId: z.string().uuid() }).strict();

/** Cancel only an owned, unapproved tab request, preserving confirmed receipts and rejecting stale submissions. */
export async function rejectTab(input: unknown): Promise<
  ActionFailure | ActionSuccess<{ saleId: string; status: "cancelled" }>
> {
  const parsed = rejectTabSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid_input" };
  const owner = await getOwnerContext();
  if (!owner.ok) return owner;

  // WHY: Cancellation already exists in the state trigger. The conditional update wins once,
  // cannot cancel an approved tab, and retains any confirmed upfront receipt for the ledger.
  const { data, error } = await owner.admin.from("sales")
    .update({ status: "cancelled" })
    .eq("id", parsed.data.saleId)
    .eq("shop_id", owner.shopId)
    .eq("status", "tab_requested")
    .select("id").maybeSingle();
  if (error) return { ok: false, error: "tab_rejection_failed" };
  if (!data) return { ok: false, error: "sale_not_rejectable" };
  return { ok: true, saleId: data.id, status: "cancelled" };
}

export async function payCash(input: unknown): Promise<
  ActionFailure | ActionSuccess<{ saleId: string; status: "paid" | "tab_requested" }>
> {
  // WHY: Reject unrecognized client fields so callers cannot smuggle a total, limit, or shop identifier.
  const parsed = payCashSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid_input" };

  const owner = await getOwnerContext();
  if (!owner.ok) return owner;

  let sale: SaleRecord | null;
  try {
    sale = await getSale(owner.admin, parsed.data.saleId, owner.shopId);
  } catch {
    return { ok: false, error: "unavailable" };
  }
  if (!sale) return { ok: false, error: "sale_not_found" };
  // WHY: QR expiry gates first redemption; an already consumed customer request remains actionable afterward.
  if (sale.usedAt === null && sale.expiresAt !== null && Date.parse(sale.expiresAt) <= Date.now()) {
    return { ok: false, error: "sale_expired" };
  }

  let customerId = sale.shopCustomerId;
  if (parsed.data.shopCustomerId) {
    let customer: CustomerSecurityRecord | null;
    try {
      customer = await getCustomer(owner.admin, parsed.data.shopCustomerId, owner.shopId);
    } catch {
      return { ok: false, error: "unavailable" };
    }
    if (!customer || customer.status !== "active" || customer.consentAt === null) {
      return { ok: false, error: "customer_consent_required" };
    }
    if (customerId !== null && customerId !== customer.id) {
      return { ok: false, error: "sale_customer_mismatch" };
    }
    customerId = customer.id;
  }

  if (
    sale.status === "tab_requested"
    && sale.paidNowMethod === "cash"
    && sale.paidNowCents > 0
    && sale.paidNowConfirmedAt === null
  ) {
    const payment = owner.admin
      .from("sales")
      .update({ paid_now_confirmed_at: new Date().toISOString() })
      .eq("id", sale.id)
      .eq("shop_id", owner.shopId)
      .eq("status", "tab_requested")
      .is("paid_now_confirmed_at", null);
    // WHY: This QR was consumed when the tab was requested; expiry must not strand its cash remainder.
    const { data, error } = await payment.select("id").maybeSingle();
    if (error || !data) return {
      ok: false,
      // WHY: Only this known trigger error becomes expiry feedback; never disclose database details.
      error: error?.code === "P0001" && ["Cash request has expired", "Sale QR has expired"].includes(error.message)
        ? "sale_expired" : "cash_confirmation_failed",
    };
    return { ok: true, saleId: sale.id, status: "tab_requested" };
  }

  if (
    sale.status !== "pending"
    || (sale.method !== "pending" && sale.method !== "cash")
    || (sale.method === "pending" && sale.usedAt !== null)
    || (sale.method === "cash" && (
      sale.paidNowCents !== sale.totalCents
      || sale.tabCents !== 0
      || sale.paidNowMethod !== "cash"
      || sale.paidNowConfirmedAt !== null
      || sale.usedAt === null
    ))
  ) {
    return { ok: false, error: "sale_not_payable_by_cash" };
  }

  let payment = owner.admin
    .from("sales")
    .update({
      shop_customer_id: customerId,
      method: "cash",
      paid_now_cents: sale.totalCents,
      tab_cents: 0,
      paid_now_method: "cash",
      paid_now_confirmed_at: new Date().toISOString(),
      status: "paid",
    })
    .eq("id", sale.id)
    .eq("shop_id", owner.shopId)
    .eq("status", "pending")
    .eq("method", sale.method)
    .is("paid_now_confirmed_at", null);
  // WHY: A concurrent customer choice must not be overwritten using the owner's stale read.
  payment = sale.shopCustomerId === null
    ? payment.is("shop_customer_id", null) : payment.eq("shop_customer_id", sale.shopCustomerId);
  payment = sale.usedAt === null ? payment.is("used_at", null) : payment.eq("used_at", sale.usedAt);
  // WHY: Keep a live-QR check only for a request not consumed by the customer yet.
  if (sale.usedAt === null && sale.expiresAt !== null) payment = payment.gt("expires_at", new Date().toISOString());
  const { data, error } = await payment.select("id").maybeSingle();
  if (error || !data) return {
    ok: false,
    // WHY: Lock-wait expiry is authoritative even when the earlier application check passed.
    error: error?.code === "P0001" && ["Cash request has expired", "Sale QR has expired"].includes(error.message)
      ? "sale_expired" : "cash_confirmation_failed",
  };
  return { ok: true, saleId: sale.id, status: "paid" };
}

export async function demoPay(input: unknown): Promise<
  ActionFailure | ActionSuccess<{ saleId: string; status: "paid" | "tab_requested"; simulated: true }>
> {
  // WHY: Strict validation prevents payment calls from accepting forged customer, amount, or shop properties.
  // WHY: The raw QR token proves which pending sale was presented without accepting a client sale or shop ID.
  const parsed = saleTokenSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid_input" };

  const customerContext = await getCustomerContext();
  if (!customerContext.ok) return customerContext;

  let sale: SaleRecord | null;
  try {
    const tokenHash = createHash("sha256").update(parsed.data, "utf8").digest("hex");
    const { data, error } = await customerContext.admin
      .from("sales")
      .select("id, shop_id, shop_customer_id, total_cents, method, status, paid_now_cents, tab_cents, paid_now_method, paid_now_confirmed_at, qr_token_hash, expires_at, used_at")
      .eq("qr_token_hash", tokenHash)
      .maybeSingle();
    if (error) return { ok: false, error: "unavailable" };
    sale = parseSaleRecord(data);
  } catch {
    return { ok: false, error: "unavailable" };
  }
  if (!sale) return { ok: false, error: "sale_not_found" };
  if (sale.expiresAt !== null && Date.parse(sale.expiresAt) <= Date.now()) {
    return { ok: false, error: "sale_expired" };
  }

  const { data: customerData, error: customerError } = await customerContext.admin
    .from("shop_customers")
    .select("id, status, consent_at")
    .eq("shop_id", sale.shopId)
    .eq("customer_profile_id", customerContext.userId)
    .maybeSingle();
  if (
    customerError
    || !customerData
    || typeof customerData.id !== "string"
    || customerData.status !== "active"
    || !customerData.consent_at
  ) {
    return { ok: false, error: "customer_not_linked" };
  }
  // WHY: A customer may only confirm a payment for their own active, consented shop relationship.
  const customerId = customerData.id;
  if (sale.shopCustomerId !== null && sale.shopCustomerId !== customerId) {
    return { ok: false, error: "sale_customer_mismatch" };
  }

  if (
    sale.status === "tab_requested"
    && sale.shopCustomerId === customerId
    && sale.paidNowMethod === "demo_card"
    && sale.paidNowCents > 0
    && sale.paidNowConfirmedAt === null
  ) {
    const { data, error } = await customerContext.admin
      .from("sales")
      .update({ paid_now_confirmed_at: new Date().toISOString() })
      .eq("id", sale.id)
      .eq("shop_id", sale.shopId)
      .eq("shop_customer_id", customerId)
      .eq("status", "tab_requested")
      .is("paid_now_confirmed_at", null)
      .select("id")
      .maybeSingle();
    if (error || !data) return { ok: false, error: isSaleQrExpiredError(error) ? "sale_expired" : "demo_payment_failed" };
    // WHY: The payment is a recorded simulation only; no card data or real money moves.
    return { ok: true, saleId: sale.id, status: "tab_requested", simulated: true };
  }

  if (sale.status !== "pending" || sale.method !== "pending" || sale.usedAt !== null) {
    return { ok: false, error: "sale_not_payable_by_demo_card" };
  }

  let request = customerContext.admin
    .from("sales")
    .update({
      shop_customer_id: customerId,
      method: "demo_card",
      paid_now_cents: sale.totalCents,
      tab_cents: 0,
      paid_now_method: "demo_card",
      paid_now_confirmed_at: new Date().toISOString(),
      status: "paid",
    })
    .eq("id", sale.id)
    .eq("shop_id", sale.shopId)
    .eq("status", "pending")
    .eq("method", "pending");
  request = sale.shopCustomerId === null
    ? request.is("shop_customer_id", null)
    : request.eq("shop_customer_id", customerId);
  const { data, error } = await request.select("id").maybeSingle();
  if (error || !data) return { ok: false, error: isSaleQrExpiredError(error) ? "sale_expired" : "demo_payment_failed" };

  // WHY: Demo payment records an explicitly simulated payment, never a real processor charge.
  return { ok: true, saleId: sale.id, status: "paid", simulated: true };
}
