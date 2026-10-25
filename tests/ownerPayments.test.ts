import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PaymentControls, type PendingPayment } from "@/components/OwnerPayments";
import { approveTab, payCash, rejectTab } from "@/lib/actions/sales";

const { state } = vi.hoisted(() => ({ state: {
  signedIn: true, role: "shop_owner", fail: false, race: false, delayCustomer: false,
  sale: {} as Record<string, unknown>,
  rpc: vi.fn(), admin: vi.fn(),
} }));
vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({
  auth: { getUser: async () => ({ data: { user: state.signedIn ? { id: "owner" } : null }, error: null }) },
  from: (table: string) => ({ select: () => ({
    eq: () => table === "profiles" ? { maybeSingle: async () => ({ data: { role: state.role }, error: null }) }
      : { limit: async () => ({ data: [{ id: "shop" }], error: null }) },
  }) }),
}) }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => { state.admin(); return {
  rpc: state.rpc,
  from: (table: string) => {
    const filters: Array<[string, unknown]> = [];
    const after: Array<[string, string]> = [];
    let update: Record<string, unknown> | undefined;
    const query = {
      select: () => query,
      update: (value: Record<string, unknown>) => { update = value; return query; },
      eq: (key: string, value: unknown) => { filters.push([key, value]); return query; },
      is: (key: string, value: unknown) => { filters.push([key, value]); return query; },
      gt: (key: string, value: string) => { after.push([key, value]); return query; },
      maybeSingle: async () => {
        if (state.fail) return { data: null, error: { message: "database failed" } };
        if (table === "shop_customers") {
          if (state.delayCustomer) vi.advanceTimersByTime(2000);
          return { data: {
            id: CUSTOMER, status: "active", consent_at: "2026-10-25T00:00:00Z",
            customer_profile_id: "profile", owner_confirmed_at: "2026-10-25T00:00:00Z",
            pin_hash: null, failed_pin_attempts: 0, locked_until: null, credit_limit_cents: 5000,
          }, error: null };
        }
        if (update && state.race) state.sale = { ...state.sale, shop_customer_id: "other-customer", method: "cash", used_at: "chosen" };
        const matches = filters.every(([key, value]) => state.sale[key] === value)
          && after.every(([key, value]) => typeof state.sale[key] === "string" && Date.parse(state.sale[key] as string) > Date.parse(value));
        if (!matches) return { data: null, error: null };
        if (update) Object.assign(state.sale, update);
        return { data: { ...state.sale }, error: null };
      },
    };
    return query;
  },
}; } }));
const SALE = "00000000-0000-4000-8000-000000000001";
const CUSTOMER = "00000000-0000-4000-8000-000000000002";
beforeEach(() => {
  state.signedIn = true; state.role = "shop_owner"; state.fail = false; state.race = false;
  state.delayCustomer = false;
  state.admin.mockClear();
  state.rpc.mockReset().mockResolvedValue({ data: { ok: true, saleId: SALE, dueAt: "2026-11-08T00:00:00Z", limitCents: 5000 }, error: null });
  state.sale = { id: SALE, shop_id: "shop", shop_customer_id: CUSTOMER, total_cents: 7500,
    method: "tab", status: "tab_requested", paid_now_cents: 2500, tab_cents: 5000,
    paid_now_method: "cash", paid_now_confirmed_at: null, qr_token_hash: null,
    expires_at: null, used_at: "2026-10-25T00:00:00Z" };
});
afterEach(() => vi.useRealTimers());

