"use client";

import Link from "next/link";
import { QRCodeSVG } from "qrcode.react";
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { BarcodeScanner } from "@/components/BarcodeScanner";
import { Cart, type CartLine, type SaleItemInput } from "@/components/Cart";
import { OwnerPayments } from "@/components/OwnerPayments";
import { ShopAccountMenu } from "@/components/ShopAccountMenu";
import { PinPad } from "@/components/PinPad";
import { confirmCustomerIdentity } from "@/lib/actions/customers";
import { approveTab, createSale } from "@/lib/actions/sales";
import { formatRand } from "@/lib/money";
import { getProductByBarcode, products, type Product } from "@/lib/products";
import { createClient } from "@/lib/supabase/client";

type PageStatus = "checking" | "ready" | "error";

type ActiveSale = {
  saleId: string;
  paymentUrl: string;
  totalCents: number;
  expiresAt: string;
};

type PhoneCustomer = {
  id: string;
  displayName: string;
  phone: string;
};

function getSaleErrorMessage(error: string): string {
  switch (error) {
    case "unauthorized":
      return "Your session has expired. Sign in again to start a sale.";
    case "shop_not_found":
      return "We couldn't find a shop for this account.";
    case "unknown_product":
    case "invalid_input":
      return "One of these items is no longer available. Refresh the page and try again.";
    default:
      return "We couldn't create the sale. Please check your connection and try again.";
  }
}

function formatRemainingTime(milliseconds: number): string {
  const totalSeconds = Math.max(0, Math.floor(milliseconds / 1000));
  const minutes = Math.floor(totalSeconds / 60).toString().padStart(2, "0");
  const seconds = (totalSeconds % 60).toString().padStart(2, "0");
  return `${minutes}:${seconds}`;
}

