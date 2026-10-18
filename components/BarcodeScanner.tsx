"use client";

import { useEffect, useId, useRef, useState } from "react";
import type { Html5Qrcode } from "html5-qrcode";

type BarcodeScannerProps = {
  onScan: (barcode: string) => void;
  onManualAdd: () => void;
  onBack?: () => void;
};

type ScannerStatus = "starting" | "scanning" | "fallback";

function cameraFailureMessage(error: unknown): string {
  const errorName = error instanceof Error ? error.name : "";

  if (errorName === "NotAllowedError" || errorName === "PermissionDeniedError") {
    return "Camera access was denied. Allow camera access in your browser settings or add items manually.";
  }
  if (errorName === "NotFoundError" || errorName === "DevicesNotFoundError") {
    return "No camera was found on this device. You can add items manually instead.";
  }
  if (typeof navigator !== "undefined" && !navigator.mediaDevices?.getUserMedia) {
    return "Camera scanning is not supported in this browser. You can add items manually instead.";
  }
  return "We couldn't start the camera. You can add items manually instead.";
}

export function BarcodeScanner({
  onScan,
  onManualAdd,
  onBack,
}: BarcodeScannerProps) {
  const generatedId = useId();
  const scannerElementId = `barcode-scanner-${generatedId.replace(/[^a-zA-Z0-9_-]/g, "")}`;
  const [status, setStatus] = useState<ScannerStatus>("starting");
  const [fallbackMessage, setFallbackMessage] = useState("");
  const [torchAvailable, setTorchAvailable] = useState(false);
  const [torchEnabled, setTorchEnabled] = useState(false);
  const [torchError, setTorchError] = useState("");
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const scanHandledRef = useRef(false);
  const onScanRef = useRef(onScan);

  useEffect(() => {
    onScanRef.current = onScan;
  }, [onScan]);

  useEffect(() => {
    let disposed = false;
    let scanner: Html5Qrcode | null = null;

    async function startScanner() {
      try {
        if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
          throw new Error("CameraUnavailable");
        }

        const { Html5Qrcode, Html5QrcodeSupportedFormats } = await import("html5-qrcode");
        if (disposed) return;

        scanner = new Html5Qrcode(scannerElementId, {
          // WHY: Grocery products use retail linear formats, not only QR codes.
          formatsToSupport: [
            Html5QrcodeSupportedFormats.CODE_39,
            Html5QrcodeSupportedFormats.CODE_93,
            Html5QrcodeSupportedFormats.CODE_128,
            Html5QrcodeSupportedFormats.ITF,
            Html5QrcodeSupportedFormats.EAN_13,
            Html5QrcodeSupportedFormats.EAN_8,
            Html5QrcodeSupportedFormats.UPC_A,
            Html5QrcodeSupportedFormats.UPC_E,
          ],
          verbose: false,
        });
        scannerRef.current = scanner;

        await scanner.start(
          { facingMode: "environment" },
          {
            fps: 10,
            qrbox: (width, height) => ({
              width: Math.min(Math.floor(width * 0.9), 320),
              height: Math.min(Math.floor(height * 0.45), 120),
            }),
          },
          async (barcode) => {
            if (scanHandledRef.current || disposed) return;
            scanHandledRef.current = true;

            try {
              if (scanner?.isScanning) await scanner.stop();
            } finally {
              onScanRef.current(barcode);
            }
          },
          () => undefined,
        );

        if (disposed) {
          if (scanner.isScanning) await scanner.stop();
          scanner.clear();
          return;
        }

        try {
          setTorchAvailable(scanner.getRunningTrackCameraCapabilities().torchFeature().isSupported());
        } catch {
          setTorchAvailable(false);
        }
        setStatus("scanning");
      } catch (error) {
        if (disposed) return;
        setFallbackMessage(cameraFailureMessage(error));
        setStatus("fallback");
        if (scanner?.isScanning) {
          try {
            await scanner.stop();
          } catch {
            setFallbackMessage("We couldn't start or stop the camera. Close this view and add items manually.");
          }
        }
      }
    }

    void startScanner();

    return () => {
      disposed = true;
      if (scanner?.isScanning) {
        void scanner.stop().catch(() => undefined);
      }
      scannerRef.current = null;
    };
  }, [scannerElementId]);

  async function toggleTorch() {
    const scanner = scannerRef.current;
    if (!scanner || !torchAvailable) return;

    const nextEnabled = !torchEnabled;
    setTorchError("");
    try {
      await scanner.getRunningTrackCameraCapabilities().torchFeature().apply(nextEnabled);
      setTorchEnabled(nextEnabled);
    } catch {
      setTorchError("The torch could not be changed on this camera.");
    }
  }

  return (
    <main className="flex min-h-full flex-col bg-bg px-3 py-3">
      <section className="relative flex min-h-[min(44rem,calc(100svh-6rem))] flex-1 flex-col overflow-hidden rounded-[1.4rem] border border-teal/70 bg-card">
        <header className="z-10 flex min-h-14 items-center justify-between border-b border-white/10 px-3">
          {onBack ? (
            <button
              aria-label="Back"
              className="flex h-11 w-11 items-center justify-center rounded-lg text-foreground hover:text-teal focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal"
              onClick={onBack}
              type="button"
            >
              <svg aria-hidden="true" className="h-6 w-6" viewBox="0 0 24 24" fill="none">
                <path d="m15 18-6-6 6-6M9 12h11" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" />
              </svg>
            </button>
          ) : <span className="h-11 w-11" />}

          <h1 className="text-base font-semibold">Scan barcode</h1>

          {torchAvailable ? (
            <button
              aria-label={torchEnabled ? "Turn torch off" : "Turn torch on"}
              aria-pressed={torchEnabled}
              className="flex h-11 w-11 items-center justify-center rounded-lg text-foreground hover:text-amber focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal"
              onClick={toggleTorch}
              type="button"
            >
              <svg aria-hidden="true" className="h-5 w-5" viewBox="0 0 24 24" fill="none">
                <path d="M9 2h6l-1 6 4 4H6l4-4-1-6Zm2 10-1 10m4-10 1 10" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.7" />
              </svg>
            </button>
          ) : <span className="h-11 w-11" />}
        </header>

        <div className="relative flex min-h-0 flex-1 items-center justify-center overflow-hidden bg-[#090D0F]">
          <div className="absolute inset-0 bg-gradient-to-b from-black/45 via-transparent to-black/50" />
          <div
            aria-label="Live barcode camera preview"
            className="absolute inset-0 overflow-hidden"
            id={scannerElementId}
          />

          {status !== "fallback" && (
            <div aria-hidden="true" className="pointer-events-none relative z-[1] h-48 w-[88%] max-w-[21rem]">
              <span className="absolute left-0 top-0 h-8 w-8 rounded-tl-xl border-l-2 border-t-2 border-teal" />
              <span className="absolute right-0 top-0 h-8 w-8 rounded-tr-xl border-r-2 border-t-2 border-teal" />
              <span className="absolute bottom-0 left-0 h-8 w-8 rounded-bl-xl border-b-2 border-l-2 border-teal" />
              <span className="absolute bottom-0 right-0 h-8 w-8 rounded-br-xl border-b-2 border-r-2 border-teal" />
              <span className="absolute left-3 right-3 top-1/2 h-px bg-teal/70 shadow-[0_0_12px_rgba(45,212,160,0.8)]" />
            </div>
          )}

          {status === "starting" && (
            <p className="absolute z-[2] rounded-lg bg-black/65 px-4 py-2 text-sm text-foreground">
              Starting camera…
            </p>
          )}

          {status === "fallback" && (
            <div className="relative z-[2] mx-5 max-w-sm rounded-2xl border border-white/10 bg-card px-5 py-6 text-center shadow-xl">
              <svg aria-hidden="true" className="mx-auto h-9 w-9 text-amber" viewBox="0 0 24 24" fill="none">
                <path d="M12 8v5m0 3h.01M10.3 3.9 2.8 17a2 2 0 0 0 1.7 3h15a2 2 0 0 0 1.7-3l-7.5-13.1a2 2 0 0 0-3.4 0Z" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.7" />
              </svg>
              <p className="mt-3 text-sm text-foreground/80" role="status">{fallbackMessage}</p>
              <button
                className="mt-5 min-h-12 w-full rounded-full bg-teal px-5 py-3 text-sm font-semibold text-[#041A1E] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal"
                onClick={onManualAdd}
                type="button"
              >
                Add items manually instead
              </button>
            </div>
          )}
        </div>

        <footer className="z-10 bg-bg px-5 pb-5 pt-4 text-center">
          <p className="text-sm font-semibold">
            {status === "scanning" ? "Scanning…" : status === "starting" ? "Preparing scanner…" : "Manual entry is ready"}
          </p>
          <p className="mt-2 text-sm leading-5 text-foreground/75">
            Hold steady and keep the barcode in view.
          </p>
          {torchError && (
            <p className="mt-2 text-xs text-amber" role="status">{torchError}</p>
          )}
          {status === "scanning" && (
            <button
              className="mt-3 min-h-11 rounded-full border border-teal/50 px-5 py-2 text-sm font-medium text-teal hover:bg-teal/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal"
              onClick={onManualAdd}
              type="button"
            >
              Add items manually
            </button>
          )}
        </footer>
      </section>
    </main>
  );
}
