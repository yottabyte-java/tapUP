"use server";

import { createHash } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient as createSessionClient } from "@/lib/supabase/server";
import { hashPin, isLocked, registerFailure, verifyPin } from "@/lib/pin";
import { addCustomerSchema, saleTokenSchema, setPinSchema } from "@/lib/validation";
import { verifySaleToken } from "@/lib/qr";
import { z } from "zod";

type ActionFailure = { ok: false; error: string };
type ActionSuccess<T extends object> = { ok: true } & T;

type OwnerContext =
  | {
    ok: true;
    admin: ReturnType<typeof createAdminClient>;
    shopId: string;
  }
  | ActionFailure;

type PinCustomer = {
  id: string;
  status: "active" | "blocked";
  consentAt: string | null;
  customerProfileId: string | null;
  pinHash: string | null;
  failedPinAttempts: number;
  lockedUntil: string | null;
};

const verifyPinSchema = z.object({
  shopCustomerId: z.string().uuid(),
  pin: z.string().regex(/^\d{4}$/),
}).strict();
const linkWithConsentSchema = z.object({
  token: saleTokenSchema,
  consent: z.literal(true),
}).strict();

type PayConsentContext =
  | {
    ok: true;
    sessionClient: Awaited<ReturnType<typeof createSessionClient>>;
    shopCustomerId: string;
  }
  | ActionFailure;

async function getPayConsentContext(input: unknown): Promise<PayConsentContext> {
  const parsed = saleTokenSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid_link" };

  let sessionClient;
  try {
    sessionClient = await createSessionClient();
  } catch {
    return { ok: false, error: "unavailable" };
  }
  const { data: { user }, error: authError } = await sessionClient.auth.getUser();
  if (authError || !user) return { ok: false, error: "unauthorized" };

  // WHY: The profile phone must match the shop's existing record before the restricted link function can associate it.
  const { data: profile, error: profileError } = await sessionClient
    .from("profiles")
    .select("role, phone")
    .eq("id", user.id)
    .maybeSingle();
  if (profileError) return { ok: false, error: "unavailable" };
  if (!profile || profile.role !== "customer") return { ok: false, error: "forbidden" };
  if (typeof profile.phone !== "string" || profile.phone.length === 0) {
    return { ok: false, error: "invalid_link" };
  }

  let admin;
  try {
    admin = createAdminClient();
  } catch {
    return { ok: false, error: "unavailable" };
  }
  const tokenHash = createHash("sha256").update(parsed.data, "utf8").digest("hex");
  const { data: sale, error: saleError } = await admin
    .from("sales")
    .select("shop_id, shop_customer_id, method, status, qr_token_hash, expires_at, used_at")
    .eq("qr_token_hash", tokenHash)
    .maybeSingle();
  if (saleError) return { ok: false, error: "unavailable" };
  if (
    !sale
    || typeof sale.shop_id !== "string"
    || sale.shop_customer_id !== null
    || sale.method !== "pending"
    || sale.status !== "pending"
    || (sale.qr_token_hash !== null && typeof sale.qr_token_hash !== "string")
    || (sale.expires_at !== null && typeof sale.expires_at !== "string")
    || (sale.used_at !== null && typeof sale.used_at !== "string")
    || verifySaleToken(parsed.data, sale.qr_token_hash, sale.expires_at, sale.used_at) !== "ok"
  ) {
    return { ok: false, error: "invalid_link" };
  }

  const { data: shopCustomer, error: customerError } = await admin
    .from("shop_customers")
    .select("id, status, customer_profile_id")
    .eq("shop_id", sale.shop_id)
    .eq("customer_phone", profile.phone)
    .maybeSingle();
  if (customerError) return { ok: false, error: "unavailable" };
  if (
    !shopCustomer
    || typeof shopCustomer.id !== "string"
    || shopCustomer.status !== "active"
    || shopCustomer.customer_profile_id !== null
  ) {
    return { ok: false, error: "invalid_link" };
  }

  return { ok: true, sessionClient, shopCustomerId: shopCustomer.id };
}

