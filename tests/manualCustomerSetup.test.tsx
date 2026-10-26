// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import NewCustomerPage from "@/app/shop/customers/new/page";

const { replace, list, confirm } = vi.hoisted(() => ({
  replace: vi.fn(),
  list: vi.fn(),
  confirm: vi.fn(),
}));

vi.mock("next/navigation", () => ({ useRouter: () => ({ replace }) }));
vi.mock("@/components/ShopAccountMenu", () => ({ ShopAccountMenu: () => null }));
vi.mock("@/lib/actions/customers", () => ({
  addCustomer: vi.fn(),
  setCustomerPin: vi.fn(),
  confirmCustomerIdentity: confirm,
  listManualCustomersNeedingSetup: list,
}));

beforeEach(() => {
  vi.clearAllMocks();
  list.mockResolvedValue({
    ok: true,
    customers: [{ shopCustomerId: "shop-customer-1", name: "Demo customer", phone: "+27825550199", pinSet: true }],
  });
  confirm.mockResolvedValue({ ok: true, confirmed: true });
});
afterEach(cleanup);

describe("resumable manual customer setup", () => {
  it("resumes a persisted customer after refresh and completes identity confirmation", async () => {
    render(<NewCustomerPage />);
    fireEvent.click(await screen.findByRole("button", { name: "Resume" }));

    expect(await screen.findByText("PIN saved.")).toBeTruthy();
    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.click(screen.getByRole("button", { name: "Confirm customer identity" }));

    await waitFor(() => expect(confirm).toHaveBeenCalledWith({ shopCustomerId: "shop-customer-1" }));
    expect(replace).toHaveBeenCalledWith("/shop/sell");
  });

  it("keeps the record resumable when identity confirmation fails so the owner can retry", async () => {
    confirm.mockResolvedValueOnce({ ok: false, error: "identity_confirmation_failed" });
    render(<NewCustomerPage />);
    fireEvent.click(await screen.findByRole("button", { name: "Resume" }));
    fireEvent.click(await screen.findByRole("checkbox"));
    fireEvent.click(screen.getByRole("button", { name: "Confirm customer identity" }));

    expect(await screen.findByRole("alert")).toBeTruthy();
    expect(replace).not.toHaveBeenCalled();
    expect(screen.getByText("PIN saved.")).toBeTruthy();
  });
});