describe("owner payment actions", () => {
  it("approves through the existing RPC with the authenticated owner and shop", async () => {
    expect((await approveTab({ saleId: SALE, shopCustomerId: CUSTOMER })).ok).toBe(true);
    expect(state.rpc).toHaveBeenCalledWith("approve_tab_atomic", expect.objectContaining({
      target_shop_id: "shop", expected_owner_id: "owner", pin_was_supplied: false, verified_pin_hash: null,
    }));
  });
  it.each(["sale_not_approvable", "customer_consent_required", "sale_expired", "insufficient_buying_power"])("preserves RPC rejection: %s", async (error) => {
    state.rpc.mockResolvedValue({ data: { ok: false, error }, error: null });
    expect(await approveTab({ saleId: SALE, shopCustomerId: CUSTOMER })).toEqual({ ok: false, error });
  });
  it("rejects a tab once through the existing cancellation transition", async () => {
    expect(await rejectTab({ saleId: SALE })).toEqual({ ok: true, saleId: SALE, status: "cancelled" });
    expect(await rejectTab({ saleId: SALE })).toEqual({ ok: false, error: "sale_not_rejectable" });
  });
  it.each(["approved", "paid", "repaid", "pending"])("does not reject a %s sale", async (status) => {
    state.sale.status = status;
    expect((await rejectTab({ saleId: SALE })).ok).toBe(false);
    expect(state.sale.status).toBe(status);
  });
  it("cannot reject or pay another shop's sale", async () => {
    state.sale.shop_id = "foreign-shop";
    expect((await rejectTab({ saleId: SALE })).ok).toBe(false);
    expect((await payCash({ saleId: SALE })).ok).toBe(false);
  });
  it.each([rejectTab, payCash, approveTab])("denies unauthenticated users and customer roles", async (action) => {
    const input = action === approveTab ? { saleId: SALE, shopCustomerId: CUSTOMER } : { saleId: SALE };
    state.signedIn = false;
    expect(await action(input)).toEqual({ ok: false, error: "unauthorized" });
    state.signedIn = true; state.role = "customer";
    expect(await action(input)).toEqual({ ok: false, error: "forbidden" });
    expect(state.admin).not.toHaveBeenCalled();
  });
  it("confirms a cash remainder once without approving the tab", async () => {
    expect(await payCash({ saleId: SALE })).toEqual({ ok: true, saleId: SALE, status: "tab_requested" });
    expect(state.sale.paid_now_confirmed_at).toEqual(expect.any(String));
    expect(state.sale.status).toBe("tab_requested");
    expect((await payCash({ saleId: SALE })).ok).toBe(false);
  });
  it("allows only one concurrent cash receipt or rejection", async () => {
    const cash = await Promise.all([payCash({ saleId: SALE }), payCash({ saleId: SALE })]);
    expect(cash.filter((result) => result.ok)).toHaveLength(1);
    const rejected = await Promise.all([rejectTab({ saleId: SALE }), rejectTab({ saleId: SALE })]);
    expect(rejected.filter((result) => result.ok)).toHaveLength(1);
  });
  it("does not confirm an expired sale", async () => {
    state.sale.expires_at = "2000-01-01T00:00:00Z";
    expect(await payCash({ saleId: SALE })).toEqual({ ok: false, error: "sale_expired" });
    expect(state.sale.paid_now_confirmed_at).toBeNull();
  });
  it.each(["pending", "tab_requested"])("does not confirm %s cash when expiry passes during customer validation", async (status) => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-25T12:00:00Z"));
    state.sale.expires_at = "2026-10-25T12:00:01Z";
    if (status === "pending") Object.assign(state.sale, { status, method: "cash", paid_now_cents: 7500, tab_cents: 0 });
    state.delayCustomer = true;
    expect(await payCash({ saleId: SALE, shopCustomerId: CUSTOMER })).toEqual({ ok: false, error: "cash_confirmation_failed" });
    expect(state.sale.paid_now_confirmed_at).toBeNull();
    expect(state.sale.status).toBe(status);
  });
  it("records a full pending cash payment once", async () => {
    Object.assign(state.sale, { status: "pending", method: "cash", paid_now_cents: 7500, tab_cents: 0 });
    expect(await payCash({ saleId: SALE })).toEqual({ ok: true, saleId: SALE, status: "paid" });
    expect((await payCash({ saleId: SALE })).ok).toBe(false);
  });
  it("does not overwrite a concurrent customer's cash choice", async () => {
    Object.assign(state.sale, { status: "pending", method: "pending", shop_customer_id: null, paid_now_cents: 0, tab_cents: 0, paid_now_method: null, used_at: null });
    state.race = true;
    expect((await payCash({ saleId: SALE })).ok).toBe(false);
    expect(state.sale.shop_customer_id).toBe("other-customer");
  });
  it("returns failures without reporting success", async () => {
    state.fail = true;
    expect(await rejectTab({ saleId: SALE })).toEqual({ ok: false, error: "tab_rejection_failed" });
    expect((await payCash({ saleId: SALE })).ok).toBe(false);
  });
});

describe("owner control rendering", () => {
  const customer = { id: CUSTOMER, display_name: "Demo customer", customer_profile_id: "profile" };
  function markup(busy = false) {
    return renderToStaticMarkup(createElement(PaymentControls, { sale: state.sale as PendingPayment, customer, busy, onAction: vi.fn() }));
  }
  it("requires cash confirmation before enabling tab approval", () => {
    const html = markup();
    expect(html).toContain("Confirm cash received");
    expect(html).toMatch(/disabled=""[^>]*>Approve tab/);
    expect(html).toContain("Reject tab");
    state.sale.paid_now_confirmed_at = "2026-10-25T00:00:00Z";
    expect(markup()).not.toMatch(/disabled=""[^>]*>Approve tab/);
  });
  it("disables all buttons while a submission is pending", () => {
    const html = markup(true);
    expect((html.match(/<button/g) ?? []).length).toBe(3);
    expect((html.match(/disabled=""/g) ?? []).length).toBe(3);
  });
});