export async function getCustomerPayConsentState(input: unknown): Promise<
  ActionFailure | ActionSuccess<{ needsConsent: true }>
> {
  const context = await getPayConsentContext(input);
  if (!context.ok) return context;
  return { ok: true, needsConsent: true };
}

export async function linkWithConsent(input: unknown): Promise<
  ActionFailure | ActionSuccess<{ linked: true }>
> {
  const parsed = linkWithConsentSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "consent_required" };

  const context = await getPayConsentContext(parsed.data.token);
  if (!context.ok) return context;

  // WHY: The restricted RPC repeats identity, consent, and phone-match checks inside the database transaction.
  const { error } = await context.sessionClient.rpc("link_shop_customer_with_consent", {
    target_shop_customer_id: context.shopCustomerId,
    consent_given: parsed.data.consent,
  });
  if (error) return { ok: false, error: "link_failed" };
  return { ok: true, linked: true };
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

  // WHY: A stored profile role, not browser-supplied data, determines who may manage shop customers.
  const { data: profile, error: profileError } = await sessionClient
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();
  if (profileError) return { ok: false, error: "unavailable" };
  if (!profile || profile.role !== "shop_owner") {
    return { ok: false, error: "forbidden" };
  }

  // WHY: Looking up the owner's shop from their session prevents submitting another shop's ID.
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

async function getPinCustomer(
  admin: ReturnType<typeof createAdminClient>,
  shopCustomerId: string,
  shopId: string,
): Promise<PinCustomer | null> {
  // WHY: Fetch only what the server needs to verify a PIN; the hash is never returned to a caller.
  const { data, error } = await admin
    .from("shop_customers")
    .select("id, status, consent_at, customer_profile_id, pin_hash, failed_pin_attempts, locked_until")
    .eq("id", shopCustomerId)
    .eq("shop_id", shopId)
    .maybeSingle();
  if (error) throw new Error("customer_lookup_failed");
  if (
    !data
    || typeof data.id !== "string"
    || (data.status !== "active" && data.status !== "blocked")
    || (data.consent_at !== null && typeof data.consent_at !== "string")
    || (data.customer_profile_id !== null && typeof data.customer_profile_id !== "string")
    || (data.pin_hash !== null && typeof data.pin_hash !== "string")
    || !Number.isSafeInteger(data.failed_pin_attempts)
    || (data.locked_until !== null && typeof data.locked_until !== "string")
  ) {
    return null;
  }
  return {
    id: data.id,
    status: data.status,
    consentAt: data.consent_at,
    customerProfileId: data.customer_profile_id,
    pinHash: data.pin_hash,
    failedPinAttempts: data.failed_pin_attempts,
    lockedUntil: data.locked_until,
  };
}

async function recordPinFailure(
  admin: ReturnType<typeof createAdminClient>,
  customer: PinCustomer,
  shopId: string,
): Promise<"recorded" | "locked" | "unavailable"> {
  let current = customer;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const now = new Date();
    const state = { failedAttempts: current.failedPinAttempts, lockedUntil: current.lockedUntil };
    if (isLocked(state, now)) return "locked";
    const next = registerFailure(state, now);

    let update = admin
      .from("shop_customers")
      .update({
        failed_pin_attempts: next.failedAttempts,
        locked_until: next.lockedUntil,
      })
      .eq("id", current.id)
      .eq("shop_id", shopId)
      .eq("failed_pin_attempts", current.failedPinAttempts);
    update = current.lockedUntil === null
      ? update.is("locked_until", null)
      : update.eq("locked_until", current.lockedUntil);

    const { data, error } = await update.select("id").maybeSingle();
    if (error) return "unavailable";
    if (data) return next.lockedUntil === null ? "recorded" : "locked";

    try {
      const refreshed = await getPinCustomer(admin, current.id, shopId);
      if (!refreshed) return "unavailable";
      current = refreshed;
    } catch {
      return "unavailable";
    }
  }
  return "unavailable";
}

