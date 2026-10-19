import { Suspense } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getCustomerPayConsentState, linkWithConsent } from "@/lib/actions/customers";
import {
  demoPay,
  getCustomerPayDetails,
  requestCustomerCash,
  requestCustomerTab,
} from "@/lib/actions/sales";
import { formatRand } from "@/lib/money";

type PageProps = {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ error?: string }>;
};

type PayDetails = {
  totalCents: number;
  limitCents: number;
  availableCents: number;
  level: number;
  nextLimitCents: number;
  tabCents: number;
  remainderCents: number;
};

function ExpiredLink() {
  return (
    <main className="flex min-h-full flex-col px-3 py-3">
      <section className="flex min-h-full flex-1 flex-col items-center justify-center rounded-[1.4rem] border border-teal/70 px-6 py-8 text-center">
        <div aria-hidden="true" className="flex h-20 w-20 items-center justify-center rounded-full border border-pink-300/70 bg-card">
          <svg className="h-12 w-12 text-amber" viewBox="0 0 48 48" fill="none">
            <circle cx="24" cy="24" r="17" stroke="currentColor" strokeWidth="2" />
            <path d="M24 13v12l8 5" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" />
          </svg>
        </div>
        <h1 className="mt-5 text-lg font-semibold">This payment link has expired</h1>
        <p className="mt-3 max-w-xs text-sm leading-relaxed text-foreground/75">
          The QR code is no longer valid. Please ask the shop owner for a new one.
        </p>
        <Link
          className="mt-auto flex min-h-12 w-full items-center justify-center rounded-full bg-gradient-to-r from-[#00CEA8] to-[#00BFA5] px-5 py-3 text-sm font-semibold text-[#041A1E]"
          href="/me"
        >
          Back to my account
        </Link>
      </section>
    </main>
  );
}

function ConsentRequired({ token, showError }: { token: string; showError: boolean }) {
  async function submitConsent(formData: FormData) {
    "use server";

    const consent = formData.get("consent") === "on";
    const result = await linkWithConsent({ token, consent });
    if (!result.ok) {
      if (result.error === "unauthorized") redirect("/login");
      if (result.error === "invalid_link" || result.error === "forbidden") redirect(`/pay/${token}`);
      redirect(`/pay/${token}?error=consent`);
    }
    redirect(`/pay/${token}`);
  }

  return (
    <main className="flex min-h-full flex-col px-3 py-3">
      <section className="flex min-h-full flex-1 flex-col rounded-[1.4rem] border border-teal/70 px-4 py-5">
        <header className="flex min-h-11 items-center gap-3">
          <Link
            aria-label="Back to my account"
            className="flex h-11 w-11 items-center justify-center rounded-lg text-foreground hover:text-teal"
            href="/me"
          >
            <span aria-hidden="true" className="text-2xl">‹</span>
          </Link>
          <h1 className="text-base font-semibold">Customer consent</h1>
        </header>
        <section className="mt-5 rounded-xl bg-card p-4">
          <h2 className="text-sm font-semibold">POPIA consent</h2>
          <p className="mt-2 text-sm leading-relaxed text-foreground/80">
            The shop uses your purchase and repayment history to keep a record and calculate buying power at this shop.
          </p>
          {showError && (
            <p className="mt-3 text-sm text-red-200" role="alert">
              Please confirm consent before continuing.
            </p>
          )}
          <form action={submitConsent} className="mt-4">
            <label className="flex cursor-pointer items-start gap-2.5 text-sm leading-relaxed">
              <input className="mt-0.5 h-5 w-5 shrink-0 accent-teal" name="consent" required type="checkbox" />
              <span>I confirm that I have the customer&apos;s consent to collect and store their personal information for this service.</span>
            </label>
            <button
              className="mt-5 min-h-12 w-full rounded-full bg-teal px-5 py-3 text-sm font-semibold text-[#041A1E]"
              type="submit"
            >
              Continue to payment
            </button>
          </form>
          <p className="mt-4 text-center text-xs text-foreground/65">
            Your account will only be linked to this shop after you give consent.
          </p>
        </section>
      </section>
    </main>
  );
}

