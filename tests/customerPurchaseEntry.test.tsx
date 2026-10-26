// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CustomerPurchaseEntry } from "@/components/CustomerPurchaseEntry";

const { push } = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));
vi.mock("@/components/BarcodeScanner", () => ({
  BarcodeScanner: ({ onScan, onBack, onManualAdd }: {
    onScan: (value: string) => void;
    onBack: () => void;
    onManualAdd: () => void;
  }) => (
    <div>
      <button onClick={() => onScan(`${window.location.origin}/pay/0123456789abcdef0123456789abcdef`)} type="button">Mock QR scan</button>
      <button onClick={onManualAdd} type="button">Mock manual fallback</button>
      <button onClick={onBack} type="button">Mock back</button>
    </div>
  ),
}));

beforeEach(() => vi.clearAllMocks());
afterEach(cleanup);

describe("customer purchase entry", () => {
  it("opens a pasted payment URL only when it belongs to this app", () => {
    render(<CustomerPurchaseEntry />);
    fireEvent.change(screen.getByLabelText(/paste a payment link/i), {
      target: { value: `${window.location.origin}/pay/0123456789abcdef0123456789abcdef` },
    });
    fireEvent.click(screen.getByRole("button", { name: "Open payment" }));

    expect(push).toHaveBeenCalledWith("/pay/0123456789abcdef0123456789abcdef");
  });

  it("rejects an external URL instead of navigating outside the app", () => {
    render(<CustomerPurchaseEntry />);
    fireEvent.change(screen.getByLabelText(/paste a payment link/i), {
      target: { value: "https://attacker.example/pay/0123456789abcdef0123456789abcdef" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Open payment" }));

    expect(screen.getByRole("alert").textContent).toContain("valid tapUP payment link");
    expect(push).not.toHaveBeenCalled();
  });

  it("offers camera scanning and keeps the manual fallback available", () => {
    render(<CustomerPurchaseEntry />);
    fireEvent.click(screen.getByRole("button", { name: "Open QR scanner" }));
    fireEvent.click(screen.getByRole("button", { name: "Mock QR scan" }));

    expect(push).toHaveBeenCalledWith("/pay/0123456789abcdef0123456789abcdef");
  });
});