function ProductIcon({ product }: { product: Product }) {
  return (
    <span
      aria-hidden="true"
      className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[#163A3E] text-sm font-bold text-teal"
    >
      {product.name.slice(0, 1)}
    </span>
  );
}

function BottomNavigation() {
  const [moreOpen, setMoreOpen] = useState(false);

  return (
    <nav aria-label="Shop navigation" className="sticky bottom-0 z-10 -mx-3 mt-4 border-t border-white/10 bg-bg/95 px-2 pb-2 pt-1 backdrop-blur">
      <ul className="grid grid-cols-4">
        <li>
          <Link aria-current="page" className="flex min-h-14 flex-col items-center justify-center gap-1 text-teal" href="/shop/sell">
            <svg aria-hidden="true" className="h-5 w-5" viewBox="0 0 24 24" fill="none">
              <path d="m3 11 9-8 9 8v9a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z" fill="currentColor" />
            </svg>
            <span className="text-[10px] font-medium">Home</span>
          </Link>
        </li>
        <li>
          <Link className="flex min-h-14 flex-col items-center justify-center gap-1 text-foreground/65 hover:text-teal" href="/shop/ledger">
            <svg aria-hidden="true" className="h-5 w-5" viewBox="0 0 24 24" fill="none">
              <path d="M5 4h14v17H5zM8 8h8m-8 4h8m-8 4h5" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.6" />
            </svg>
            <span className="text-[10px] font-medium">Sales</span>
          </Link>
        </li>
        <li>
          <Link className="flex min-h-14 flex-col items-center justify-center gap-1 text-foreground/65 hover:text-teal" href="/shop/customers/new">
            <svg aria-hidden="true" className="h-5 w-5" viewBox="0 0 24 24" fill="none">
              <circle cx="9" cy="8" r="3" stroke="currentColor" strokeWidth="1.6" />
              <path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6m3-9v6m-3-3h6" stroke="currentColor" strokeLinecap="round" strokeWidth="1.6" />
            </svg>
            <span className="text-[10px] font-medium">Customers</span>
          </Link>
        </li>
        <li className="relative">
          <button
            aria-expanded={moreOpen}
            aria-haspopup="true"
            className="flex min-h-14 w-full flex-col items-center justify-center gap-1 text-foreground/65 hover:text-teal focus-visible:outline-2 focus-visible:outline-teal"
            onClick={() => setMoreOpen((open) => !open)}
            type="button"
          >
            <svg aria-hidden="true" className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor">
              <circle cx="5" cy="12" r="1.7" /><circle cx="12" cy="12" r="1.7" /><circle cx="19" cy="12" r="1.7" />
            </svg>
            <span className="text-[10px] font-medium">More</span>
          </button>
          {moreOpen && (
            <div className="absolute bottom-full right-0 mb-2 w-40 rounded-xl border border-white/10 bg-card p-2 shadow-xl">
              <Link className="flex min-h-11 items-center rounded-lg px-3 text-sm hover:bg-white/5" href="/shop/ledger">
                Open ledger
              </Link>
              <Link className="flex min-h-11 items-center rounded-lg px-3 text-sm hover:bg-white/5" href="/shop/customers/new">
                Add customer
              </Link>
            </div>
          )}
        </li>
      </ul>
    </nav>
  );
}

export default function ShopSellPage() {
  const router = useRouter();
  const [status, setStatus] = useState<PageStatus>("checking");
  const [shopId, setShopId] = useState("");
  const [shopName, setShopName] = useState("");
  const [pageError, setPageError] = useState("");
  const [scannerOpen, setScannerOpen] = useState(false);
  const [cartItems, setCartItems] = useState<CartLine[]>([]);
  const [activeSale, setActiveSale] = useState<ActiveSale | null>(null);
  const [now, setNow] = useState(0);
  const [phoneCustomers, setPhoneCustomers] = useState<PhoneCustomer[]>([]);
  const [customersToConfirm, setCustomersToConfirm] = useState<PhoneCustomer[]>([]);
  const [pinApprovalOpen, setPinApprovalOpen] = useState(false);
  const [selectedPhoneCustomerId, setSelectedPhoneCustomerId] = useState("");

  useEffect(() => {
    let disposed = false;

    async function loadShop() {
      try {
        const supabase = createClient();
        const { data: { user }, error: authError } = await supabase.auth.getUser();
        if (authError && authError.name !== "AuthSessionMissingError") throw authError;
        if (!user) {
          router.replace("/login");
          return;
        }

        const { data: profile, error: profileError } = await supabase
          .from("profiles")
          .select("role")
          .eq("id", user.id)
          .single();
        if (profileError) throw profileError;
        if (profile.role === "customer") {
          router.replace("/me");
          return;
        }
        if (profile.role !== "shop_owner") {
          throw new Error("This account does not have a shop-owner role.");
        }

        const { data: shop, error: shopError } = await supabase
          .from("shops")
          .select("id, name")
          .eq("owner_id", user.id)
          .maybeSingle();
        if (shopError) throw shopError;
        if (!shop?.name) {
          throw new Error("No shop is linked to this owner account.");
        }

        const { data: customers, error: customersError } = await supabase
          .from("shop_customers")
          .select("id, display_name, customer_phone, customer_profile_id, status, consent_at")
          .eq("shop_id", shop.id)
          .eq("status", "active")
          .is("customer_profile_id", null)
          .not("consent_at", "is", null)
          .order("display_name");
        if (customersError) throw customersError;

        const { data: unconfirmedCustomers, error: confirmationError } = await supabase
          .from("shop_customers")
          .select("id, display_name, customer_phone")
          .eq("shop_id", shop.id)
          .eq("status", "active")
          .not("customer_profile_id", "is", null)
          .not("consent_at", "is", null)
          .is("owner_confirmed_at", null)
          .order("display_name");
        if (confirmationError) throw confirmationError;

        if (!disposed) {
          setShopId(shop.id);
          setShopName(shop.name);
          setPhoneCustomers((customers ?? []).map((customer) => ({
            id: customer.id,
            displayName: customer.display_name,
            phone: customer.customer_phone,
          })));
          setCustomersToConfirm((unconfirmedCustomers ?? []).map((customer) => ({
            id: customer.id,
            displayName: customer.display_name,
            phone: customer.customer_phone,
          })));
          setStatus("ready");
        }
      } catch {
        if (!disposed) {
          setPageError("We couldn't load your shop. Please refresh or sign in again.");
          setStatus("error");
        }
      }
    }

    void loadShop();
    return () => {
      disposed = true;
    };
  }, [router]);

  useEffect(() => {
    if (!activeSale) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [activeSale]);

  const addProduct = useCallback((product: Product) => {
    setCartItems((currentItems) => {
      const existing = currentItems.find((item) => item.product.id === product.id);
      if (existing) {
        return currentItems.map((item) =>
          item.product.id === product.id
            ? { ...item, qty: Math.min(99, item.qty + 1) }
            : item,
        );
      }
      return [...currentItems, { product, qty: 1 }];
    });
    setPageError("");
  }, []);

  async function attestCustomerIdentity(customer: PhoneCustomer) {
    const result = await confirmCustomerIdentity({ shopCustomerId: customer.id });
    if (!result.ok) {
      setPageError("We couldn't record that identity confirmation. Refresh and try again.");
      return;
    }
    setCustomersToConfirm((current) => current.filter((item) => item.id !== customer.id));
  }

  function handleBarcode(barcode: string) {
    const product = getProductByBarcode(barcode);
    setScannerOpen(false);
    if (!product) {
      setPageError("That barcode isn't in the demo catalogue. Add the item from the list instead.");
      return;
    }
    addProduct(product);
  }

  async function handleCharge(items: SaleItemInput[]) {
    setPageError("");
    try {
      const result = await createSale({ items });
      if (!result.ok) {
        setPageError(getSaleErrorMessage(result.error));
        return;
      }
      setActiveSale({
        saleId: result.saleId,
        paymentUrl: `${window.location.origin}/pay/${result.token}`,
        totalCents: result.totalCents,
        expiresAt: result.expiresAt,
      });
      setPinApprovalOpen(false);
      setSelectedPhoneCustomerId("");
      setNow(Date.now());
    } catch {
      setPageError("We couldn't create the sale. Please check your connection and try again.");
      throw new Error("sale_creation_failed");
    }
  }

  const remainingMilliseconds = activeSale
    ? Date.parse(activeSale.expiresAt) - now
    : 0;
  const saleExpired = remainingMilliseconds <= 0;

  if (status === "checking") {
    return (
      <main className="flex min-h-full items-center justify-center px-6">
        <p className="text-sm text-foreground/75" role="status">Loading your shop…</p>
      </main>
    );
  }

  if (status === "error") {
    return (
      <main className="flex min-h-full items-center justify-center px-6">
        <section className="w-full rounded-2xl border border-white/10 bg-card p-6 text-center">
          <p className="text-sm text-red-200" role="alert">{pageError}</p>
          <button
            className="mt-5 min-h-11 rounded-full bg-teal px-6 text-sm font-semibold text-[#041A1E]"
            onClick={() => window.location.reload()}
            type="button"
          >
            Try again
          </button>
        </section>
      </main>
    );
  }

  if (scannerOpen) {
    return (
      <BarcodeScanner
        onBack={() => setScannerOpen(false)}
        onManualAdd={() => setScannerOpen(false)}
        onScan={handleBarcode}
      />
    );
  }

  return (
    <main className="shop-sell-layout flex min-h-full flex-col px-3 pt-3">
      <header className="flex min-h-14 items-center justify-between px-1">
        <div className="flex min-w-0 items-center gap-2.5">
          <span aria-hidden="true" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-teal text-[#041A1E]">
            <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none">
              <path d="M4 20V8l8-5 8 5v12H4Zm-1-12h18M8 20v-6h8v6M8 10h2m4 0h2" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.7" />
            </svg>
          </span>
          <div className="min-w-0">
            <h1 className="truncate text-sm font-semibold">{shopName}</h1>
            <p className="text-[11px] text-foreground/65">Shop Owner</p>
          </div>
        </div>
        <ShopAccountMenu />
      </header>

      <nav aria-label="Shop sections" className="mt-2 flex rounded-full bg-card p-1">
        <span aria-current="page" className="flex min-h-10 flex-1 items-center justify-center rounded-full bg-teal text-xs font-semibold text-[#041A1E]">
          Sell
        </span>
        <Link className="flex min-h-10 flex-1 items-center justify-center rounded-full text-xs text-foreground/70 hover:text-teal" href="/shop/ledger">
          Ledger
        </Link>
      </nav>

      {pageError && (
        <p className="mt-3 rounded-lg border border-red-400/30 bg-red-950/20 px-3 py-2 text-sm text-red-200" role="alert">
          {pageError}
        </p>
      )}

      {customersToConfirm.length > 0 && (
        <section aria-labelledby="customer-confirmation-title" className="mt-3 rounded-2xl border border-amber/40 bg-card p-4">
          <h2 className="text-sm font-semibold" id="customer-confirmation-title">Confirm linked customers</h2>
          <p className="mt-1 text-xs leading-relaxed text-foreground/70">
            Confirm only after you have checked the customer&apos;s identity in person.
          </p>
          <ul className="mt-3 space-y-2">
            {customersToConfirm.map((customer) => (
              <li className="flex items-center justify-between gap-3 border-t border-white/10 pt-2" key={customer.id}>
                <span className="min-w-0 text-xs">{customer.displayName} · {customer.phone}</span>
                <button
                  className="min-h-9 shrink-0 rounded-full border border-amber/50 px-3 text-xs font-semibold"
                  onClick={() => void attestCustomerIdentity(customer)}
                  type="button"
                >
                  I verified them
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      <OwnerPayments shopId={shopId} activeSaleId={activeSale?.saleId} refreshKey={`${activeSale?.saleId ?? ""}:${customersToConfirm.length}`}
        onCompleted={(saleId) => {
          if (activeSale?.saleId === saleId) {
            setActiveSale(null);
            setCartItems([]);
            setPinApprovalOpen(false);
            setSelectedPhoneCustomerId("");
          }
        }} />

      {activeSale ? (
        <section aria-labelledby="payment-title" className="sale-payment-panel my-4 flex flex-1 flex-col items-center rounded-2xl border border-teal/50 bg-card px-5 py-6 text-center">
          <h2 className="text-lg font-semibold" id="payment-title">Customer Payment</h2>
          <p className="mt-2 text-2xl font-bold">{formatRand(activeSale.totalCents)}</p>
          <p className="mt-2 text-sm text-foreground/75" role="timer">
            {saleExpired ? "This payment link has expired." : `Expires in ${formatRemainingTime(remainingMilliseconds)}`}
          </p>

          {!saleExpired && (
            <>
              <div className="mt-5 rounded-xl bg-white p-3">
                <QRCodeSVG
                  aria-label="QR code for customer payment"
                  // WHY: The QR standard's four-module quiet zone keeps its finder patterns clear.
                  marginSize={4}
                  level="M"
                  size={246}
                  value={activeSale.paymentUrl}
                />
              </div>
              <p className="mt-4 text-xs text-foreground/70">Scan with the customer&apos;s phone to continue.</p>
              <p className="mt-2 text-xs text-foreground/60">One-time link · expires in 5 minutes</p>
              <div className="mt-5 w-full border-t border-white/10 pt-4">
                {!pinApprovalOpen ? (
                  <button
                    className="min-h-11 w-full rounded-xl border border-teal/50 px-4 text-sm text-teal hover:bg-white/5"
                    onClick={() => setPinApprovalOpen(true)}
                    type="button"
                  >
                    Customer without a smartphone
                  </button>
                ) : (
                  <div className="w-full">
                    <label className="block text-left text-xs font-medium" htmlFor="phone-customer">Choose customer</label>
                    {phoneCustomers.length > 0 ? (
                      <select
                        className="mt-2 min-h-11 w-full rounded-lg border border-white/15 bg-bg px-3 text-sm"
                        id="phone-customer"
                        onChange={(event) => setSelectedPhoneCustomerId(event.target.value)}
                        value={selectedPhoneCustomerId}
                      >
                        <option value="">Select a customer</option>
                        {phoneCustomers.map((customer) => (
                          <option key={customer.id} value={customer.id}>
                            {customer.displayName} · {customer.phone}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <p className="mt-2 text-left text-sm text-foreground/70">
                        No consented phone-only customers yet. <Link className="text-teal underline" href="/shop/customers/new">Add a customer</Link>
                      </p>
                    )}
                    {selectedPhoneCustomerId && (
                      <div className="mt-5 rounded-xl border border-white/10 bg-bg p-3">
                        <PinPad
                          onSubmit={async (pin) => {
                            const result = await approveTab({
                              saleId: activeSale.saleId,
                              shopCustomerId: selectedPhoneCustomerId,
                              pin,
                            });
                            if (!result.ok) return result;
                            setActiveSale(null);
                            setCartItems([]);
                            setPinApprovalOpen(false);
                            setSelectedPhoneCustomerId("");
                            setPageError("Tab approved.");
                            return { ok: true };
                          }}
                        />
                      </div>
                    )}
                    <button
                      className="mt-3 min-h-11 w-full rounded-lg text-sm text-foreground/70 hover:text-foreground"
                      onClick={() => {
                        setPinApprovalOpen(false);
                        setSelectedPhoneCustomerId("");
                      }}
                      type="button"
                    >
                      Cancel PIN approval
                    </button>
                  </div>
                )}
              </div>
            </>
          )}

          <button
            className="mt-auto min-h-12 w-full rounded-full bg-teal px-5 py-3 text-sm font-semibold text-[#041A1E]"
            onClick={() => {
              setActiveSale(null);
              setCartItems([]);
              setPageError("");
            }}
            type="button"
          >
            Start a new sale
          </button>
        </section>
      ) : (
        <>
          <div className="sale-workspace">
          <section aria-labelledby="scan-title" className="sale-scan relative mt-3 flex min-h-[9.5rem] flex-col items-center justify-center overflow-hidden rounded-2xl border border-teal/40 bg-card px-4 py-4 text-center">
            <span aria-hidden="true" className="absolute left-3 top-3 h-5 w-5 rounded-tl-lg border-l-2 border-t-2 border-teal" />
            <span aria-hidden="true" className="absolute right-3 top-3 h-5 w-5 rounded-tr-lg border-r-2 border-t-2 border-teal" />
            <span aria-hidden="true" className="absolute bottom-3 left-3 h-5 w-5 rounded-bl-lg border-b-2 border-l-2 border-teal" />
            <span aria-hidden="true" className="absolute bottom-3 right-3 h-5 w-5 rounded-br-lg border-b-2 border-r-2 border-teal" />
            <svg aria-hidden="true" className="h-8 w-14 text-teal" viewBox="0 0 56 32" fill="none">
              <path d="M3 4v24M8 4v24M14 4v24M21 4v24M29 4v24M34 4v24M42 4v24M48 4v24M53 4v24" stroke="currentColor" strokeLinecap="round" strokeWidth="2.5" />
            </svg>
            <h2 className="mt-2 text-sm font-medium" id="scan-title">Scan barcode to add items</h2>
            <button
              className="mt-3 min-h-11 min-w-36 rounded-full bg-teal px-6 py-2 text-xs font-semibold text-[#041A1E] transition hover:brightness-110 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal"
              onClick={() => setScannerOpen(true)}
              type="button"
            >
              Tap to scan
            </button>
          </section>

          <section aria-labelledby="manual-title" className="sale-manual mt-3">
            <h2 className="mb-2 px-1 text-xs font-semibold text-foreground/75" id="manual-title">Or add item manually</h2>
            <ul className="flex flex-col gap-1.5">
              {products.map((product) => (
                <li className="flex min-h-14 items-center gap-2 rounded-xl border border-white/5 bg-card px-2.5 py-1.5" key={product.id}>
                  <ProductIcon product={product} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs font-medium">{product.name}</p>
                    <p className="mt-0.5 text-[11px] text-foreground/65">{formatRand(product.priceCents)}</p>
                  </div>
                  <button
                    aria-label={`Add ${product.name} to sale`}
                    className="flex h-11 min-w-11 items-center justify-center rounded-lg bg-[#10313A] px-3 text-xs font-semibold text-teal hover:bg-[#17434A] focus-visible:outline-2 focus-visible:outline-teal"
                    onClick={() => addProduct(product)}
                    type="button"
                  >
                    Add
                  </button>
                </li>
              ))}
            </ul>
          </section>

          <section aria-label="Current sale" className="sale-basket mt-4 rounded-2xl border border-white/10 bg-bg p-2.5">
            <Cart
              items={cartItems}
              onCharge={handleCharge}
              onItemsChange={setCartItems}
            />
          </section>
          </div>
        </>
      )}

      <BottomNavigation />
    </main>
  );
}
