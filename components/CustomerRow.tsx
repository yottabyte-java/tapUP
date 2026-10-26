"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { repayTab } from "@/lib/actions/tabs";
import { ShopAccountMenu } from "@/components/ShopAccountMenu";
import { formatRand, toCents } from "@/lib/money";

type OutstandingSale = {
  id: string;
  owedCents: number;
  dueAt: string;
  late: boolean;
};

type CustomerLedgerRow = {
  id: string;
  displayName: string;
  phone: string;
  limitCents: number;
  owedCents: number;
  late: boolean;
  outstandingSales: OutstandingSale[];
  repayments: {
    amountCents: number;
    paidAt: string;
    onTime: boolean;
  }[];
};

type LedgerTransaction = {
  id: string;
  type: "sale" | "repayment";
  label: string;
  amountCents: number;
  method: "tab" | "demo_card" | "cash" | "pending";
  status: string;
  occurredAt: string;
};

export type LedgerData = {
  shopName: string;
  todayTakingsCents: number;
  tabsOwedCents: number;
  customers: CustomerLedgerRow[];
  transactions: LedgerTransaction[];
};

type Tab = "customers" | "transactions";
type RepaymentConfirmation = {
  customerName: string;
  amountCents: number;
  onTime: boolean;
};

function formatDate(value: string): string {
  return new Intl.DateTimeFormat("en-ZA", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Africa/Johannesburg",
  }).format(new Date(value));
}

function getRepaymentError(error: string): string {
  switch (error) {
    case "repayment_recorded_sale_status_unavailable":
    case "repayment_recorded_buying_power_unavailable":
      return "Payment was recorded, but the updated account could not be loaded. Refresh records before recording another payment.";
    case "repayment_recording_failed":
      return "We couldn't confirm whether the payment was recorded. Refresh records to check before trying again.";
    case "amount_exceeds_outstanding_balance":
      return "That amount is more than the remaining balance. Refresh and try again.";
    case "sale_has_no_outstanding_balance":
      return "This tab has already been fully repaid.";
    case "unauthorized":
    case "forbidden":
      return "Your shop-owner session is no longer valid. Sign in again.";
    default:
      return "We couldn’t record the repayment. Please check your connection and try again.";
  }
}

export function CustomerRow({
  customer,
  onSelect,
}: {
  customer: CustomerLedgerRow;
  onSelect: () => void;
}) {
  const amountTone = customer.late
    ? "text-red-300"
    : customer.owedCents > 0
      ? "text-amber"
      : "text-teal";

  return (
    <button
      aria-label={`View ${customer.displayName}, owed ${formatRand(customer.owedCents)}`}
      className="flex min-h-[76px] w-full items-center gap-3 rounded-xl border border-white/10 bg-card p-3 text-left transition-colors hover:border-teal/40 focus-visible:outline-2 focus-visible:outline-teal"
      onClick={onSelect}
      type="button"
    >
      <span aria-hidden="true" className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#163A3E] text-sm font-semibold text-teal">
        {customer.displayName.split(/\s+/).map((part) => part[0]).join("").slice(0, 2).toUpperCase()}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-semibold">{customer.displayName}</span>
        <span className="mt-1 block truncate text-xs text-foreground/60">{customer.phone}</span>
      </span>
      <span className="shrink-0 text-right">
        <span className={`block text-sm font-semibold ${amountTone}`}>{formatRand(customer.owedCents)}</span>
        <span className="mt-1 block text-[10px] text-foreground/60">Limit {formatRand(customer.limitCents)}</span>
        {customer.late && (
          <span className="mt-1 inline-flex rounded-full bg-red-950/70 px-2 py-0.5 text-[10px] font-semibold text-red-200">
            Late
          </span>
        )}
      </span>
      <span aria-hidden="true" className="text-lg text-foreground/40">›</span>
    </button>
  );
}

