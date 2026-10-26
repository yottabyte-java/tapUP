import { describe, expect, it } from "vitest";
import { calculateTodayTakings } from "@/lib/ledger";

const today = "2026-10-25T10:00:00Z";
const yesterday = "2026-10-24T10:00:00Z";
const now = new Date(today);
const sale = (receipt: string | null, status = "repaid") => ({
  paid_now_cents: 2500, paid_now_confirmed_at: receipt, status, total_cents: 7500,
});
const repayment = (amount: number, at = today) => ({ amount_cents: amount, paid_at: at });

describe("daily takings from persisted receipts", () => {
  it("counts R25 upfront and R50 settlement today as R75", () => {
    expect(calculateTodayTakings([sale(today)], [repayment(5000)], now)).toBe(7500);
  });
  it("counts only today's repayment when the upfront receipt was yesterday", () => {
    expect(calculateTodayTakings([sale(yesterday)], [repayment(5000)], now)).toBe(5000);
  });
  it("counts partial repayments once on their own receipt dates", () => {
    expect(calculateTodayTakings([sale(today, "approved")], [repayment(1000, yesterday), repayment(2000)], now)).toBe(4500);
  });
  it("does not count a prior-day repayment again when a tab becomes fully repaid", () => {
    expect(calculateTodayTakings([sale(yesterday)], [repayment(2000, yesterday), repayment(3000)], now)).toBe(3000);
  });
  it("does not count unconfirmed or failed payments", () => {
    expect(calculateTodayTakings([sale(null, "pending"), sale(null, "cancelled")], [], now)).toBe(0);
  });
  it("retains confirmed receipts when a request is later rejected (no refund model exists)", () => {
    expect(calculateTodayTakings([sale(today, "cancelled")], [], now)).toBe(2500);
  });
  it("uses the Johannesburg receipt day across the UTC midnight boundary", () => {
    expect(calculateTodayTakings([sale("2026-10-24T22:30:00Z")], [repayment(100, "2026-10-25T22:01:00Z")], now)).toBe(2500);
  });
});
