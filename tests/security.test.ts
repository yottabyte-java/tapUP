import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CustomerRow } from "@/components/CustomerRow";
import { GET as lenderGet } from "@/app/api/v1/buying-power/route";
import { addCustomer, getCustomerPayConsentState } from "@/lib/actions/customers";
import { createSale, approveTab } from "@/lib/actions/sales";
import { isLocked, registerFailure, type PinLockoutState } from "@/lib/pin";
import { createSaleToken, verifySaleToken } from "@/lib/qr";
import { createSaleSchema, addCustomerSchema, southAfricanPhoneSchema } from "@/lib/validation";
import { loadBuyingPowerHistory } from "@/lib/lenderData";

const { createAdminClientMock, createSessionClientMock, mockState } = vi.hoisted(() => ({
  createAdminClientMock: vi.fn(),
  createSessionClientMock: vi.fn(),
  mockState: {
    adminQueryMode: "empty" as "empty" | "sale" | "customer_insert" | "tab_history",
    saleOwned: true,
    insertedCustomer: null as Record<string, unknown> | null,
    recordedFilters: [] as Array<{ table: string; column: string; value: unknown }>,
    adminUpdates: 0,
    profileRole: "shop_owner" as "shop_owner" | "customer",
    rpcResult: { ok: false, error: "sale_not_approvable" } as Record<string, unknown>,
    rpcCalls: [] as Array<{ name: string; args: Record<string, unknown> }>,
  },
}));

vi.mock("server-only", () => ({}));

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: createAdminClientMock,
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: createSessionClientMock,
}));

vi.mock("next/headers", () => ({
  headers: async () => new Headers({ "x-real-ip": "203.0.113.55" }),
}));

vi.mock("@/lib/lenderData", () => ({
  LenderConsentRequiredError: class LenderConsentRequiredError extends Error {},
  LenderDataAccessError: class LenderDataAccessError extends Error {},
  loadBuyingPowerHistory: vi.fn(),
}));

const OWNER_ID = "00000000-0000-4000-8000-000000000001";
const OWNER_SHOP_ID = "00000000-0000-4000-8000-000000000002";
const CUSTOMER_ID = "00000000-0000-4000-8000-000000000003";
const SALE_ID = "00000000-0000-4000-8000-000000000004";
const FOREIGN_SALE_ID = "00000000-0000-4000-8000-000000000005";

const tabSaleRow = {
  id: SALE_ID,
  shop_id: OWNER_SHOP_ID,
  shop_customer_id: CUSTOMER_ID,
  total_cents: 10_000,
  method: "tab",
  status: "tab_requested",
  paid_now_cents: 0,
  tab_cents: 10_000,
  paid_now_method: null,
  paid_now_confirmed_at: null,
  qr_token_hash: null,
  expires_at: null,
  used_at: "2026-10-24T19:00:00.000Z",
};

const customerRow = {
  id: CUSTOMER_ID,
  status: "active",
  consent_at: "2026-10-01T12:00:00.000Z",
  customer_profile_id: "00000000-0000-4000-8000-000000000006",
  owner_confirmed_at: "2026-10-01T12:00:00.000Z",
  pin_hash: null,
  failed_pin_attempts: 0,
  locked_until: null,
  credit_limit_cents: 0,
};

function queryResult(table: string, state: {
  columns: string;
  insertValue: Record<string, unknown> | null;
  filters: Array<{ column: string; value: unknown }>;
}) {
  if (state.insertValue && table === "shop_customers") {
    mockState.insertedCustomer = state.insertValue;
    return { id: CUSTOMER_ID };
  }
  if (table === "profiles") return { role: mockState.profileRole };
  if (table === "shops") return [{ id: OWNER_SHOP_ID }];
  if (table === "shop_customers") return customerRow;
  if (table === "sales" && state.columns.includes("qr_token_hash")) {
    return mockState.saleOwned ? tabSaleRow : null;
  }
  if (table === "sales" && state.columns.includes("created_at")) {
    return mockState.adminQueryMode === "tab_history"
      ? [{
        id: SALE_ID,
        created_at: "2026-10-24T19:00:00.000Z",
        total_cents: 10_000,
        method: "tab",
        status: "tab_requested",
        tab_cents: 10_000,
        paid_now_cents: 0,
        paid_now_method: null,
        due_at: null,
      }]
      : [];
  }
  return null;
}

