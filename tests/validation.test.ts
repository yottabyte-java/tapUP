import { describe, expect, it } from "vitest";
import { createSaleSchema } from "@/lib/validation";

describe("sale request validation", () => {
  it("rejects extra fields on a sale and its items", () => {
    expect(() => createSaleSchema.parse({
      items: [{
        productId: "milk",
        qty: 2,
        unexpected: true,
      }],
    })).toThrow();
  });

  it("rejects client-supplied totals so the server can recompute them", () => {
    // WHY: Totals must come from trusted catalogue prices, not amounts a client can alter.
    expect(() => createSaleSchema.parse({
      items: [{ productId: "milk", qty: 2 }],
      totalCents: 1,
    })).toThrow();
  });
});
