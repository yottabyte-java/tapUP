"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { BarcodeScanner } from "@/components/BarcodeScanner";
import { saleTokenSchema } from "@/lib/validation";

function readPaymentToken(value: string, origin: string): string | null {
  const input = value.trim();
  const rawToken = saleTokenSchema.safeParse(input);
  if (rawToken.success) return rawToken.data;

  try {
    const url = new URL(input, origin);
    if (url.origin !== origin) return null;
    const match = url.pathname.match(/^\/pay\/([0-9a-f]{32})\/?$/i);
    return match?.[1] ?? null;
  } catch {
    return null;
  }
}

export function CustomerPurchaseEntry() {
  const router = useRouter();
  const [scannerOpen, setScannerOpen] = useState(false);
  const [paymentLink, setPaymentLink] = useState("");
  const [error, setError] = useState("");

  function openPayment(value: string) {
    const token = readPaymentToken(value, window.location.origin);
    if (!token) {
      setError("Enter a valid tapUP payment link or 32-character QR code.");
      return;
    }
    setError("");
    router.push(`/pay/${token}`);
  }

  function submitLink(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    openPayment(paymentLink);
  }

  if (scannerOpen) {
    return (
      <BarcodeScanner
        mode="paymentQr"
        onBack={() => setScannerOpen(false)}
        onManualAdd={() => setScannerOpen(false)}
        onScan={(value) => {
          setScannerOpen(false);
          openPayment(value);
        }}
      />
    );
  }

  return (
    <section aria-labelledby="start-purchase-title" className="mt-4 rounded-2xl border border-teal/40 bg-card p-4">
      <h2 className="text-sm font-semibold" id="start-purchase-title">Scan a shop QR to get started</h2>
      <p className="mt-2 text-xs leading-relaxed text-foreground/70">
        Scan the shop&apos;s purchase QR with your camera, or enter the payment link here. You&apos;ll review the shop and amount before confirming.
      </p>
      <button
        className="mt-4 min-h-11 w-full rounded-full bg-teal px-4 text-sm font-semibold text-[#041A1E]"
        onClick={() => setScannerOpen(true)}
        type="button"
      >
        Open QR scanner
      </button>
      <form className="mt-4 flex flex-col gap-2" onSubmit={submitLink}>
        <label className="text-xs font-medium" htmlFor="payment-link">Or paste a payment link or enter the QR code</label>
        <input
          autoComplete="off"
          className="min-h-11 rounded-xl border border-white/15 bg-bg px-3 text-sm"
          id="payment-link"
          inputMode="text"
          onChange={(event) => setPaymentLink(event.target.value)}
          placeholder="Payment link or QR code"
          value={paymentLink}
        />
        {error && <p className="text-xs text-red-200" role="alert">{error}</p>}
        <button className="min-h-11 rounded-xl border border-teal/50 px-4 text-sm font-medium text-teal" type="submit">
          Open payment
        </button>
      </form>
    </section>
  );
}