function makeQuery(table: string, client: "session" | "admin") {
  const state: {
    columns: string;
    insertValue: Record<string, unknown> | null;
    filters: Array<{ column: string; value: unknown }>;
  } = { columns: "", insertValue: null, filters: [] };
  const query = {
    select(columns = "") {
      state.columns = columns;
      return query;
    },
    insert(value: Record<string, unknown>) {
      state.insertValue = value;
      mockState.adminQueryMode = "customer_insert";
      return query;
    },
    update() {
      mockState.adminUpdates += 1;
      return query;
    },
    eq(column: string, value: unknown) {
      state.filters.push({ column, value });
      if (client === "admin") mockState.recordedFilters.push({ table, column, value });
      return query;
    },
    is() {
      return query;
    },
    not() {
      return query;
    },
    in() {
      return query;
    },
    order() {
      return query;
    },
    range() {
      return query;
    },
    limit() {
      return Promise.resolve({ data: [{ id: OWNER_SHOP_ID }], error: null });
    },
    maybeSingle() {
      const data = queryResult(table, state);
      if (table === "sales" && state.columns.includes("qr_token_hash") && !mockState.saleOwned) {
        return Promise.resolve({ data: null, error: null });
      }
      return Promise.resolve({ data, error: null });
    },
    single() {
      return Promise.resolve({ data: queryResult(table, state), error: null });
    },
    then(
      onFulfilled: (value: { data: unknown[] | null; error: null }) => unknown,
      onRejected?: (reason: unknown) => unknown,
    ) {
      if (table === "repayments") {
        return Promise.resolve({ data: [], error: null }).then(onFulfilled, onRejected);
      }
      const value = queryResult(table, state);
      const data = Array.isArray(value) ? value : value ? [value] : [];
      return Promise.resolve({ data, error: null }).then(onFulfilled, onRejected);
    },
  };
  return query;
}

function configureClients() {
  const sessionClient = {
    auth: {
      getUser: vi.fn(async () => ({
        data: { user: { id: OWNER_ID } },
        error: null,
      })),
    },
    from: vi.fn((table: string) => makeQuery(table, "session")),
  };
  const adminClient = {
    from: vi.fn((table: string) => makeQuery(table, "admin")),
    rpc: vi.fn(async (name: string, args: Record<string, unknown>) => {
      mockState.rpcCalls.push({ name, args });
      return { data: mockState.rpcResult, error: null };
    }),
  };
  createSessionClientMock.mockResolvedValue(sessionClient);
  createAdminClientMock.mockReturnValue(adminClient);
  return { sessionClient, adminClient };
}

