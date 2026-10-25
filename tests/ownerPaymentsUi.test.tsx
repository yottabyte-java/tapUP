// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { OwnerPayments } from "@/components/OwnerPayments";
import { PinPad } from "@/components/PinPad";
import type { PendingPayment } from "@/lib/ownerPayments";

const { loadPage, approve, cash, reject } = vi.hoisted(() => ({
  loadPage: vi.fn(), approve: vi.fn(), cash: vi.fn(), reject: vi.fn(),
}));
vi.mock("@/lib/ownerPayments", async (original) => ({
  ...await original<typeof import("@/lib/ownerPayments")>(), loadOwnerPaymentPage: loadPage,
}));
vi.mock("@/lib/actions/sales", () => ({ approveTab: approve, payCash: cash, rejectTab: reject }));

const sale: PendingPayment = {
  id: "sale", shop_customer_id: "customer", total_cents: 5000, tab_cents: 5000,
  paid_now_cents: 0, paid_now_method: null, paid_now_confirmed_at: null,
  status: "tab_requested", method: "tab", expires_at: null, created_at: "2026-10-25T10:00:00Z",
};
const customer = { id: "customer", display_name: "Newest customer", customer_profile_id: null };
const boundary = { id: "boundary", created_at: sale.created_at };
const first = { sales: [sale], customers: [customer], nextCursor: boundary };
const older = { sales: [{ ...sale, id: "older" }], customers: [{ ...customer, display_name: "Older customer" }], nextCursor: null };
const completed = vi.fn();
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise<T>((done, fail) => { resolve = done; reject = fail; });
  return { promise, resolve, reject };
}
async function enterPin() {
  for (const digit of [1, 2, 3, 4]) fireEvent.click(screen.getByRole("button", { name: `Enter ${digit}` }));
  await waitFor(() => expect(approve).toHaveBeenCalledTimes(1));
}
async function mount() {
  render(<OwnerPayments shopId="shop-a" refreshKey="key" onCompleted={completed} />);
  await screen.findByText(/Newest customer/);
  await waitFor(() => expect((screen.getByRole("button", { name: "Older requests" }) as HTMLButtonElement).disabled).toBe(false));
}

beforeEach(() => {
  vi.clearAllMocks();
  loadPage.mockReset().mockResolvedValue(first);
  approve.mockReset(); cash.mockReset(); reject.mockReset();
});
afterEach(cleanup);