function ShopNavigation() {
  return (
    <nav aria-label="Shop navigation" className="sticky bottom-0 z-10 -mx-3 mt-4 border-t border-white/10 bg-bg/95 px-2 pb-2 pt-1 backdrop-blur">
      <ul className="grid grid-cols-3">
        <li>
          <Link className="flex min-h-12 flex-col items-center justify-center gap-1 text-foreground/65 hover:text-teal" href="/shop/sell">
            <span aria-hidden="true">⌂</span>
            <span className="text-[10px]">Sell</span>
          </Link>
        </li>
        <li>
          <Link aria-current="page" className="flex min-h-12 flex-col items-center justify-center gap-1 text-teal" href="/shop/ledger">
            <span aria-hidden="true">▤</span>
            <span className="text-[10px] font-medium">Ledger</span>
          </Link>
        </li>
        <li>
          <Link className="flex min-h-12 flex-col items-center justify-center gap-1 text-foreground/65 hover:text-teal" href="/shop/customers/new">
            <span aria-hidden="true">＋</span>
            <span className="text-[10px]">Customers</span>
          </Link>
        </li>
      </ul>
    </nav>
  );
}

function PaymentRecorded({
  confirmation,
  onDone,
  onViewCustomer,
}: {
  confirmation: RepaymentConfirmation;
  onDone: () => void;
  onViewCustomer: () => void;
}) {
  return (
    <section aria-labelledby="payment-recorded-title" className="flex min-h-[60vh] flex-col items-center justify-center rounded-2xl border border-white/10 bg-card px-5 py-8 text-center">
      <span aria-hidden="true" className="flex h-16 w-16 items-center justify-center rounded-full bg-[#123B3A] text-3xl text-teal">✓</span>
      <h2 className="mt-5 text-xl font-bold" id="payment-recorded-title">Payment recorded</h2>
      <p className="mt-2 text-sm text-foreground/75">
        {confirmation.customerName} repaid {formatRand(confirmation.amountCents)}
      </p>
      <span className={`mt-3 rounded-full px-3 py-1 text-xs font-semibold ${
        confirmation.onTime
          ? "bg-[#123B3A] text-teal"
          : "bg-amber/15 text-amber"
      }`}>
        {confirmation.onTime ? "On time" : "Late"}
      </span>
      <div className="mt-8 grid w-full gap-3">
        <button
          className="min-h-12 rounded-xl bg-teal px-5 text-sm font-semibold text-[#041A1E]"
          onClick={onDone}
          type="button"
        >
          Done
        </button>
        <button
          className="min-h-12 rounded-xl border border-white/15 px-5 text-sm font-semibold"
          onClick={onViewCustomer}
          type="button"
        >
          View customer
        </button>
      </div>
    </section>
  );
}