async function resetPinFailures(
  admin: ReturnType<typeof createAdminClient>,
  customer: PinCustomer,
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

export async function addCustomer(input: unknown): Promise<
  ActionFailure | ActionSuccess<{ shopCustomerId: string; name: string; phone: string }>
> {
  // WHY: Strict server validation makes consent mandatory and stores phone numbers in one normalized format.
  const parsed = addCustomerSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid_input" };

  const owner = await getOwnerContext();
  if (!owner.ok) return owner;

  const { data, error } = await owner.admin
    .from("shop_customers")
    .insert({
      shop_id: owner.shopId,
      display_name: parsed.data.name,
      customer_phone: parsed.data.phone,
      consent_at: new Date().toISOString(),
    })
    .select("id")
    .maybeSingle();

  // WHY: The database's shop/phone unique constraint closes the race between simultaneous add requests.
  if (error?.code === "23505") return { ok: false, error: "phone_already_added" };
  if (error || !data) return { ok: false, error: "customer_create_failed" };
  return {
    ok: true,
    shopCustomerId: data.id,
    name: parsed.data.name,
    phone: parsed.data.phone,
  };
}

export async function setCustomerPin(input: unknown): Promise<
  ActionFailure | ActionSuccess<{ shopCustomerId: string }>
> {
  const parsed = setPinSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid_input" };

  const owner = await getOwnerContext();
  if (!owner.ok) return owner;

  let pinHash: string;
  try {
    pinHash = await hashPin(parsed.data.pin);
  } catch {
    return { ok: false, error: "pin_setup_failed" };
  }

  // WHY: A conditional write ensures a PIN can only be set once and only after recorded consent.
  const { data, error } = await owner.admin
    .from("shop_customers")
    .update({
      pin_hash: pinHash,
      failed_pin_attempts: 0,
      locked_until: null,
    })
    .eq("id", parsed.data.shopCustomerId)
    .eq("shop_id", owner.shopId)
    .eq("status", "active")
    .is("customer_profile_id", null)
    .not("consent_at", "is", null)
    .is("pin_hash", null)
    .select("id")
    .maybeSingle();
  if (error) return { ok: false, error: "pin_setup_failed" };
  if (!data) return { ok: false, error: "customer_not_found_or_pin_already_set" };
  return { ok: true, shopCustomerId: data.id };
}

export async function verifyCustomerPin(input: unknown): Promise<
  ActionFailure | ActionSuccess<{ valid: true }>
> {
  const parsed = verifyPinSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid_input" };

  const owner = await getOwnerContext();
  if (!owner.ok) return owner;

  let customer: PinCustomer | null;
  try {
    customer = await getPinCustomer(owner.admin, parsed.data.shopCustomerId, owner.shopId);
  } catch {
    return { ok: false, error: "unavailable" };
  }
  if (!customer || customer.status !== "active" || customer.consentAt === null) {
    return { ok: false, error: "customer_not_available" };
  }
  if (customer.customerProfileId !== null) return { ok: false, error: "pin_not_applicable" };
  if (!customer.pinHash) return { ok: false, error: "pin_not_set" };
  if (isLocked({
    failedAttempts: customer.failedPinAttempts,
    lockedUntil: customer.lockedUntil,
  })) {
    return { ok: false, error: "pin_locked" };
  }

  let valid: boolean;
  try {
    valid = await verifyPin(parsed.data.pin, customer.pinHash);
  } catch {
    return { ok: false, error: "pin_verification_unavailable" };
  }
  if (!valid) {
    const outcome = await recordPinFailure(owner.admin, customer, owner.shopId);
    if (outcome === "unavailable") return { ok: false, error: "pin_state_unavailable" };
    return { ok: false, error: outcome === "locked" ? "pin_locked" : "invalid_pin" };
  }

  if (!await resetPinFailures(owner.admin, customer, owner.shopId)) {
    return { ok: false, error: "pin_state_unavailable" };
  }
  return { ok: true, valid: true };
}
