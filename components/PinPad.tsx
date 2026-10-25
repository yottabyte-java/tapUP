"use client";

import { useState } from "react";

export type PinPadResult = { ok: true } | { ok: false; error: string };

type PinPadProps = {
  disabled?: boolean;
  formatError?: (error: string) => string;
  title?: string;
  description?: string;
  submitLabel?: string;
  onSubmit: (pin: string) => Promise<PinPadResult>;
};

const keys = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "backspace", "0", "clear"] as const;

function errorMessage(error: string): string {
  if (error === "invalid_pin") return "That PIN doesn't match. Try again.";
  if (error === "pin_locked") return "Too many incorrect PIN attempts. Wait 15 minutes, then refresh this page to try again.";
  if (error === "pin_rate_limited") return "Too many PIN attempts from this device. Try again in 15 minutes.";
  if (error === "pin_not_set") return "Set up the customer's PIN before approving the tab.";
  if (error === "pin_required") return "Ask the customer to enter their PIN. Set it up first if no PIN is set.";
  return "We couldn't verify the PIN. Please try again.";
}

export function PinPad({
  disabled = false,
  formatError = errorMessage,
  title = "Customer PIN",
  description = "Ask the customer to enter their 4-digit PIN to approve this tab.",
  submitLabel = "Submit PIN",
  onSubmit,
}: PinPadProps) {
  const [pin, setPin] = useState("");
  const [message, setMessage] = useState("");
  const [locked, setLocked] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  function pressKey(key: typeof keys[number]) {
    if (disabled || submitting || locked) return;
    setMessage("");
    if (key === "backspace") {
      setPin((current) => current.slice(0, -1));
    } else if (key === "clear") {
      setPin("");
    } else {
      const nextPin = `${pin}${key}`;
      if (nextPin.length === 4) {
        void submitPin(nextPin);
      } else {
        setPin(nextPin);
      }
    }
  }

  async function submitPin(submittedPin: string) {
    if (submittedPin.length !== 4 || disabled || submitting || locked) return;
    setPin("");
    setSubmitting(true);
    try {
      const result = await onSubmit(submittedPin);
      if (!result.ok) {
        setMessage(formatError(result.error));
        if (result.error === "pin_locked") setLocked(true);
      }
    } catch {
      setMessage("We couldn't verify the PIN. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section aria-labelledby="pin-pad-title" className="w-full">
      <h2 className="text-center text-base font-semibold" id="pin-pad-title">{title}</h2>
      <p className="mt-2 text-center text-sm text-foreground/75">{description}</p>

      <div aria-label={`${pin.length} of 4 PIN digits entered`} className="mx-auto mt-5 flex max-w-56 justify-center gap-2.5">
        {Array.from({ length: 4 }, (_, index) => (
          <span
            aria-hidden="true"
            className={`flex h-12 w-12 items-center justify-center rounded-lg border ${pin.length > index ? "border-teal bg-[#10313A]" : "border-teal/50 bg-transparent"}`}
            key={index}
          >
            <span className={`h-1.5 w-1.5 rounded-full ${pin.length > index ? "bg-teal" : "bg-foreground/55"}`} />
          </span>
        ))}
        <span className="sr-only" role="status">{pin.length} of 4 digits entered</span>
      </div>

      <div aria-label="PIN keypad" className="mx-auto mt-6 grid max-w-64 grid-cols-3 gap-2">
        {keys.map((key) => (
          <button
            aria-label={key === "backspace" ? "Delete last digit" : key === "clear" ? "Clear PIN" : `Enter ${key}`}
            className="flex min-h-14 items-center justify-center rounded-xl bg-[#0C2932] text-xl font-medium text-foreground hover:bg-[#123944] focus-visible:outline-2 focus-visible:outline-teal disabled:opacity-50"
            disabled={disabled || submitting || locked}
            key={key}
            onClick={() => pressKey(key)}
            type="button"
          >
            {key === "backspace" ? "←" : key === "clear" ? "⌫" : key}
          </button>
        ))}
      </div>

      {message && (
        <p className="mt-4 text-center text-sm text-amber" role="alert">{message}</p>
      )}
      {submitting && (
        <p className="mt-3 text-center text-sm text-foreground/70" role="status">{submitLabel}…</p>
      )}
    </section>
  );
}
