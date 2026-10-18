"use client";

import { QRCodeSVG } from "qrcode.react";
import { useEffect, useState } from "react";
import { formatRand } from "@/lib/money";

type SaleQrProps = {
  token: string;
  totalCents: number;
  expiresAt: string;
  onCreateNewSale: () => void | Promise<void>;
};

function formatRemainingTime(milliseconds: number): string {
  const totalSeconds = Math.max(0, Math.floor(milliseconds / 1000));
  const minutes = Math.floor(totalSeconds / 60).toString().padStart(2, "0");
  const seconds = (totalSeconds % 60).toString().padStart(2, "0");
  return `${minutes}:${seconds}`;
}

export function SaleQr({
  token,
  totalCents,
  expiresAt,
  onCreateNewSale,
}: SaleQrProps) {
  const [currentTime, setCurrentTime] = useState<number | null>(null);
  const [paymentUrl, setPaymentUrl] = useState("");
  const [copyStatus, setCopyStatus] = useState("");
  const [isCreatingNewSale, setIsCreatingNewSale] = useState(false);
  const [createError, setCreateError] = useState("");

  useEffect(() => {
    // WHY: Read browser time and origin after mount so the QR component can still prerender safely.
    const initializeTimer = window.setTimeout(() => {
      setCurrentTime(Date.now());
      setPaymentUrl(`${window.location.origin}/pay/${token}`);
    }, 0);
    const timer = window.setInterval(() => setCurrentTime(Date.now()), 1000);
    return () => {
      window.clearTimeout(initializeTimer);
      window.clearInterval(timer);
    };
  }, [token]);

  const expiryTime = Date.parse(expiresAt);
  const remainingMilliseconds = currentTime === null
    ? null
    : expiryTime - currentTime;
  const isExpired = remainingMilliseconds !== null && remainingMilliseconds <= 0;
  const shortToken = token.length > 8 ? `…${token.slice(-8)}` : "••••••••";

  async function copyPaymentLink() {
    if (!paymentUrl || isExpired) return;

    try {
      await navigator.clipboard.writeText(paymentUrl);
      setCopyStatus("Payment link copied.");
    } catch {
      setCopyStatus("Couldn't copy the payment link. Please share the QR code instead.");
    }
  }

  async function createNewSale() {
    if (isCreatingNewSale) return;

    setIsCreatingNewSale(true);
    setCreateError("");
    try {
      await onCreateNewSale();
    } catch {
      setCreateError("We couldn't create a new link. Please try again.");
    } finally {
      setIsCreatingNewSale(false);
    }
  }

  return (
    <section
      aria-labelledby="sale-qr-title"
      className="my-4 flex flex-1 flex-col items-center rounded-2xl border border-teal/50 bg-card px-5 py-6 text-center"
    >
      <h2 className="text-lg font-semibold" id="sale-qr-title">Customer Payment</h2>
      <p className="mt-2 text-2xl font-bold">{formatRand(totalCents)}</p>

      <p className="mt-1 text-sm text-foreground/75" role="timer" aria-live="polite">
        {isExpired
          ? "Expired"
          : remainingMilliseconds === null
            ? "Checking expiry…"
            : `Expires in ${formatRemainingTime(remainingMilliseconds)}`}
      </p>

      {!isExpired && (
        <>
          <div className="mt-5 rounded-xl bg-white p-3">
            {paymentUrl ? (
              <QRCodeSVG
                aria-label="QR code for customer payment"
                size={208}
                value={paymentUrl}
              />
            ) : (
              <div aria-label="Preparing payment QR code" className="h-[208px] w-[208px]" role="status" />
            )}
          </div>

          <div className="mt-3 flex min-h-10 items-center gap-2 rounded-full bg-[#10313A] px-3">
            <span className="text-xs text-foreground/75">Token:</span>
            <span aria-label="Short token ending" className="font-mono text-xs text-foreground/90">
              {shortToken}
            </span>
            <button
              aria-label="Copy payment link"
              className="flex h-11 w-11 items-center justify-center rounded-full text-teal hover:bg-white/5 focus-visible:outline-2 focus-visible:outline-teal"
              disabled={!paymentUrl}
              onClick={copyPaymentLink}
              type="button"
            >
              <svg aria-hidden="true" className="h-4 w-4" viewBox="0 0 24 24" fill="none">
                <rect x="8" y="8" width="12" height="12" rx="2" stroke="currentColor" strokeWidth="1.6" />
                <path d="M16 8V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3" stroke="currentColor" strokeLinecap="round" strokeWidth="1.6" />
              </svg>
            </button>
          </div>

          {copyStatus && (
            <p className="mt-2 text-xs text-foreground/75" role="status">{copyStatus}</p>
          )}

          <div className="mt-4 flex items-start gap-2 rounded-xl border border-amber/70 bg-amber/10 px-3 py-3 text-left">
            <svg aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-amber" viewBox="0 0 24 24" fill="none">
              <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.6" />
              <path d="M12 7v6m0 4h.01" stroke="currentColor" strokeLinecap="round" strokeWidth="1.8" />
            </svg>
            <p className="text-xs leading-relaxed text-foreground/85">
              This link is for one-time use only. It will expire in 5 minutes.
            </p>
          </div>
        </>
      )}

      {isExpired && (
        <>
          <p className="mt-3 text-sm text-foreground/75">
            Ask the shop owner to create a new payment link.
          </p>
          {createError && (
            <p className="mt-3 text-sm text-red-200" role="alert">{createError}</p>
          )}
          <button
            className="mt-6 min-h-12 w-full rounded-full bg-teal px-5 py-3 text-sm font-semibold text-[#041A1E] disabled:cursor-not-allowed disabled:opacity-60"
            disabled={isCreatingNewSale}
            onClick={createNewSale}
            type="button"
          >
            {isCreatingNewSale ? "Creating link…" : "Create a new sale link"}
          </button>
        </>
      )}
    </section>
  );
}