function CustomerDetail({
  customer,
  onBack,
  onRepaymentRecorded,
}: {
  customer: CustomerLedgerRow;
  onBack: () => void;
  onRepaymentRecorded: (confirmation: RepaymentConfirmation) => void;
}) {
  const router = useRouter();
  const [refreshing, startRefresh] = useTransition();
  const [needsRefresh, setNeedsRefresh] = useState(false);
  const submission = useRef(false);
  const [saleId, setSaleId] = useState("");
  const [amount, setAmount] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function submitRepayment(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    // WHY: A second event can arrive before the disabled state renders; never submit two partial receipts.
    if (submission.current || needsRefresh || refreshing) return;
    setErrorMessage("");

    if (!/^(?:0|[1-9]\d*)(?:\.\d{1,2})?$/.test(amount)) {
      setErrorMessage("Enter a valid amount in rands, such as 52.30.");
      return;
    }

    let amountCents: number;
    try {
      amountCents = toCents(amount);
    } catch {
      setErrorMessage("Enter a valid amount in rands, such as 52.30.");
      return;
    }
    if (amountCents <= 0) {
      setErrorMessage("Enter an amount greater than zero.");
      return;
    }

    submission.current = true;
    setSubmitting(true);
    try {
      const result = await repayTab({ saleId, amountCents });
      if (!result.ok) {
        setErrorMessage(getRepaymentError(result.error));
        if (result.error.startsWith("repayment_recorded_") || result.error === "repayment_recording_failed") {
          // WHY: A failed follow-up query does not roll back an already committed receipt.
          setNeedsRefresh(true);
          setSaleId("");
          setAmount("");
        }
        return;
      }
      // WHY: The returned on-time result comes from the database trigger, not the shopkeeper's device clock.
      onRepaymentRecorded({
        customerName: customer.displayName,
        amountCents: result.amountCents,
        onTime: result.onTime,
      });
    } catch {
      setErrorMessage("Connection failed. Refresh records to check whether the payment was recorded before trying again.");
      setNeedsRefresh(true);
      setSaleId("");
      setAmount("");
    } finally {
      submission.current = false;
      setSubmitting(false);
    }
  }

  return (
    <section className="space-y-4">
      <button
        className="flex min-h-11 items-center gap-2 text-sm text-teal"
        onClick={onBack}
        type="button"
      >
        <span aria-hidden="true">←</span> Back to customers
      </button>
      <header className="rounded-2xl border border-white/10 bg-card p-4">
        <div className="flex items-center gap-3">
          <span aria-hidden="true" className="flex h-12 w-12 items-center justify-center rounded-full bg-[#163A3E] font-semibold text-teal">
            {customer.displayName.split(/\s+/).map((part) => part[0]).join("").slice(0, 2).toUpperCase()}
          </span>
          <div>
            <h2 className="text-base font-semibold">{customer.displayName}</h2>
            <p className="mt-1 text-xs text-foreground/60">{customer.phone}</p>
          </div>
        </div>
        <div className="mt-4 grid grid-cols-2 gap-3">
          <div className="rounded-xl bg-bg p-3">
            <p className="text-[11px] text-foreground/60">Buying power</p>
            <p className="mt-1 font-semibold text-teal">{formatRand(customer.limitCents)}</p>
          </div>
          <div className="rounded-xl bg-bg p-3">
            <p className="text-[11px] text-foreground/60">Tabs owed</p>
            <p className={`mt-1 font-semibold ${customer.late ? "text-red-300" : customer.owedCents ? "text-amber" : "text-teal"}`}>
              {formatRand(customer.owedCents)}
            </p>
          </div>
        </div>
      </header>

      {errorMessage && <p className="text-sm text-red-200" role="alert">{errorMessage}</p>}
      {needsRefresh && <button className="min-h-11 rounded-lg border border-teal/50 px-3 text-sm disabled:opacity-50"
        disabled={refreshing} type="button" onClick={() => {
          setSaleId(""); setAmount("");
          startRefresh(() => router.refresh());
          setNeedsRefresh(false);
        }}>Refresh records</button>}

      <section aria-labelledby="open-tabs-title" className="rounded-2xl border border-white/10 bg-card p-4">
        <h3 className="text-sm font-semibold" id="open-tabs-title">Outstanding tabs</h3>
        {customer.outstandingSales.length === 0 ? (
          <p className="mt-3 rounded-xl bg-bg p-3 text-sm text-foreground/70">No tabs are outstanding.</p>
        ) : (
          <ul className="mt-3 space-y-3">
            {customer.outstandingSales.map((sale) => (
              <li className="rounded-xl bg-bg p-3" key={sale.id}>
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-sm font-semibold">{formatRand(sale.owedCents)} owed</p>
                    <p className={`mt-1 text-xs ${sale.late ? "text-red-300" : "text-foreground/60"}`}>
                      Due {formatDate(sale.dueAt)}
                    </p>
                  </div>
                  <button
                    className="min-h-11 rounded-lg bg-teal px-3 text-xs font-semibold text-[#041A1E]"
                    disabled={submitting || needsRefresh || refreshing}
                    onClick={() => {
                      setSaleId(sale.id);
                      setAmount((sale.owedCents / 100).toFixed(2));
                      setErrorMessage("");
                    }}
                    type="button"
                  >
                    Mark repaid
                  </button>
                </div>
                {saleId === sale.id && (
                  <form className="mt-3 border-t border-white/10 pt-3" onSubmit={submitRepayment}>
                    <label className="block text-xs font-medium" htmlFor={`repayment-${sale.id}`}>
                      Amount received (R)
                    </label>
                    <input
                      autoComplete="off"
                      className="mt-2 min-h-11 w-full rounded-lg border border-white/15 bg-card px-3 text-sm"
                      id={`repayment-${sale.id}`}
                      inputMode="decimal"
                      max={(sale.owedCents / 100).toFixed(2)}
                      min="0.01"
                      onChange={(event) => setAmount(event.target.value)}
                      placeholder="0.00"
                      required
                      step="0.01"
                      type="number"
                      value={amount}
                    />
                    <p className="mt-1 text-[11px] text-foreground/60">
                      Remaining balance: {formatRand(sale.owedCents)}
                    </p>
                    <div className="mt-3 grid grid-cols-2 gap-2">
                      <button
                        className="min-h-11 rounded-lg border border-white/15 text-xs"
                        onClick={() => {
                          setSaleId("");
                          setErrorMessage("");
                        }}
                        type="button"
                      >
                        Cancel
                      </button>
                      <button
                        className="min-h-11 rounded-lg bg-teal text-xs font-semibold text-[#041A1E] disabled:opacity-60"
                        disabled={submitting}
                        type="submit"
                      >
                        {submitting ? "Recording…" : "Confirm payment"}
                      </button>
                    </div>
                  </form>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      {customer.repayments.length > 0 && (
        <section aria-labelledby="repayment-history-title" className="rounded-2xl border border-white/10 bg-card p-4">
          <h3 className="text-sm font-semibold" id="repayment-history-title">Repayment history</h3>
          <ul className="mt-3 divide-y divide-white/10">
            {customer.repayments.slice(0, 5).map((repayment, index) => (
              <li className="flex items-center justify-between gap-3 py-3 text-sm" key={`${repayment.paidAt}-${index}`}>
                <span className="text-foreground/70">{formatDate(repayment.paidAt)}</span>
                <span className="text-right">
                  <span className="block font-medium">{formatRand(repayment.amountCents)}</span>
                  <span className={`text-[10px] ${repayment.onTime ? "text-teal" : "text-amber"}`}>
                    {repayment.onTime ? "On time" : "Late"}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </section>
  );
}

function Transactions({ transactions }: { transactions: LedgerTransaction[] }) {
  if (transactions.length === 0) {
    return (
      <p className="rounded-xl border border-white/10 bg-card p-4 text-sm text-foreground/70">
        Transactions will appear here when a sale is recorded.
      </p>
    );
  }

  return (
    <ul className="space-y-2">
      {transactions.slice(0, 40).map((transaction) => (
        <li className="flex min-h-[68px] items-center gap-3 rounded-xl border border-white/10 bg-card p-3" key={transaction.id}>
          <span aria-hidden="true" className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${
            transaction.type === "repayment" ? "bg-[#123B3A] text-teal" : "bg-[#26353A] text-foreground/75"
          }`}>
            {transaction.type === "repayment" ? "↙" : "▤"}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-medium">{transaction.label}</span>
            <span className="mt-1 block text-[11px] capitalize text-foreground/60">
              {transaction.type === "repayment" ? "Tab repayment" : `${transaction.method.replace("_", " ")} sale`}
              {" · "}{formatDate(transaction.occurredAt)}
            </span>
          </span>
          <span className="shrink-0 text-right">
            <span className={`block text-sm font-semibold ${transaction.type === "repayment" ? "text-teal" : "text-foreground"}`}>
              +{formatRand(transaction.amountCents)}
            </span>
            <span className="mt-1 block text-[10px] capitalize text-foreground/60">
              {transaction.status.replace("_", " ")}
            </span>
          </span>
        </li>
      ))}
    </ul>
  );
}

export function LedgerDashboard({ ledger }: { ledger: LedgerData }) {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("customers");
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(null);
  const [confirmation, setConfirmation] = useState<RepaymentConfirmation | null>(null);
  const selectedCustomer = ledger.customers.find((customer) => customer.id === selectedCustomerId);

  function showConfirmation(result: RepaymentConfirmation) {
    setConfirmation(result);
    router.refresh();
  }

  return (
    <main className="shop-ledger-layout flex min-h-full flex-col px-3 pt-3">
      <header className="flex min-h-14 items-center justify-between px-1">
        <div>
          <h1 className="text-lg font-semibold">Ledger</h1>
          <p className="text-[11px] text-foreground/60">{ledger.shopName}</p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            className="flex min-h-11 items-center justify-center rounded-full bg-teal px-4 text-xs font-semibold text-[#041A1E]"
            href="/shop/sell"
          >
            + New sale
          </Link>
          <ShopAccountMenu />
        </div>
      </header>

      {!selectedCustomer && !confirmation && (
        <>
          <section aria-label="Shop totals" className="mt-3 grid grid-cols-2 gap-3">
            <div className="rounded-2xl border border-white/10 bg-card p-3">
              <p className="text-[11px] text-foreground/65">Today&apos;s takings</p>
              <p className="mt-2 text-lg font-bold text-teal">{formatRand(ledger.todayTakingsCents)}</p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-card p-3">
              <p className="text-[11px] text-foreground/65">Tabs owed</p>
              <p className="mt-2 text-lg font-bold text-amber">{formatRand(ledger.tabsOwedCents)}</p>
            </div>
          </section>

          <div aria-label="Ledger view" className="mt-4 flex rounded-full bg-card p-1" role="tablist">
            <button
              aria-selected={tab === "customers"}
              aria-controls="ledger-tab-panel"
              className={`min-h-11 flex-1 rounded-full text-xs font-semibold ${
                tab === "customers" ? "bg-teal text-[#041A1E]" : "text-foreground/70"
              }`}
              id="customers-tab"
              onClick={() => setTab("customers")}
              role="tab"
              type="button"
            >
              Customers ({ledger.customers.length})
            </button>
            <button
              aria-selected={tab === "transactions"}
              aria-controls="ledger-tab-panel"
              className={`min-h-11 flex-1 rounded-full text-xs font-semibold ${
                tab === "transactions" ? "bg-teal text-[#041A1E]" : "text-foreground/70"
              }`}
              id="transactions-tab"
              onClick={() => setTab("transactions")}
              role="tab"
              type="button"
            >
              Transactions
            </button>
          </div>
        </>
      )}

      <div
        aria-labelledby={selectedCustomer || confirmation
          ? undefined
          : tab === "customers" ? "customers-tab" : "transactions-tab"}
        className="mt-4 flex-1"
        id="ledger-tab-panel"
        role={selectedCustomer || confirmation ? undefined : "tabpanel"}
      >
        {confirmation ? (
          <PaymentRecorded
            confirmation={confirmation}
            onDone={() => {
              setConfirmation(null);
              setSelectedCustomerId(null);
            }}
            onViewCustomer={() => setConfirmation(null)}
          />
        ) : selectedCustomer ? (
          <CustomerDetail
            customer={selectedCustomer}
            onBack={() => setSelectedCustomerId(null)}
            onRepaymentRecorded={showConfirmation}
          />
        ) : tab === "customers" ? (
          <section aria-label="Customers" className="grid grid-cols-1 gap-2 lg:grid-cols-2">
            {ledger.customers.length === 0 ? (
              <p className="rounded-xl border border-white/10 bg-card p-4 text-sm text-foreground/70">
                No customers yet. Add a customer before recording a tab.
              </p>
            ) : ledger.customers.map((customer) => (
              <CustomerRow
                customer={customer}
                key={customer.id}
                onSelect={() => setSelectedCustomerId(customer.id)}
              />
            ))}
          </section>
        ) : (
          <Transactions transactions={ledger.transactions} />
        )}
      </div>

      <ShopNavigation />
    </main>
  );
}
