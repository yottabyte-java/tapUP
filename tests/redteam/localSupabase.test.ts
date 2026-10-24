import { randomBytes } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const PROJECT_ID = "tapup-redteam-local-20261024";
const enabled = process.env.TAPUP_REDTEAM_LOCAL === "1";

type TestUser = {
  id: string;
  email: string;
  password: string;
};

type TestFixture = {
  users: Record<string, TestUser>;
  sessions: Record<string, SupabaseClient>;
  shops: { a: string; b: string };
  customers: {
    a: string;
    b: string;
    bInA: string;
    linkMatch: string;
    linkMismatch: string;
    linkNoPhone: string;
    pin: string;
    repayment: string;
  };
  sales: {
    own: string;
    sameShopForeign: string;
    otherShop: string;
    tamper: string;
    qrReplay: string;
  };
};

let admin: SupabaseClient | undefined;
let fixture: TestFixture | undefined;
const createdUserIds: string[] = [];
const createdProfileIds: string[] = [];
const createdShopIds: string[] = [];
const createdCustomerIds: string[] = [];
const createdSaleIds: string[] = [];

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required local red-team variable: ${name}`);
  return value;
}

async function ensureNoError<T>(result: { data: T; error: { message: string } | null }): Promise<T> {
  if (result.error) throw new Error("Local red-team setup/cleanup request failed");
  return result.data;
}

async function createTestUser(
  label: string,
  options: { phone?: string; phoneConfirmed?: boolean } = {},
): Promise<TestUser> {
  if (!admin) throw new Error("Local red-team admin client is unavailable");
  const email = `${label}-${randomBytes(5).toString("hex")}@tapup.test`;
  const password = randomBytes(24).toString("base64url");
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    ...(options.phone ? {
      phone: options.phone,
      phone_confirm: options.phoneConfirmed ?? false,
    } : {}),
  });
  if (error || !data.user) throw new Error("Could not create a synthetic local Auth user");
  const user = { id: data.user.id, email, password };
  createdUserIds.push(user.id);
  return user;
}

async function createProfile(user: TestUser, role: "shop_owner" | "customer"): Promise<void> {
  if (!admin) throw new Error("Local red-team admin client is unavailable");
  await ensureNoError(await admin.from("profiles").insert({
    id: user.id,
    role,
    full_name: `Red Team ${role}`,
  }));
  createdProfileIds.push(user.id);
}

async function createShop(ownerId: string, name: string): Promise<string> {
  if (!admin) throw new Error("Local red-team admin client is unavailable");
  const { data, error } = await admin
    .from("shops")
    .insert({ owner_id: ownerId, name })
    .select("id")
    .single();
  if (error || !data) throw new Error("Could not create synthetic local shop");
  createdShopIds.push(data.id);
  return data.id;
}

async function createShopCustomer(input: {
  shopId: string;
  phone: string;
  profileId?: string | null;
  pin?: boolean;
}): Promise<string> {
  if (!admin) throw new Error("Local red-team admin client is unavailable");
  const { data, error } = await admin
    .from("shop_customers")
    .insert({
      shop_id: input.shopId,
      customer_profile_id: input.profileId ?? null,
      customer_phone: input.phone,
      display_name: "Synthetic red-team customer",
      status: "active",
      consent_at: new Date().toISOString(),
      owner_confirmed_at: input.profileId ? new Date().toISOString() : null,
      pin_hash: input.pin
        ? "$2b$10$c7.9pRKnnHbm4p8iiLoGWO3VeFWfBKxYX8l6phC0.UTyc1QNhtLue"
        : null,
      credit_limit_cents: 10_000,
    })
    .select("id")
    .single();
  if (error || !data) throw new Error("Could not create synthetic local customer");
  createdCustomerIds.push(data.id);
  return data.id;
}

async function createSale(input: {
  shopId: string;
  customerId: string;
  totalCents: number;
  qrTokenHash?: string;
  createdAt?: Date;
  expiresAt?: Date;
}): Promise<string> {
  if (!admin) throw new Error("Local red-team admin client is unavailable");
  const { data, error } = await admin
    .from("sales")
    .insert({
      shop_id: input.shopId,
      shop_customer_id: input.customerId,
      items: [{ productId: "redteam-fixture", name: "Synthetic fixture", unitPriceCents: input.totalCents, qty: 1 }],
      total_cents: input.totalCents,
      ...(input.qrTokenHash ? {
        qr_token_hash: input.qrTokenHash,
        created_at: input.createdAt?.toISOString(),
        expires_at: (input.expiresAt ?? new Date(Date.now() + 4 * 60_000)).toISOString(),
      } : {}),
    })
    .select("id")
    .single();
  if (error || !data) throw new Error("Could not create synthetic local sale");
  createdSaleIds.push(data.id);
  return data.id;
}

async function makeTabRequested(saleId: string, customerId: string, amountCents: number): Promise<void> {
  if (!admin) throw new Error("Local red-team admin client is unavailable");
  await ensureNoError(await admin
    .from("sales")
    .update({
      shop_customer_id: customerId,
      method: "tab",
      tab_cents: amountCents,
      paid_now_cents: 0,
      used_at: new Date().toISOString(),
      status: "tab_requested",
    })
    .eq("id", saleId)
    .select("id")
    .single());
}

async function approveFixtureTab(saleId: string): Promise<{ error: { message: string } | null }> {
  if (!admin) throw new Error("Local red-team admin client is unavailable");
  const approvedAt = new Date();
  const dueAt = new Date(approvedAt.getTime() + 14 * 24 * 60 * 60 * 1000);
  const { error } = await admin
    .from("sales")
    .update({
      status: "approved",
      approved_at: approvedAt.toISOString(),
      due_at: dueAt.toISOString(),
    })
    .eq("id", saleId)
    .eq("status", "tab_requested")
    .select("id")
    .maybeSingle();
  return { error };
}

const localSuite = describe.skipIf(!enabled);

localSuite("local Supabase red-team integration", () => {
  beforeAll(async () => {
    const projectId = requireEnv("TAPUP_REDTEAM_PROJECT_ID");
    const url = requireEnv("TAPUP_REDTEAM_SUPABASE_URL");
    const anonKey = requireEnv("TAPUP_REDTEAM_ANON_KEY");
    const serviceRoleKey = requireEnv("TAPUP_REDTEAM_SERVICE_ROLE_KEY");
    const parsedUrl = new URL(url);

    if (projectId !== PROJECT_ID) throw new Error("Unexpected local red-team project identifier");
    if (parsedUrl.protocol !== "http:"
      || parsedUrl.hostname !== "127.0.0.1"
      || parsedUrl.port !== "54321"
    ) {
      throw new Error("Red-team tests only allow the configured loopback Supabase API URL");
    }

    admin = createClient(url, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const users = {
      ownerA: await createTestUser("owner-a"),
      ownerB: await createTestUser("owner-b"),
      customerA: await createTestUser("customer-a", {
        phone: "+27825550111",
        phoneConfirmed: true,
      }),
      customerB: await createTestUser("customer-b"),
      linkMatch: await createTestUser("link-match", {
        phone: "+27825550201",
        phoneConfirmed: true,
      }),
      linkMismatch: await createTestUser("link-mismatch", {
        phone: "+27825550202",
        phoneConfirmed: true,
      }),
      linkNoPhone: await createTestUser("link-no-phone"),
    };

    await Promise.all([
      createProfile(users.ownerA, "shop_owner"),
      createProfile(users.ownerB, "shop_owner"),
      createProfile(users.customerA, "customer"),
      createProfile(users.customerB, "customer"),
      createProfile(users.linkMatch, "customer"),
      createProfile(users.linkMismatch, "customer"),
      createProfile(users.linkNoPhone, "customer"),
    ]);

    const shops = {
      a: await createShop(users.ownerA.id, `RT Shop A ${randomBytes(3).toString("hex")}`),
      b: await createShop(users.ownerB.id, `RT Shop B ${randomBytes(3).toString("hex")}`),
    };
    const customers = {
      a: await createShopCustomer({
        shopId: shops.a,
        phone: "+27825550301",
        profileId: users.customerA.id,
      }),
      b: await createShopCustomer({
        shopId: shops.b,
        phone: "+27825550302",
        profileId: users.customerB.id,
      }),
      bInA: await createShopCustomer({
        shopId: shops.a,
        phone: "+27825550303",
        profileId: users.customerB.id,
      }),
      linkMatch: await createShopCustomer({ shopId: shops.a, phone: "+27825550201" }),
      linkMismatch: await createShopCustomer({ shopId: shops.a, phone: "+27825550999" }),
      linkNoPhone: await createShopCustomer({ shopId: shops.a, phone: "+27825550309" }),
      pin: await createShopCustomer({
        shopId: shops.a,
        phone: "+27825550310",
        pin: true,
      }),
      repayment: await createShopCustomer({
        shopId: shops.a,
        phone: "+27825550311",
        pin: true,
      }),
    };

    const sessions: Record<string, SupabaseClient> = {};
    for (const [label, user] of Object.entries(users)) {
      const client = createClient(url, anonKey, {
        auth: { autoRefreshToken: false, persistSession: false },
      });
      const { error } = await client.auth.signInWithPassword({
        email: user.email,
        password: user.password,
      });
      if (error) throw new Error("Could not establish synthetic local user session");
      sessions[label] = client;
    }

    const sales = {
      own: await createSale({ shopId: shops.a, customerId: customers.a, totalCents: 1_000 }),
      sameShopForeign: await createSale({
        shopId: shops.a,
        customerId: customers.bInA,
        totalCents: 1_100,
      }),
      otherShop: await createSale({
        shopId: shops.b,
        customerId: customers.b,
        totalCents: 1_200,
      }),
      tamper: await createSale({ shopId: shops.a, customerId: customers.a, totalCents: 1_300 }),
      qrReplay: await createSale({
        shopId: shops.a,
        customerId: customers.a,
        totalCents: 1_400,
        qrTokenHash: randomBytes(32).toString("hex"),
      }),
    };

    fixture = { users, sessions, shops, customers, sales };
  }, 120_000);

  afterAll(async () => {
    if (!admin) return;
    if (createdSaleIds.length > 0) {
      await ensureNoError(await admin.from("repayments").delete().in("sale_id", createdSaleIds));
      await ensureNoError(await admin.from("sales").delete().in("id", createdSaleIds));
    }
    if (createdCustomerIds.length > 0) {
      await ensureNoError(await admin.from("shop_customers").delete().in("id", createdCustomerIds));
    }
    if (createdShopIds.length > 0) {
      await ensureNoError(await admin.from("shops").delete().in("id", createdShopIds));
    }
    if (createdProfileIds.length > 0) {
      await ensureNoError(await admin.from("profiles").delete().in("id", createdProfileIds));
    }
    for (const userId of createdUserIds) {
      const { error } = await admin.auth.admin.deleteUser(userId);
      if (error) throw new Error("Could not clean up a synthetic local Auth user");
    }
  });

  it("enforces cross-shop and cross-customer SELECT isolation with positive controls", async () => {
    if (!fixture) throw new Error("Test fixtures were not initialized");
    const ownerA = fixture.sessions.ownerA;
    const customerA = fixture.sessions.customerA;

    const ownShops = await ownerA.from("shops").select("id");
    const foreignShop = await ownerA.from("shops").select("id").eq("id", fixture.shops.b);
    const customerSales = await customerA.from("sales").select("id");
    const ownCustomer = await customerA
      .from("shop_customers")
      .select("id")
      .eq("id", fixture.customers.a);

    expect(ownShops.error).toBeNull();
    expect(ownShops.data?.map((row) => row.id)).toContain(fixture.shops.a);
    expect(foreignShop.error).toBeNull();
    expect(foreignShop.data).toEqual([]);
    expect(customerSales.error).toBeNull();
    expect(customerSales.data?.map((row) => row.id)).toContain(fixture.sales.own);
    expect(customerSales.data?.map((row) => row.id)).not.toContain(fixture.sales.sameShopForeign);
    expect(customerSales.data?.map((row) => row.id)).not.toContain(fixture.sales.otherShop);
    expect(ownCustomer.data?.map((row) => row.id)).toEqual([fixture.customers.a]);
  });

  it("blocks cross-tenant writes and direct sale mutations without changing database state", async () => {
    if (!fixture || !admin) throw new Error("Test fixtures were not initialized");
    const ownerA = fixture.sessions.ownerA;
    const targetBefore = await admin
      .from("shop_customers")
      .select("display_name")
      .eq("id", fixture.customers.b)
      .single();
    expect(targetBefore.error).toBeNull();

    const foreignCustomerUpdate = await ownerA
      .from("shop_customers")
      .update({ display_name: "Unauthorized changed value" })
      .eq("id", fixture.customers.b)
      .select("id");
    const foreignCustomerInsert = await ownerA
      .from("shop_customers")
      .insert({
        shop_id: fixture.shops.b,
        customer_phone: "+27825550399",
        display_name: "Unauthorized synthetic insert",
      })
      .select("id");
    const foreignShopDelete = await ownerA
      .from("shops")
      .delete()
      .eq("id", fixture.shops.b)
      .select("id");
    const directSaleInsert = await ownerA
      .from("sales")
      .insert({
        shop_id: fixture.shops.a,
        shop_customer_id: fixture.customers.a,
        items: [{ productId: "redteam-denied-insert" }],
        total_cents: 900,
      })
      .select("id");
    const saleDelete = await ownerA
      .from("sales")
      .delete()
      .eq("id", fixture.sales.own)
      .select("id");

    createdCustomerIds.push(...(foreignCustomerInsert.data ?? []).map((row) => row.id));
    createdSaleIds.push(...(directSaleInsert.data ?? []).map((row) => row.id));
    expect(foreignCustomerUpdate.error || foreignCustomerUpdate.data?.length === 0).toBeTruthy();
    expect(foreignCustomerInsert.error || foreignCustomerInsert.data?.length === 0).toBeTruthy();
    expect(foreignShopDelete.error || foreignShopDelete.data?.length === 0).toBeTruthy();
    expect(directSaleInsert.error || directSaleInsert.data?.length === 0).toBeTruthy();
    expect(saleDelete.error || saleDelete.data?.length === 0).toBeTruthy();

    const targetAfter = await admin
      .from("shop_customers")
      .select("display_name")
      .eq("id", fixture.customers.b)
      .single();
    const saleAfter = await admin
      .from("sales")
      .select("id")
      .eq("id", fixture.sales.own)
      .single();
    const shopAfter = await admin
      .from("shops")
      .select("id")
      .eq("id", fixture.shops.b)
      .single();
    const customerInsertAfter = await admin
      .from("shop_customers")
      .select("id")
      .eq("shop_id", fixture.shops.b)
      .eq("customer_phone", "+27825550399");
    const saleInsertAfter = await admin
      .from("sales")
      .select("id, items")
      .eq("shop_id", fixture.shops.a)
      .eq("total_cents", 900);

    expect(targetAfter.data?.display_name).toBe(targetBefore.data?.display_name);
    expect(saleAfter.data?.id).toBe(fixture.sales.own);
    expect(shopAfter.data?.id).toBe(fixture.shops.b);
    expect(customerInsertAfter.data).toEqual([]);
    expect(saleInsertAfter.error).toBeNull();
    expect(saleInsertAfter.data?.some((row) =>
      row.items.some((item: { productId?: string }) => item.productId === "redteam-denied-insert")
    )).toBe(false);
  });

  it("prevents authenticated users changing profile phone and preserves the stored value", async () => {
    if (!fixture || !admin) throw new Error("Test fixtures were not initialized");
    const customerA = fixture.sessions.customerA;
    const before = await admin
      .from("profiles")
      .select("phone")
      .eq("id", fixture.users.customerA.id)
      .single();
    expect(before.error).toBeNull();
    expect(before.data?.phone).toBeNull();

    const attempt = await customerA
      .from("profiles")
      .update({ phone: "+27825550111" })
      .eq("id", fixture.users.customerA.id)
      .select("id");
    expect(attempt.error || attempt.data?.length === 0).toBeTruthy();

    const after = await admin
      .from("profiles")
      .select("phone")
      .eq("id", fixture.users.customerA.id)
      .single();
    expect(after.data?.phone).toBeNull();
  });

  it("links only a consented row matching Supabase Auth's confirmed phone", async () => {
    if (!fixture || !admin) throw new Error("Test fixtures were not initialized");

    const authUser = await admin.auth.admin.getUserById(fixture.users.linkMatch.id);
    const targetCustomer = await admin
      .from("shop_customers")
      .select("customer_phone, customer_profile_id, status")
      .eq("id", fixture.customers.linkMatch)
      .single();
    expect(authUser.data.user?.phone).toBe("27825550201");
    expect(authUser.data.user?.phone_confirmed_at).toBeTruthy();
    expect(targetCustomer.data).toMatchObject({
      customer_phone: "+27825550201",
      customer_profile_id: null,
      status: "active",
    });

    const matching = await fixture.sessions.linkMatch.rpc("link_shop_customer_with_consent", {
      target_shop_customer_id: fixture.customers.linkMatch,
      consent_given: true,
    });
    expect(matching.error).toBeNull();

    const linked = await admin
      .from("shop_customers")
      .select("customer_profile_id, consent_at")
      .eq("id", fixture.customers.linkMatch)
      .single();
    expect(linked.data?.customer_profile_id).toBe(fixture.users.linkMatch.id);
    expect(linked.data?.consent_at).toBeTruthy();

    const mismatch = await fixture.sessions.linkMismatch.rpc("link_shop_customer_with_consent", {
      target_shop_customer_id: fixture.customers.linkMismatch,
      consent_given: true,
    });
    const noPhone = await fixture.sessions.linkNoPhone.rpc("link_shop_customer_with_consent", {
      target_shop_customer_id: fixture.customers.linkNoPhone,
      consent_given: true,
    });
    const noConsent = await fixture.sessions.linkMismatch.rpc("link_shop_customer_with_consent", {
      target_shop_customer_id: fixture.customers.linkMismatch,
      consent_given: false,
    });

    expect(mismatch.error).toBeTruthy();
    expect(noPhone.error).toBeTruthy();
    expect(noConsent.error).toBeTruthy();
    const rejectedRows = await admin
      .from("shop_customers")
      .select("id, customer_profile_id")
      .in("id", [fixture.customers.linkMismatch, fixture.customers.linkNoPhone]);
    expect(rejectedRows.data?.every((row) => row.customer_profile_id === null)).toBe(true);
  });

  it("rejects sale-total tampering and allows at most one concurrent QR state transition", async () => {
    if (!admin || !fixture) throw new Error("Test fixtures were not initialized");
    const before = await admin
      .from("sales")
      .select("total_cents, status")
      .eq("id", fixture.sales.tamper)
      .single();
    expect(before.data?.total_cents).toBe(1_300);

    const tamper = await admin
      .from("sales")
      .update({ total_cents: 99_999 })
      .eq("id", fixture.sales.tamper)
      .select("id");
    expect(tamper.error).toBeTruthy();
    const afterTamper = await admin
      .from("sales")
      .select("total_cents")
      .eq("id", fixture.sales.tamper)
      .single();
    expect(afterTamper.data?.total_cents).toBe(1_300);

    const expiredAt = Date.now() - 10 * 60_000;
    const expiredQrSale = await createSale({
      shopId: fixture.shops.a,
      customerId: fixture.customers.a,
      totalCents: 1_200,
      qrTokenHash: randomBytes(32).toString("hex"),
      createdAt: new Date(expiredAt),
      expiresAt: new Date(expiredAt + 4 * 60_000),
    });
    const expiredRedemption = await admin
      .from("sales")
      .update({
        method: "demo_card",
        status: "paid",
        paid_now_cents: 1_200,
        paid_now_method: "demo_card",
        paid_now_confirmed_at: new Date().toISOString(),
      })
      .eq("id", expiredQrSale)
      .eq("status", "pending")
      .select("id");
    expect(expiredRedemption.error).toBeTruthy();
    const expiredAfter = await admin
      .from("sales")
      .select("status, used_at")
      .eq("id", expiredQrSale)
      .single();
    expect(expiredAfter.data).toMatchObject({ status: "pending", used_at: null });

    const redeem = () => admin!.from("sales")
      .update({
        method: "demo_card",
        status: "paid",
        paid_now_cents: 1_400,
        tab_cents: 0,
        paid_now_method: "demo_card",
        paid_now_confirmed_at: new Date().toISOString(),
        used_at: new Date().toISOString(),
      })
      .eq("id", fixture!.sales.qrReplay)
      .eq("status", "pending")
      .select("id")
      .maybeSingle();
    const redemptions = await Promise.all([redeem(), redeem()]);
    expect(redemptions.filter((result) => !result.error && result.data !== null)).toHaveLength(1);
    const finalSale = await admin
      .from("sales")
      .select("status, method, paid_now_cents, used_at")
      .eq("id", fixture.sales.qrReplay)
      .single();
    expect(finalSale.data).toMatchObject({
      status: "paid",
      method: "demo_card",
      paid_now_cents: 1_400,
    });
    expect(finalSale.data?.used_at).toBeTruthy();
  });

  it("serializes concurrent tab approvals so approved exposure never exceeds the limit", async () => {
    if (!fixture || !admin) throw new Error("Test fixtures were not initialized");
    const saleA = await createSale({
      shopId: fixture.shops.a,
      customerId: fixture.customers.pin,
      totalCents: 8_000,
    });
    const saleB = await createSale({
      shopId: fixture.shops.a,
      customerId: fixture.customers.pin,
      totalCents: 8_000,
    });
    await Promise.all([
      makeTabRequested(saleA, fixture.customers.pin, 8_000),
      makeTabRequested(saleB, fixture.customers.pin, 8_000),
    ]);

    const approvals = await Promise.all([
      approveFixtureTab(saleA),
      approveFixtureTab(saleB),
    ]);
    expect(approvals.filter((result) => result.error === null)).toHaveLength(1);

    const exposure = await admin
      .from("sales")
      .select("id, status, tab_cents")
      .in("id", [saleA, saleB])
      .eq("status", "approved");
    expect(exposure.error).toBeNull();
    const approvedExposure = (exposure.data ?? [])
      .reduce((sum, sale) => sum + sale.tab_cents, 0);
    const credit = await admin
      .from("shop_customers")
      .select("credit_limit_cents")
      .eq("id", fixture.customers.pin)
      .single();
    expect(approvedExposure).toBeLessThanOrEqual(credit.data?.credit_limit_cents ?? 0);
  });

  it("serializes concurrent repayments and uses database-owned repayment timestamps", async () => {
    if (!fixture || !admin) throw new Error("Test fixtures were not initialized");
    const saleId = await createSale({
      shopId: fixture.shops.a,
      customerId: fixture.customers.repayment,
      totalCents: 10_000,
    });
    await makeTabRequested(saleId, fixture.customers.repayment, 10_000);
    const approval = await approveFixtureTab(saleId);
    expect(approval.error).toBeNull();

    const repay = () => admin!.from("repayments")
      .insert({
        sale_id: saleId,
        amount_cents: 7_000,
        paid_at: "2000-01-01T00:00:00.000Z",
        on_time: false,
      })
      .select("id, paid_at, on_time")
      .maybeSingle();
    const attempts = await Promise.all([repay(), repay()]);
    expect(attempts.filter((result) => !result.error && result.data !== null)).toHaveLength(1);

    const firstPayment = await admin
      .from("repayments")
      .select("id, amount_cents, paid_at, on_time")
      .eq("sale_id", saleId)
      .single();
    expect(firstPayment.data?.amount_cents).toBe(7_000);
    expect(Date.parse(firstPayment.data?.paid_at ?? "")).toBeGreaterThan(Date.parse("2000-01-02"));
    expect(firstPayment.data?.on_time).toBe(true);

    const finalPayment = await admin
      .from("repayments")
      .insert({
        sale_id: saleId,
        amount_cents: 3_000,
        paid_at: "2000-01-01T00:00:00.000Z",
        on_time: false,
      })
      .select("id")
      .single();
    expect(finalPayment.error).toBeNull();
    const settled = await admin.from("sales").select("status").eq("id", saleId).single();
    expect(settled.data?.status).toBe("repaid");

    const replay = await admin
      .from("repayments")
      .insert({ sale_id: saleId, amount_cents: 1, on_time: true })
      .select("id")
      .maybeSingle();
    expect(replay.error).toBeTruthy();
    const persisted = await admin
      .from("repayments")
      .select("amount_cents")
      .eq("sale_id", saleId);
    expect(persisted.data?.reduce((sum, row) => sum + row.amount_cents, 0)).toBe(10_000);
  });
});
