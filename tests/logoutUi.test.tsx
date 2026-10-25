// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CustomerAccountHeader } from "@/components/CustomerAccountHeader";
import { ShopAccountMenu } from "@/components/ShopAccountMenu";

const { signOut, replace, refresh } = vi.hoisted(() => ({
  signOut: vi.fn(),
  replace: vi.fn(),
  refresh: vi.fn(),
}));

vi.mock("@/lib/actions/auth", () => ({ signOut }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace, refresh }) }));

beforeEach(() => {
  vi.clearAllMocks();
  signOut.mockResolvedValue({ ok: true });
});
afterEach(cleanup);

describe("authenticated logout navigation", () => {
  it("shows customers a visible logout action and returns them to login", async () => {
    render(<CustomerAccountHeader description="A separate record for each shop" />);

    fireEvent.click(screen.getByRole("button", { name: "Log out" }));
    await waitFor(() => expect(signOut).toHaveBeenCalledOnce());
    expect(replace).toHaveBeenCalledWith("/login");
    expect(refresh).toHaveBeenCalledOnce();
  });

  it("opens the shop-owner account menu with a working shop-home link and logout", async () => {
    render(<ShopAccountMenu />);

    const menu = screen.getByText("Shop home").closest("details");
    expect(menu?.open).toBe(false);
    fireEvent.click(menu?.querySelector("summary") as HTMLElement);
    expect(menu?.open).toBe(true);
    expect(screen.getByRole("link", { name: "Shop home" }).getAttribute("href")).toBe("/shop/sell");
    fireEvent.click(screen.getByRole("button", { name: "Log out" }));

    await waitFor(() => expect(signOut).toHaveBeenCalledOnce());
    expect(replace).toHaveBeenCalledWith("/login");
    expect(refresh).toHaveBeenCalledOnce();
  });

  it("shows a safe error and stays put when session sign-out fails", async () => {
    signOut.mockResolvedValueOnce({ ok: false });
    render(<CustomerAccountHeader />);

    fireEvent.click(screen.getByRole("button", { name: "Log out" }));
    expect((await screen.findByRole("alert")).textContent).toMatch(/Could not log out/);
    expect(replace).not.toHaveBeenCalled();
  });
});
