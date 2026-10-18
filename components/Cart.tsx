"use client";

import Image from "next/image";
import { useState } from "react";
import { addCents, formatRand } from "@/lib/money";
import { products, type Product } from "@/lib/products";

export type SaleItemInput = {
  productId: string;
  qty: number;
};

type CartLine = {
  product: Product;
  qty: number;
};

type CartProps = {
  initialItems?: Product[];
  onCharge: (items: SaleItemInput[]) => void | Promise<void>;
};

const DESIGN_SAMPLE_PRODUCTS = products.slice(0, 3);

function ProductImage({ product }: { product: Product }) {
  const [imageFailed, setImageFailed] = useState(false);

  return (
    <div className="relative flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-white/10 bg-[#E9F3EC]">
      <span aria-hidden="true" className="text-xl font-bold text-[#138B73]">
        {product.name.slice(0, 1)}
      </span>
      {!imageFailed && (
        <Image
          alt=""
          className="absolute inset-0 h-full w-full object-contain"
          height={96}
          onError={() => setImageFailed(true)}
          src={product.imagePath}
          unoptimized
          width={96}
        />
      )}
    </div>
  );
}

export function Cart({
  initialItems = DESIGN_SAMPLE_PRODUCTS,
  onCharge,
}: CartProps) {
  const [lines, setLines] = useState<CartLine[]>(() =>
    initialItems.map((product) => ({ product, qty: 1 })),
  );
  const [isCharging, setIsCharging] = useState(false);
  const [chargeError, setChargeError] = useState("");

  const totalCents = lines.reduce(
    (total, line) => addCents(total, line.product.priceCents * line.qty),
    0,
  );

  function updateQuantity(productId: string, change: -1 | 1) {
    setLines((currentLines) =>
      currentLines.map((line) =>
        line.product.id === productId
          ? { ...line, qty: Math.min(99, Math.max(1, line.qty + change)) }
          : line,
      ),
    );
  }

  function removeProduct(productId: string) {
    setLines((currentLines) =>
      currentLines.filter((line) => line.product.id !== productId),
    );
  }

  async function handleCharge() {
    if (isCharging || lines.length === 0) return;

    setIsCharging(true);
    setChargeError("");
    try {
      // WHY: Prices come from the trusted catalogue on the server; only product IDs and quantities cross the action boundary.
      await onCharge(lines.map(({ product, qty }) => ({ productId: product.id, qty })));
    } catch {
      setChargeError("We couldn't start this sale. Please try again.");
    } finally {
      setIsCharging(false);
    }
  }

  return (
    <section aria-labelledby="cart-title" className="flex flex-col gap-3">
      <h2 className="sr-only" id="cart-title">New sale</h2>

      {lines.length === 0 ? (
        <p className="rounded-xl border border-white/10 bg-card px-4 py-6 text-center text-sm text-foreground/70">
          Your cart is empty. Add an item to start a sale.
        </p>
      ) : (
        <ul aria-label="Items in cart" className="flex flex-col gap-2">
          {lines.map(({ product, qty }) => (
            <li
              className="flex min-h-24 items-center gap-2 rounded-xl border border-white/5 bg-card px-2.5 py-2"
              key={product.id}
            >
              <ProductImage product={product} />

              <div className="min-w-0 flex-1 self-center">
                <p className="truncate text-xs font-medium text-foreground">
                  {product.name}
                </p>
                <p className="mt-0.5 text-xs font-semibold text-foreground">
                  {formatRand(product.priceCents)}
                </p>
                <div aria-label={`${product.name} quantity`} className="mt-1 flex items-center gap-1">
                  <button
                    aria-label={`Decrease ${product.name} quantity`}
                    className="flex h-11 w-11 items-center justify-center rounded-md bg-[#10313A] text-sm text-foreground hover:bg-[#17434A] focus-visible:outline-2 focus-visible:outline-teal disabled:opacity-40"
                    disabled={qty <= 1 || isCharging}
                    onClick={() => updateQuantity(product.id, -1)}
                    type="button"
                  >
                    −
                  </button>
                  <span aria-live="polite" className="min-w-5 text-center text-xs font-medium">
                    {qty}
                  </span>
                  <button
                    aria-label={`Increase ${product.name} quantity`}
                    className="flex h-11 w-11 items-center justify-center rounded-md bg-[#10313A] text-sm text-foreground hover:bg-[#17434A] focus-visible:outline-2 focus-visible:outline-teal disabled:opacity-40"
                    disabled={qty >= 99 || isCharging}
                    onClick={() => updateQuantity(product.id, 1)}
                    type="button"
                  >
                    +
                  </button>
                </div>
              </div>

              <button
                aria-label={`Remove ${product.name}`}
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-foreground/70 transition-colors hover:bg-white/5 hover:text-amber focus-visible:outline-2 focus-visible:outline-teal disabled:opacity-40"
                disabled={isCharging}
                onClick={() => removeProduct(product.id)}
                type="button"
              >
                <svg aria-hidden="true" className="h-4 w-4" viewBox="0 0 24 24" fill="none">
                  <path d="M4 7h16m-10 4v6m4-6v6M6 7l1 14h10l1-14M9 7V4h6v3" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.6" />
                </svg>
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-1 flex min-h-14 items-center justify-between rounded-xl border border-white/5 bg-card px-3.5">
        <span className="text-sm font-semibold">Total</span>
        <output aria-live="polite" className="text-sm font-semibold">
          {formatRand(totalCents)}
        </output>
      </div>

      {chargeError && (
        <p className="text-sm text-red-200" role="alert">{chargeError}</p>
      )}

      <button
        className="flex min-h-12 w-full items-center justify-center gap-2 rounded-full bg-gradient-to-r from-[#00CEA8] to-[#00BFA5] px-5 py-3 text-sm font-semibold text-[#041A1E] shadow-[0_0_22px_rgba(0,206,168,0.18)] transition hover:brightness-110 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal disabled:cursor-not-allowed disabled:opacity-60"
        disabled={lines.length === 0 || isCharging}
        onClick={handleCharge}
        type="button"
      >
        {isCharging ? "Starting sale…" : "Charge customer"}
        {!isCharging && (
          <svg aria-hidden="true" className="h-4 w-4" viewBox="0 0 24 24" fill="none">
            <path d="m9 18 6-6-6-6" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" />
          </svg>
        )}
      </button>
    </section>
  );
}