function LoadingPayment() {
  return (
    <main className="flex min-h-full items-center justify-center px-6">
      <p className="text-sm text-foreground/75" role="status">Loading payment details…</p>
    </main>
  );
}

function PaymentError({ token }: { token: string }) {
  return (
    <main className="flex min-h-full items-center justify-center px-6">
      <section className="w-full rounded-2xl border border-white/10 bg-card p-6 text-center">
        <p className="text-sm text-red-200" role="alert">
          We couldn&apos;t load this payment. Check your connection and try again.
        </p>
        <Link
          className="mt-5 inline-flex min-h-11 items-center justify-center rounded-full bg-teal px-6 text-sm font-semibold text-[#041A1E]"
          href={`/pay/${token}`}
        >
          Try again
        </Link>
      </section>
    </main>
  );
}

async function CustomerPayContent({ params, searchParams }: PageProps) {
  const [{ token }, query] = await Promise.all([params, searchParams]);
  const result = await getCustomerPayDetails(token);

  if (!result.ok) {
    if (result.error === "unauthorized") redirect("/login");
    if (result.error === "invalid_link") {
      const consentState = await getCustomerPayConsentState(token);
      if (!consentState.ok) {
        if (consentState.error === "unauthorized") redirect("/login");
        if (consentState.error !== "invalid_link" && consentState.error !== "forbidden") {
          return <PaymentError token={token} />;
        }
      } else if (consentState.needsConsent) {
        return <ConsentRequired showError={query.error === "consent"} token={token} />;
      }
      return <ExpiredLink />;
    }
    if (result.error === "forbidden") return <ExpiredLink />;
    return <PaymentError token={token} />;
  }

  const details: PayDetails = {
    totalCents: result.totalCents,
    limitCents: result.limitCents,
    availableCents: result.availableCents,
    level: result.level,
    nextLimitCents: result.nextLimitCents,
    tabCents: result.tabCents,
    remainderCents: result.remainderCents,
  };
  const showPaymentError = query.error === "payment";

  async function payWithDemoCard() {
    "use server";

    const latest = await getCustomerPayDetails(token);
    if (!latest.ok) {
      if (latest.error === "unauthorized") redirect("/login");
      if (latest.error === "invalid_link" || latest.error === "forbidden") redirect(`/pay/${token}`);
      redirect(`/pay/${token}?error=payment`);
    }

    const paymentResult = latest.tabCents > 0
      ? await requestCustomerTab({ token, paidNowMethod: "demo_card" })
      : await demoPay(token);
    if (!paymentResult.ok) {
      if (paymentResult.error === "unauthorized") redirect("/login");
      if (
        paymentResult.error === "invalid_link"
        || paymentResult.error === "sale_not_payable"
        || paymentResult.error === "sale_not_payable_by_demo_card"
        || paymentResult.error === "sale_expired"
      ) {
        redirect(`/pay/${token}`);
      }
      redirect(`/pay/${token}?error=payment`);
    }

    redirect("/me");
  }

  async function payWithCash() {
    "use server";

    const latest = await getCustomerPayDetails(token);
    if (!latest.ok) {
      if (latest.error === "unauthorized") redirect("/login");
      if (latest.error === "invalid_link" || latest.error === "forbidden") redirect(`/pay/${token}`);
      redirect(`/pay/${token}?error=payment`);
    }

    const cashResult = latest.tabCents > 0
      ? await requestCustomerTab({ token, paidNowMethod: "cash" })
      : await requestCustomerCash(token);
    if (!cashResult.ok) {
      if (cashResult.error === "unauthorized") redirect("/login");
      if (cashResult.error === "invalid_link" || cashResult.error === "sale_not_payable") {
        redirect(`/pay/${token}`);
      }
      redirect(`/pay/${token}?error=payment`);
    }

    redirect("/me");
  }

  const progressPercent = details.nextLimitCents > 0
    ? Math.min(100, Math.round(details.limitCents / details.nextLimitCents * 100))
    : 100;

  return (
    <main className="flex min-h-full flex-col px-3 py-3">
      <section className="flex min-h-full flex-1 flex-col rounded-[1.4rem] border border-teal/70 px-3.5 pb-5 pt-4">
        <header className="flex min-h-11 items-center gap-3">
          <Link
            aria-label="Back to my account"
            className="flex h-11 w-11 items-center justify-center rounded-lg text-foreground hover:text-teal focus-visible:outline-2 focus-visible:outline-teal"
            href="/me"
          >
            <svg aria-hidden="true" className="h-5 w-5" viewBox="0 0 24 24" fill="none">
              <path d="m15 18-6-6 6-6M9 12h11" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" />
            </svg>
          </Link>
          <h1 className="text-base font-semibold">Pay for your items</h1>
        </header>

        <section aria-label="Sale total" className="mt-3 rounded-xl bg-card px-3 py-2.5">
          <p className="text-[11px] text-foreground/65">Total due</p>
          <p className="mt-0.5 text-lg font-bold">{formatRand(details.totalCents)}</p>
        </section>

        <section aria-labelledby="buying-power-title" className="mt-2.5 rounded-xl border border-teal/50 bg-card px-3 py-3">
          <h2 className="text-xs font-medium" id="buying-power-title">Available buying power</h2>
          <p className="mt-1 text-xl font-bold text-teal">{formatRand(details.availableCents)}</p>
          <div
            aria-label={`Buying power progress ${progressPercent}%`}
            aria-valuemax={100}
            aria-valuemin={0}
            aria-valuenow={progressPercent}
            className="mt-2 h-2 overflow-hidden rounded-full bg-[#24424A]"
            role="progressbar"
          >
            <div className="h-full rounded-full bg-teal" style={{ width: `${progressPercent}%` }} />
          </div>
          <p className="mt-2 text-[11px] text-foreground/75">
            Level {details.level} <span aria-hidden="true">·</span> Next level at {formatRand(details.nextLimitCents)}
          </p>
        </section>

        {details.availableCents > 0 && (
          <section aria-label="Tab amount" className="mt-2.5 rounded-xl bg-card px-3 py-2.5">
            <p className="text-[11px] text-foreground/75">You can put on tab <span className="text-foreground/55">(within your limit)</span></p>
            <p className="mt-0.5 text-lg font-bold text-teal">{formatRand(details.tabCents)}</p>
          </section>
        )}

        <section aria-label="Amount to pay now" className="mt-2 rounded-xl bg-card px-3 py-2.5">
          <div className="flex items-center justify-between gap-2 text-xs">
            <span>Remainder to pay now</span>
            <span className="font-semibold">{formatRand(details.remainderCents)}</span>
          </div>
        </section>

        {showPaymentError && (
          <p className="mt-3 rounded-lg border border-red-400/30 bg-red-950/20 px-3 py-2 text-sm text-red-200" role="alert">
            We couldn&apos;t submit that payment choice. Please try again.
          </p>
        )}

        <div className="mt-auto flex flex-col gap-2 pt-4">
          <form action={payWithDemoCard}>
            <button className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl border border-teal/50 bg-card px-4 py-3 text-sm font-medium" type="submit">
              Demo card / wallet
            </button>
          </form>
          <form action={payWithCash}>
            <button className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl border border-teal/50 bg-card px-4 py-3 text-sm font-medium" type="submit">
              Cash
            </button>
          </form>
          <p className="pt-1 text-center text-[11px] text-foreground/70">
            Payments are simulated in this demo.
          </p>
        </div>
      </section>
    </main>
  );
}

export default function CustomerPayPage(props: PageProps) {
  return (
    <Suspense fallback={<LoadingPayment />}>
      <CustomerPayContent {...props} />
    </Suspense>
  );
}
