// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { CustomerAccountActivity } from "@/components/CustomerAccountActivity";
import type { BuyingPowerHistory } from "@/lib/buyingPower";

afterEach(cleanup);

describe("customer account activity", () => {
  it("shows honest transaction and repayment empty states", () => {
    render(<CustomerAccountActivity history={{ sales: [], repayments: [] }} />);

    expect(screen.getByText("No transactions yet.")).toBeTruthy();
    expect(screen.getByText("No repayments recorded yet.")).toBeTruthy();
    expect(screen.getByLabelText("Tabs owed").textContent).toContain("R0.00");
  });

  it("shows expandable sale details alongside separate repayment history", () => {
    const history: BuyingPowerHistory = {
      sales: [{
        id: "sale-1", createdAt: "2026-10-20T10:00:00.000Z", totalCents: 7_500,
        method: "tab", status: "approved", tabCents: 5_000, paidNowCents: 2_500,
        paidNowMethod: "demo_card", dueAt: "2026-11-03T10:00:00.000Z",
      }],
      repayments: [{ saleId: "sale-1", amountCents: 1_000, paidAt: "2026-10-21T10:00:00.000Z", onTime: true }],
    };
    render(<CustomerAccountActivity history={history} />);

    expect(screen.getByText("Tab approved")).toBeTruthy();
    expect(screen.getByText("Tab portion")).toBeTruthy();
    expect(screen.getByText("On-time repayment")).toBeTruthy();
    expect(screen.queryByText("No repayments recorded yet.")).toBeNull();
  });
});
