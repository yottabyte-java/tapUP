"use server";

import { createHash } from "node:crypto";
import { headers } from "next/headers";
import { calculateBuyingPower, type BuyingPowerHistory, type BuyingPowerSale } from "@/lib/buyingPower";
import { products } from "@/lib/products";
import { isLocked, registerFailure, verifyPin } from "@/lib/pin";
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

async function recordFailedPin(
  admin: ReturnType<typeof createAdminClient>,
  customerId: string,
  shopId: string,
): Promise<"locked" | "recorded" | "unavailable"> {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    let customer: CustomerSecurityRecord | null;
    try {
      customer = await getCustomer(admin, customerId, shopId);
    } catch {
      return "unavailable";
    }
    if (!customer) return "unavailable";

    const state = {
      failedAttempts: customer.failedPinAttempts,
      lockedUntil: customer.lockedUntil,
    };
    const now = new Date();
    if (isLocked(state, now)) return "locked";
    const nextState = registerFailure(state, now);

    let update = admin
      .from("shop_customers")
      .update({
        failed_pin_attempts: nextState.failedAttempts,
        locked_until: nextState.lockedUntil,
      })
      .eq("id", customerId)
      .eq("shop_id", shopId)
      .eq("failed_pin_attempts", customer.failedPinAttempts);
    update = customer.lockedUntil === null
      ? update.is("locked_until", null)
      : update.eq("locked_until", customer.lockedUntil);

    const { data, error } = await update.select("id").maybeSingle();
    if (error) return "unavailable";
    if (data) return nextState.lockedUntil === null ? "recorded" : "locked";
  }
  return "unavailable";
}