describe("owner payment interactions", () => {
  it.each([
    ["pin_required", /Ask the customer to enter their PIN/],
    ["pin_not_set", /Set up the customer's PIN/],
  ])("gives accurate default keypad instructions for %s", async (error, message) => {
    render(<PinPad onSubmit={async () => ({ ok: false, error: error as string })} />);
    for (const digit of [1, 2, 3, 4]) fireEvent.click(screen.getByRole("button", { name: `Enter ${digit}` }));
    const alert = await screen.findByRole("alert");
    expect(message instanceof RegExp && message.test(alert.textContent ?? "")).toBe(true);
  });

  it("opens older requests and returns to newest, disabling navigation during reads", async () => {
    await mount();
    const pending = deferred<typeof older>();
    loadPage.mockReturnValueOnce(pending.promise).mockResolvedValueOnce(first);
    fireEvent.click(screen.getByRole("button", { name: "Older requests" }));
    expect(loadPage).toHaveBeenLastCalledWith("shop-a", boundary);
    expect((screen.getByRole("button", { name: "Older requests" }) as HTMLButtonElement).disabled).toBe(true);
    await act(async () => pending.resolve(older));
    expect(screen.getByText(/Older customer/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Older requests" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Newest requests" }));
    await screen.findByText(/Newest customer/);
    expect(loadPage).toHaveBeenLastCalledWith("shop-a", null);
  });

  it("retains the current page on a failed older-page read and permits retry", async () => {
    await mount();
    loadPage.mockRejectedValueOnce(new Error("offline"));
    fireEvent.click(screen.getByRole("button", { name: "Older requests" }));
    await screen.findByText("Could not refresh payment requests.");
    expect(screen.getByText(/Newest customer/)).toBeTruthy();
    loadPage.mockResolvedValueOnce(older);
    fireEvent.click(screen.getByRole("button", { name: "Older requests" }));
    await screen.findByText(/Older customer/);
  });

  it.each([
    ["invalid_pin", /That PIN doesn't match/],
    ["pin_locked", /Wait 15 minutes, then refresh/],
    ["pin_rate_limited", /from this device/],
    ["pin_required", /Ask the customer to enter their PIN/],
    ["pin_state_changed", /PIN setup changed/],
    ["pin_state_unavailable", /PIN could not be checked/],
    ["insufficient_buying_power", /no longer has enough buying power/],
  ])("preserves keypad feedback for %s across the parent's busy render", async (error, message) => {
    await mount();
    const pending = deferred<{ ok: false; error: string }>();
    approve.mockReturnValueOnce(pending.promise);
    const key = screen.getByRole("button", { name: "Enter 1" });
    await enterPin();
    expect(screen.getByRole("button", { name: "Enter 1" })).toBe(key);
    expect((key as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(key);
    expect(approve).toHaveBeenCalledTimes(1);
    await act(async () => pending.resolve({ ok: false, error: error as string }));
    await waitFor(() => expect(screen.getAllByRole("alert")).toHaveLength(error === "invalid_pin" ? 1 : 2));
    expect(screen.getAllByRole("alert").every((alert) => message instanceof RegExp && message.test(alert.textContent ?? ""))).toBe(true);
    expect((key as HTMLButtonElement).disabled).toBe(error === "pin_locked");
    expect(completed).not.toHaveBeenCalled();
  });

  it("clears a PIN mismatch as soon as the customer starts editing", async () => {
    await mount();
    approve.mockResolvedValueOnce({ ok: false, error: "invalid_pin" });
    await enterPin();
    await screen.findByRole("alert");
    fireEvent.click(screen.getByRole("button", { name: "Enter 1" }));
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.getByLabelText("1 of 4 PIN digits entered")).toBeTruthy();
    expect(approve).toHaveBeenCalledTimes(1);
  });

  it("retries an incorrect PIN and completes exactly once through the secure action", async () => {
    await mount();
    approve.mockResolvedValueOnce({ ok: false, error: "invalid_pin" }).mockResolvedValueOnce({ ok: true });
    await enterPin();
    await waitFor(() => expect((screen.getByRole("button", { name: "Enter 1" }) as HTMLButtonElement).disabled).toBe(false));
    for (const digit of [4, 3, 2, 1]) fireEvent.click(screen.getByRole("button", { name: `Enter ${digit}` }));
    await screen.findByText("Tab approved.");
    expect(approve).toHaveBeenLastCalledWith({ saleId: "sale", shopCustomerId: "customer", pin: "4321" });
    expect(completed).toHaveBeenCalledExactlyOnceWith("sale");
  });

  it("rejects an older request, refreshes that page, and prevents duplicate submissions", async () => {
    await mount();
    loadPage.mockResolvedValue(older);
    fireEvent.click(screen.getByRole("button", { name: "Older requests" }));
    await screen.findByText(/Older customer/);
    const pending = deferred<{ ok: true }>();
    reject.mockReturnValueOnce(pending.promise);
    const button = screen.getByRole("button", { name: "Reject tab" });
    // WHY: Page text can render before React finishes the loading transition and enables actions.
    await waitFor(() => expect((button as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(button); fireEvent.click(button);
    expect(reject).toHaveBeenCalledExactlyOnceWith({ saleId: "older" });
    await act(async () => pending.resolve({ ok: true }));
    await screen.findByText(/Tab rejected/);
    expect(loadPage).toHaveBeenLastCalledWith("shop-a", boundary);
    expect(completed).toHaveBeenCalledExactlyOnceWith("older");
  });

  it("confirms cash on an older page and enables approval only after its refreshed receipt", async () => {
    await mount();
    const split = { ...sale, id: "older", paid_now_cents: 2500, total_cents: 7500, paid_now_method: "cash" };
    const page = { ...older, sales: [split], customers: [{ ...customer, customer_profile_id: "linked" }] };
    loadPage.mockResolvedValueOnce(page).mockResolvedValueOnce({ ...page, sales: [{ ...split, paid_now_confirmed_at: sale.created_at }] });
    fireEvent.click(screen.getByRole("button", { name: "Older requests" }));
    await screen.findByRole("button", { name: /Confirm cash received/ });
    expect((screen.getByRole("button", { name: "Approve tab" }) as HTMLButtonElement).disabled).toBe(true);
    cash.mockResolvedValueOnce({ ok: true });
    fireEvent.click(screen.getByRole("button", { name: /Confirm cash received/ }));
    await screen.findByText("Cash receipt recorded.");
    expect(cash).toHaveBeenCalledExactlyOnceWith({ saleId: "older" });
    await waitFor(() => expect((screen.getByRole("button", { name: "Approve tab" }) as HTMLButtonElement).disabled).toBe(false));
    expect(loadPage).toHaveBeenLastCalledWith("shop-a", boundary);
    expect(completed).not.toHaveBeenCalled();
  });

  it("ignores a stale response after the active shop changes", async () => {
    const pending = deferred<typeof first>();
    loadPage.mockReturnValueOnce(pending.promise).mockResolvedValueOnce(older);
    const view = render(<OwnerPayments shopId="shop-a" refreshKey="key" onCompleted={completed} />);
    view.rerender(<OwnerPayments shopId="shop-b" refreshKey="key" onCompleted={completed} />);
    await act(async () => pending.resolve(first));
    await screen.findByText(/Older customer/);
    expect(screen.queryByText(/Newest customer/)).toBeNull();
    expect(loadPage).toHaveBeenLastCalledWith("shop-b", null);
  });

  it.each(["success", "failure"])("discards a late action %s and clears old requests when the active shop changes", async (outcome) => {
    const view = render(<OwnerPayments shopId="shop-a" refreshKey="key" onCompleted={completed} />);
    await screen.findByText(/Newest customer/);
    await waitFor(() => expect((screen.getByRole("button", { name: "Reject tab" }) as HTMLButtonElement).disabled).toBe(false));
    const action = deferred<{ ok: true }>();
    reject.mockReturnValueOnce(action.promise);
    fireEvent.click(screen.getByRole("button", { name: "Reject tab" }));
    const read = deferred<typeof older>();
    loadPage.mockReturnValueOnce(read.promise);
    view.rerender(<OwnerPayments shopId="shop-b" refreshKey="key" onCompleted={completed} />);
    expect(screen.queryByText(/Newest customer/)).toBeNull();
    await act(async () => {
      if (outcome === "failure") action.reject(new Error("offline"));
      else action.resolve({ ok: true });
    });
    expect(loadPage).toHaveBeenCalledTimes(2);
    expect(completed).not.toHaveBeenCalled();
    expect(screen.queryByRole("alert")).toBeNull();
    await act(async () => read.resolve(older));
    expect(screen.getByText(/Older customer/)).toBeTruthy();
    expect(screen.queryByText(/Newest customer/)).toBeNull();
  });
});
