import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { loadOwnerPaymentPage, ownerPaymentError } from "@/lib/ownerPayments";

const { fetchPage } = vi.hoisted(() => ({ fetchPage: vi.fn() }));
vi.mock("@/lib/supabase/client", async () => {
  const { createClient } = await import("@supabase/supabase-js");
  return { createClient: () => createClient("http://127.0.0.1:54321", "test-only", {
    global: { fetch: fetchPage }, auth: { persistSession: false, autoRefreshToken: false },
  }) };
});

const timestamp = "2026-10-25T10:00:00.123456+00:00";
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const rows = Array.from({ length: 205 }, (_, index) => ({
  id: id(205 - index), created_at: timestamp, shop_customer_id: null,
  status: "tab_requested", expires_at: null,
}));
const respond = (data: unknown, status = 200) => new Response(JSON.stringify(data), {
  status, headers: { "Content-Type": "application/json" },
});
const query = (call: number) => new URL(fetchPage.mock.calls[call][0] as string).searchParams;

beforeEach(() => {
  fetchPage.mockReset();
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-25T12:00:00Z"));
});
afterEach(() => vi.useRealTimers());

describe("owner request pagination query contract", () => {
  it("reaches requests beyond 100 with a strict timestamp/ID cursor even when timestamps tie", async () => {
    fetchPage.mockResolvedValueOnce(respond(rows.slice(0, 101)))
      .mockResolvedValueOnce(respond(rows.slice(100, 201)))
      .mockResolvedValueOnce(respond(rows.slice(200)));
    const first = await loadOwnerPaymentPage("shop-a");
    const second = await loadOwnerPaymentPage("shop-a", first.nextCursor);
    const third = await loadOwnerPaymentPage("shop-a", second.nextCursor);
    expect(first.sales).toHaveLength(100);
    expect(second.sales).toHaveLength(100);
    expect(third.sales).toHaveLength(5);
    expect(third.nextCursor).toBeNull();
    expect([...first.sales, ...second.sales, ...third.sales].map((sale) => sale.id)).toEqual(rows.map((sale) => sale.id));
    // A cursor depends only on the boundary row, not on counts/offsets that shift
    // when earlier rows are completed or new requests arrive.
    for (const [call, boundary] of [[1, 106], [2, 6]]) {
      expect(query(call).get("or")).toBe(`(and(or(expires_at.is.null,expires_at.gt.now),or(created_at.lt.${timestamp},and(created_at.eq.${timestamp},id.lt.${id(boundary)}))))`);
      expect(query(call).has("offset")).toBe(false);
    }
    for (let call = 0; call < 3; call++) {
      expect(query(call).get("shop_id")).toBe("eq.shop-a");
      expect(query(call).get("status")).toBe("in.(pending,tab_requested)");
      expect(query(call).get("order")).toBe("created_at.desc,id.desc");
      expect(query(call).get("limit")).toBe("101");
      expect(query(call).get("select")).not.toMatch(/pin|qr_token/);
    }
  });

  it("keeps the expiry filter on the newest page and handles an empty queue", async () => {
    fetchPage.mockResolvedValueOnce(respond([]));
    expect(await loadOwnerPaymentPage("shop-a")).toEqual({ sales: [], customers: [], nextCursor: null });
    expect(query(0).get("or")).toBe("(and(or(expires_at.is.null,expires_at.gt.now)))");
    expect(fetchPage).toHaveBeenCalledTimes(1);
  });

  it("uses server time for expiry regardless of an owner's device clock", async () => {
    fetchPage.mockResolvedValueOnce(respond([])).mockResolvedValueOnce(respond([]));
    vi.setSystemTime(new Date("2000-01-01T00:00:00Z"));
    await loadOwnerPaymentPage("shop-a");
    vi.setSystemTime(new Date("2099-01-01T00:00:00Z"));
    await loadOwnerPaymentPage("shop-a");
    expect(query(0).get("or")).toBe(query(1).get("or"));
    expect(query(0).get("or")).toContain("expires_at.gt.now");
  });

  it("reads only the page's customer labels in the same shop using the session client", async () => {
    const customer = { id: id(900), display_name: "Customer", customer_profile_id: null };
    fetchPage.mockResolvedValueOnce(respond([
      { ...rows[0], shop_customer_id: customer.id }, { ...rows[1], shop_customer_id: customer.id },
    ])).mockResolvedValueOnce(respond([customer]));
    expect((await loadOwnerPaymentPage("shop-b")).customers).toEqual([customer]);
    expect(query(0).get("shop_id")).toBe("eq.shop-b");
    expect(query(1).get("shop_id")).toBe("eq.shop-b");
    expect(query(1).get("id")).toBe(`in.(${customer.id})`);
    expect(query(1).get("select")).toBe("id,display_name,customer_profile_id");
  });

  it("fails closed on denied sales or customer reads", async () => {
    fetchPage.mockResolvedValueOnce(respond({ message: "denied" }, 403));
    await expect(loadOwnerPaymentPage("foreign-shop")).rejects.toThrow("requests_unavailable");
    expect(fetchPage).toHaveBeenCalledTimes(1);
    fetchPage.mockResolvedValueOnce(respond([{ ...rows[0], shop_customer_id: id(900) }]))
      .mockResolvedValueOnce(respond({ message: "denied" }, 403));
    await expect(loadOwnerPaymentPage("shop-a")).rejects.toThrow("requests_unavailable");
  });
});

describe("owner recovery instructions", () => {
  it.each(["invalid_pin", "pin_locked", "pin_rate_limited", "pin_required", "pin_not_set", "pin_state_changed", "pin_state_unavailable"])("explains %s instead of falling back to generic refresh advice", (error) => {
    expect(ownerPaymentError(error)).not.toBe(ownerPaymentError("unknown"));
  });
  it("requires waiting before refreshing a locked keypad, and retries mismatched PINs", () => {
    expect(ownerPaymentError("pin_locked")).toMatch(/Wait 15 minutes, then refresh/);
    expect(ownerPaymentError("invalid_pin")).toMatch(/enter it again/);
    expect(ownerPaymentError("invalid_pin")).not.toMatch(/refresh/i);
    expect(ownerPaymentError("pin_rate_limited")).toMatch(/device.*Wait 15 minutes/);
    expect(ownerPaymentError("customer_not_owner_confirmed")).toMatch(/Refresh this page/);
  });
});
