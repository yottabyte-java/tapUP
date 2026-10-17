import { describe, expect, it } from "vitest";
import { formatRand, subCents, toCents } from "@/lib/money";

describe("money helpers", () => {
  it("converts decimal rand strings to integer cents", () => {
    expect(toCents("34.90")).toBe(3_490);
  });

  it("converts floating-point input through its decimal representation", () => {
    expect(toCents(0.1 + 0.2)).toBe(30);
  });

  it("formats cents with a rand prefix and thousands separators", () => {
    expect(formatRand(124_850)).toBe("R1,248.50");
  });

  it("rejects a subtraction that would create a negative money amount", () => {
    expect(() => subCents(10, 11)).toThrow(RangeError);
  });
});