async function resetPinFailures(
  admin: ReturnType<typeof createAdminClient>,
  customer: CustomerSecurityRecord,
  shopId: string,
): Promise<boolean> {
  let update = admin
    .from("shop_customers")
    .update({ failed_pin_attempts: 0, locked_until: null })
    .eq("id", customer.id)
    .eq("shop_id", shopId)
    .eq("failed_pin_attempts", customer.failedPinAttempts);
  update = customer.lockedUntil === null
    ? update.is("locked_until", null)
    : update.eq("locked_until", customer.lockedUntil);
  const { data, error } = await update.select("id").maybeSingle();
  return !error && data !== null;
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
    || sale.shopCustomerId !== null
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
  const { data, error } = await context.admin
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
    .gt("expires_at", now)
    .select("id")
    .maybeSingle();
  if (error || !data) return { ok: false, error: "sale_not_payable" };

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
    || sale.shopCustomerId !== null
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

  const now = new Date().toISOString();
  const { data, error } = await customer.admin
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
    .gt("expires_at", now)
    .select("id")
    .maybeSingle();
  if (error || !data) return { ok: false, error: "sale_not_payable" };

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
  let sale: SaleRecord | null;
  let customer: CustomerSecurityRecord | null;
  try {
    [sale, customer] = await Promise.all([
      getSale(owner.admin, saleId, owner.shopId),
      getCustomer(owner.admin, shopCustomerId, owner.shopId),
    ]);
  } catch {
    return { ok: false, error: "unavailable" };
  }
  if (!sale || !customer) return { ok: false, error: "sale_or_customer_not_found" };
  if (customer.status !== "active" || customer.consentAt === null) {
    return { ok: false, error: "customer_consent_required" };
  }
  // WHY: Only a current pending/requested sale may transition, which blocks replay and arbitrary sale mutation.
  if (sale.status !== "pending" && sale.status !== "tab_requested") {
    return { ok: false, error: "sale_not_approvable" };
  }
  if (sale.status === "tab_requested" && sale.shopCustomerId !== customer.id) {
    return { ok: false, error: "sale_customer_mismatch" };
  }
  if (sale.status === "pending" && sale.usedAt !== null) {
    return { ok: false, error: "sale_already_used" };
  }
  if (sale.expiresAt !== null && Date.parse(sale.expiresAt) <= Date.now()) {
    return { ok: false, error: "sale_expired" };
  }

  if (customer.customerProfileId === null) {
    if (!pin || !customer.pinHash) return { ok: false, error: "pin_required" };
    if (isLocked({
      failedAttempts: customer.failedPinAttempts,
      lockedUntil: customer.lockedUntil,
    })) {
      return { ok: false, error: "pin_locked" };
    }
    const rateLimit = checkRateLimit(
      getClientIp(await headers()),
      "pin:approve-tab",
      RATE_LIMITS.pin,
    );
    if (!rateLimit.allowed) return { ok: false, error: "pin_rate_limited" };
    const validPin = await verifyPin(pin, customer.pinHash);
    if (!validPin) {
      const failureResult = await recordFailedPin(owner.admin, customer.id, owner.shopId);
      if (failureResult === "unavailable") {
        return { ok: false, error: "pin_state_unavailable" };
      }
      return {
        ok: false,
        error: failureResult === "locked" ? "pin_locked" : "invalid_pin",
      };
    }
    if (!await resetPinFailures(owner.admin, customer, owner.shopId)) {
      return { ok: false, error: "pin_state_unavailable" };
    }
  } else {
    if (customer.ownerConfirmedAt === null) {
      return { ok: false, error: "customer_not_owner_confirmed" };
    }
    if (pin !== undefined) return { ok: false, error: "unexpected_pin" };
  }

  let history: BuyingPowerHistory;
  let calculatedLimit: number;
  let outstandingCents: number;
  try {
    history = await loadCustomerHistory(owner.admin, owner.shopId, customer.id);
    calculatedLimit = calculateBuyingPower(history, new Date()).limitCents;
    outstandingCents = outstandingBalanceCents(history);
  } catch {
    return { ok: false, error: "buying_power_unavailable" };
  }

  const tabCents = sale.status === "tab_requested" ? sale.tabCents : sale.totalCents;
  if (
    !Number.isSafeInteger(tabCents)
    || tabCents <= 0
    || tabCents > calculatedLimit - outstandingCents
  ) {
    return { ok: false, error: "insufficient_buying_power" };
  }
  if (sale.status === "tab_requested" && sale.paidNowCents > 0 && sale.paidNowConfirmedAt === null) {
    return { ok: false, error: "immediate_payment_unconfirmed" };
  }

  const { error: limitError } = await owner.admin
    .from("shop_customers")
    .update({ credit_limit_cents: calculatedLimit })
    .eq("id", customer.id)
    .eq("shop_id", owner.shopId);
  if (limitError) return { ok: false, error: "buying_power_unavailable" };

  if (sale.status === "pending") {
    // WHY: The conditional transition prevents stale or concurrent owner requests from consuming a sale twice.
    const { data: requestData, error: requestError } = await owner.admin
      .from("sales")
      .update({
        shop_customer_id: customer.id,
        method: "tab",
        paid_now_cents: 0,
        tab_cents: sale.totalCents,
        paid_now_method: null,
        status: "tab_requested",
      })
      .eq("id", sale.id)
      .eq("shop_id", owner.shopId)
      .eq("status", "pending")
      .is("used_at", null)
      .select("id")
      .maybeSingle();
    if (requestError || !requestData) return { ok: false, error: "sale_not_approvable" };
  }

  const now = new Date();
  const dueAt = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000).toISOString();
  const { data: approvedSale, error: approvalError } = await owner.admin
    .from("sales")
    .update({
      status: "approved",
      approved_at: now.toISOString(),
      due_at: dueAt,
    })
    .eq("id", sale.id)
    .eq("shop_id", owner.shopId)
    .eq("shop_customer_id", customer.id)
    .eq("status", "tab_requested")
    .select("id")
    .maybeSingle();
  if (approvalError || !approvedSale) {
    return { ok: false, error: "tab_approval_failed" };
  }

  return { ok: true, saleId: sale.id, dueAt, limitCents: calculatedLimit };
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
  if (sale.expiresAt !== null && Date.parse(sale.expiresAt) <= Date.now()) {
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
    const { data, error } = await owner.admin
      .from("sales")
      .update({ paid_now_confirmed_at: new Date().toISOString() })
      .eq("id", sale.id)
      .eq("shop_id", owner.shopId)
      .eq("status", "tab_requested")
      .is("paid_now_confirmed_at", null)
      .select("id")
      .maybeSingle();
    if (error || !data) return { ok: false, error: "cash_confirmation_failed" };
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

  const { data, error } = await owner.admin
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
    .select("id")
    .maybeSingle();
  if (error || !data) return { ok: false, error: "cash_confirmation_failed" };
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
    if (error || !data) return { ok: false, error: "demo_payment_failed" };
    // WHY: The payment is a recorded simulation only; no card data or real money moves.
    return { ok: true, saleId: sale.id, status: "tab_requested", simulated: true };
  }

  if (sale.status !== "pending" || sale.method !== "pending" || sale.usedAt !== null) {
    return { ok: false, error: "sale_not_payable_by_demo_card" };
  }

  const { data, error } = await customerContext.admin
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
    .eq("method", "pending")
    .select("id")
    .maybeSingle();
  if (error || !data) return { ok: false, error: "demo_payment_failed" };

  // WHY: Demo payment records an explicitly simulated payment, never a real processor charge.
  return { ok: true, saleId: sale.id, status: "paid", simulated: true };
}