describe("security checks", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockState.adminQueryMode = "empty";
    mockState.saleOwned = true;
    mockState.insertedCustomer = null;
    mockState.recordedFilters = [];
    mockState.adminUpdates = 0;
    mockState.profileRole = "shop_owner";
    mockState.rpcResult = { ok: false, error: "sale_not_approvable" };
    mockState.rpcCalls = [];
    vi.stubEnv("LENDER_API_KEY", "security-test-key");
  });

  it("keeps shop reads scoped to the authenticated owner and customer sales linked by profile and shop", () => {
    const rls = readFileSync(resolve(process.cwd(), "supabase/rls.sql"), "utf8");
    const ownerPolicy = rls.match(/CREATE POLICY shops_select_related[\s\S]*?;/)?.[0] ?? "";
    const customerPolicy = rls.match(/CREATE POLICY shop_customers_select_related[\s\S]*?;/)?.[0] ?? "";
    const salesPolicy = rls.match(/CREATE POLICY sales_select_related[\s\S]*?;/)?.[0] ?? "";

    expect(ownerPolicy).toContain("public.is_shop_owner(id)");
    expect(customerPolicy).toContain("public.is_shop_owner(shop_id)");
    expect(salesPolicy).toContain("public.is_shop_owner(shop_id)");
    expect(salesPolicy).toContain("sc.shop_id = sales.shop_id");
    expect(salesPolicy).toContain("sc.customer_profile_id = (SELECT auth.uid())");
    // WHY: A customer relationship must match both the sale's shop and the current Auth user.
  });

  it("restricts the atomic approval RPC to service_role with a fixed search path and row locks", () => {
    const schema = readFileSync(resolve(process.cwd(), "supabase/schema.sql"), "utf8");
    const approvalFunction = schema.match(/CREATE OR REPLACE FUNCTION public\.approve_tab_atomic\([\s\S]*?\n\$\$;/)?.[0] ?? "";
    expect(approvalFunction).toContain("SECURITY DEFINER");
    expect(approvalFunction).toContain("SET search_path = ''");
    expect(approvalFunction).toContain("FOR UPDATE");
    expect(approvalFunction).toContain("pin_was_supplied");
    expect(schema).toContain("REVOKE ALL ON FUNCTION public.approve_tab_atomic(uuid, uuid, uuid, uuid, text, boolean, boolean)");
    expect(schema).toContain("FROM PUBLIC, anon, authenticated");
    expect(schema).toContain("GRANT EXECUTE ON FUNCTION public.approve_tab_atomic(uuid, uuid, uuid, uuid, text, boolean, boolean)");
    expect(schema).toContain("TO service_role");
  });

  it("migrates lender consent for existing databases without widening access", () => {
    const migration = readFileSync(
      resolve(process.cwd(), "supabase/migrations/202610250003_add_lender_sharing_consent.sql"),
      "utf8",
    );
    expect(migration).toContain("ADD COLUMN IF NOT EXISTS lender_sharing_consent_at timestamptz");
    expect(migration).toContain("SET search_path = ''");
    expect(migration).toContain("sc.customer_profile_id = caller_id");
    expect(migration).toContain("FROM PUBLIC, anon, authenticated");
    expect(migration).toContain("TO authenticated");
    expect(migration).not.toContain("GRANT SELECT ON public.shop_customers TO anon");
  });

  it("keeps Supabase migration version IDs unique", () => {
    const migrationDirectory = resolve(process.cwd(), "supabase/migrations");
    const migrations = readdirSync(migrationDirectory).filter((name) => name.endsWith(".sql"));
    const versions = migrations.map((name) => name.match(/^(\d+)_/)?.[1]);

    expect(versions.every(Boolean)).toBe(true);
    expect(new Set(versions).size).toBe(versions.length);
  });

  it("waits for a request before reading the home-page session", () => {
    const homePage = readFileSync(resolve(process.cwd(), "app/page.tsx"), "utf8");
    const sessionRedirect = homePage.match(/async function RedirectSignedInUser\(\)[\s\S]*?\n\}/)?.[0] ?? "";
    const requestBoundary = sessionRedirect.indexOf("await connection()");
    const sessionClient = sessionRedirect.indexOf("createClient()");

    expect(requestBoundary).toBeGreaterThanOrEqual(0);
    expect(sessionClient).toBeGreaterThan(requestBoundary);
    expect(sessionRedirect).toContain('redirect("/shop/sell")');
    expect(sessionRedirect).toContain('redirect("/me")');
    expect(sessionRedirect).toContain("return null;");
  });

  it("requires a Supabase-confirmed Auth phone for customer linking, not the editable profile phone", async () => {
    configureClients();
    mockState.profileRole = "customer";
    const rls = readFileSync(resolve(process.cwd(), "supabase/rls.sql"), "utf8");
    const linkingFunction = rls.match(/CREATE FUNCTION public\.link_shop_customer_with_consent[\s\S]*?\n\$\$;/)?.[0] ?? "";
    const profilePhoneGrant = rls.match(/GRANT UPDATE \([^)]*\)\s+ON public\.profiles TO authenticated;/)?.[0] ?? "";

    expect(linkingFunction).toContain("FROM auth.users AS u");
    expect(linkingFunction).toContain("u.phone_confirmed_at IS NOT NULL");
    expect(linkingFunction).not.toContain("SELECT p.phone");
    expect(profilePhoneGrant).toContain("full_name");
    expect(profilePhoneGrant).not.toMatch(/\bphone\b/i);
    expect(linkingFunction).toContain("WHEN u.phone ~ '^27[0-9]{9}$' THEN '+' || u.phone");

    const result = await getCustomerPayConsentState("a".repeat(32));
    expect(result).toEqual({ ok: false, error: "invalid_link" });
    expect(createAdminClientMock).toHaveBeenCalledOnce();
  });

  it("normalizes Auth phones with or without the E.164 plus prefix", () => {
    expect(southAfricanPhoneSchema.parse("082 555 0199")).toBe("+27825550199");
    expect(southAfricanPhoneSchema.parse("+27 82 555 0199")).toBe("+27825550199");
    expect(southAfricanPhoneSchema.parse("27825550199")).toBe("+27825550199");
  });

  it("uses the transaction RPC scoped to the authenticated owner's shop", async () => {
    configureClients();
    mockState.rpcResult = { ok: false, error: "sale_or_customer_not_found" };

    const result = await approveTab({
      saleId: FOREIGN_SALE_ID,
      shopCustomerId: CUSTOMER_ID,
    });

    expect(result).toEqual({ ok: false, error: "sale_or_customer_not_found" });
    expect(mockState.rpcCalls).toEqual([{
      name: "approve_tab_atomic",
      args: expect.objectContaining({
        target_sale_id: FOREIGN_SALE_ID,
        target_shop_customer_id: CUSTOMER_ID,
        target_shop_id: OWNER_SHOP_ID,
        expected_owner_id: OWNER_ID,
      }),
    }]);
  });

  it("locks PIN attempts after five failures for fifteen minutes", () => {
    let state: PinLockoutState = { failedAttempts: 0, lockedUntil: null };
    const now = new Date("2026-10-24T20:00:00.000Z");
    for (let attempt = 0; attempt < 5; attempt += 1) {
      state = registerFailure(state, now);
    }

    expect(isLocked(state, now)).toBe(true);
    expect(state.lockedUntil).toBe("2026-10-24T20:15:00.000Z");
  });

  it("rejects QR tokens that have expired or have already been consumed", () => {
    const now = new Date("2026-10-24T20:00:00.000Z");
    const token = createSaleToken(now);

    expect(verifySaleToken(
      token.token,
      token.tokenHash,
      token.expiresAt,
      null,
      new Date(now.getTime() + 5 * 60_000),
    )).toBe("expired");
    expect(verifySaleToken(
      token.token,
      token.tokenHash,
      token.expiresAt,
      new Date(now.getTime() + 1_000),
      now,
    )).toBe("used");
  });

  it("rejects a tab above the buying-power limit before any write", async () => {
    configureClients();
    mockState.rpcResult = { ok: false, error: "insufficient_buying_power" };

    const result = await approveTab({
      saleId: SALE_ID,
      shopCustomerId: CUSTOMER_ID,
    });

    expect(result).toEqual({ ok: false, error: "insufficient_buying_power" });
    expect(mockState.adminUpdates).toBe(0);
    expect(mockState.rpcCalls).toHaveLength(1);
  });

  it("rejects client-supplied sale totals before reaching database access", async () => {
    configureClients();

    const result = await createSale({
      items: [{ productId: "milk", qty: 1 }],
      totalCents: 1,
    });

    expect(result).toEqual({ ok: false, error: "invalid_input" });
    expect(createSessionClientMock).not.toHaveBeenCalled();
    expect(createAdminClientMock).not.toHaveBeenCalled();
    expect(createSaleSchema.safeParse({
      items: [{ productId: "milk", qty: 1 }],
      totalCents: 1,
    }).success).toBe(false);
  });

  it("passes SQL/script-looking customer names as literal values and renders them as text", async () => {
    configureClients();
    const attackText = "<script>alert(1)</script>";
    const result = await addCustomer({
      name: attackText,
      phone: "082 555 0199",
      consent: true,
    });

    expect(result).toMatchObject({ ok: true, name: attackText });
    expect(mockState.insertedCustomer).toMatchObject({ display_name: attackText });
    expect(addCustomerSchema.safeParse({
      name: "'; DROP TABLE sales; --",
      phone: "082 555 0199",
      consent: true,
    }).success).toBe(true);

    const html = renderToStaticMarkup(
      createElement(CustomerRow, {
        customer: {
          id: CUSTOMER_ID,
          displayName: attackText,
          phone: "082 555 0199",
          limitCents: 0,
          owedCents: 0,
          late: false,
          outstandingSales: [],
          repayments: [],
        },
        onSelect: () => undefined,
      }),
    );
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
  });

  it("rejects unexpected input properties in strict sale and customer schemas", () => {
    expect(createSaleSchema.safeParse({
      items: [{ productId: "milk", qty: 1 }],
      shopId: OWNER_SHOP_ID,
    }).success).toBe(false);
    expect(addCustomerSchema.safeParse({
      name: "Demo Customer",
      phone: "082 555 0199",
      consent: true,
      role: "shop_owner",
    }).success).toBe(false);
  });

  it("returns 401 for the lender API without a valid key", async () => {
    const response = await lenderGet(new Request(
      "http://localhost/api/v1/buying-power?shop=00000000-0000-4000-8000-000000000002&customer=00000000-0000-4000-8000-000000000003",
    ));

    expect(response.status).toBe(401);
    expect(loadBuyingPowerHistory).not.toHaveBeenCalled();
  });

  it("returns generic lender errors without stack traces or database details", async () => {
    const LenderDataAccessError = (await import("@/lib/lenderData")).LenderDataAccessError;
    vi.mocked(loadBuyingPowerHistory).mockRejectedValueOnce(
      new LenderDataAccessError("public.sales query failed\nat loadBuyingPowerHistory"),
    );

    const response = await lenderGet(new Request(
      "http://localhost/api/v1/buying-power?shop=00000000-0000-4000-8000-000000000002&customer=00000000-0000-4000-8000-000000000003",
      { headers: { "x-api-key": "security-test-key" } },
    ));
    const body = await response.text();

    expect(response.status).toBe(503);
    expect(body).toBe('{"error":"Buying-power data is temporarily unavailable"}');
    expect(body).not.toMatch(/stack|public\.sales|at loadBuyingPowerHistory/i);
  });
});
