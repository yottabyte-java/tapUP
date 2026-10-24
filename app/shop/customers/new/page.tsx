"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { PinPad } from "@/components/PinPad";
import { addCustomer, confirmCustomerIdentity, setCustomerPin } from "@/lib/actions/customers";

type CreatedCustomer = {
  shopCustomerId: string;
  name: string;
  phone: string;
};

function addCustomerError(error: string): string {
  if (error === "phone_already_added") return "A customer with this phone number is already on your list.";
  if (error === "invalid_input") return "Enter a name and a valid South African phone number, then confirm consent.";
  return "We couldn't add this customer. Please try again.";
}

export default function NewCustomerPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [consent, setConsent] = useState(false);
  const [customer, setCustomer] = useState<CreatedCustomer | null>(null);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [pinSaved, setPinSaved] = useState(false);
  const [identityVerified, setIdentityVerified] = useState(false);

  async function createCustomer(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!consent || saving) return;
    setError("");
    setSaving(true);
    try {
      const result = await addCustomer({ name, phone, consent });
      if (!result.ok) {
        setError(addCustomerError(result.error));
        return;
      }
      setCustomer(result);
    } catch {
      setError("We couldn't add this customer. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  async function savePin(pin: string) {
    if (!customer) return { ok: false as const, error: "customer_not_found" };
    const result = await setCustomerPin({ shopCustomerId: customer.shopCustomerId, pin });
    if (!result.ok) return result;
    setPinSaved(true);
    return { ok: true as const };
  }

  async function confirmIdentity() {
    if (!customer || !identityVerified || saving) return;
    setSaving(true);
    setError("");
    try {
      const result = await confirmCustomerIdentity({ shopCustomerId: customer.shopCustomerId });
      if (!result.ok) {
        setError("We couldn't record the identity confirmation. Please try again.");
        return;
      }
      router.replace("/shop/sell");
    } catch {
      setError("We couldn't record the identity confirmation. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  if (customer) {
    return (
      <main className="flex min-h-full flex-col px-4 py-5">
        <header className="flex min-h-11 items-center gap-3">
          <Link aria-label="Back to sell" className="flex h-11 w-11 items-center justify-center rounded-lg text-foreground hover:text-teal" href="/shop/sell">
            <span aria-hidden="true" className="text-2xl">‹</span>
          </Link>
          <h1 className="text-lg font-semibold">Set a customer PIN</h1>
        </header>
        <section className="mx-auto mt-8 w-full max-w-sm rounded-2xl border border-teal/50 bg-card px-4 py-6">
          <p className="text-center text-sm text-foreground/75">
            {customer.name} · {customer.phone}
          </p>
          {!pinSaved ? (
            <PinPad
              description="Ask the customer to enter a private 4-digit PIN on this phone."
              onSubmit={savePin}
              submitLabel="Saving PIN"
              title="Create customer PIN"
            />
          ) : (
            <div className="mt-5">
              <p className="text-center text-sm text-teal" role="status">PIN saved.</p>
              <label className="mt-5 flex cursor-pointer items-start gap-3 text-sm leading-relaxed">
                <input
                  checked={identityVerified}
                  className="mt-0.5 h-5 w-5 shrink-0 accent-teal"
                  onChange={(event) => setIdentityVerified(event.target.checked)}
                  type="checkbox"
                />
                <span>I verified this customer&apos;s identity in person and confirm the shop record belongs to them.</span>
              </label>
              <button
                className="mt-5 min-h-12 w-full rounded-full bg-teal px-5 text-sm font-semibold text-[#041A1E] disabled:opacity-40"
                disabled={!identityVerified || saving}
                onClick={() => void confirmIdentity()}
                type="button"
              >
                {saving ? "Recording confirmation…" : "Confirm customer identity"}
              </button>
              {error && <p className="mt-3 text-sm text-red-200" role="alert">{error}</p>}
            </div>
          )}
        </section>
      </main>
    );
  }

  return (
    <main className="flex min-h-full flex-col px-4 py-5">
      <header className="flex min-h-11 items-center gap-3">
        <Link aria-label="Back to sell" className="flex h-11 w-11 items-center justify-center rounded-lg text-foreground hover:text-teal" href="/shop/sell">
          <span aria-hidden="true" className="text-2xl">‹</span>
        </Link>
        <h1 className="text-lg font-semibold">Add New Customer</h1>
      </header>

      <form className="mt-6 flex flex-1 flex-col" onSubmit={createCustomer}>
        <label className="text-xs font-medium" htmlFor="customer-name">Full name</label>
        <input
          autoComplete="name"
          className="mt-2 min-h-12 rounded-xl border border-teal/50 bg-card px-3 text-sm outline-none focus:border-teal"
          id="customer-name"
          maxLength={60}
          onChange={(event) => setName(event.target.value)}
          placeholder="e.g. Thabo M."
          required
          value={name}
        />

        <label className="mt-5 text-xs font-medium" htmlFor="customer-phone">Phone number</label>
        <input
          autoComplete="tel"
          className="mt-2 min-h-12 rounded-xl border border-teal/50 bg-card px-3 text-sm outline-none focus:border-teal"
          id="customer-phone"
          inputMode="tel"
          onChange={(event) => setPhone(event.target.value)}
          placeholder="e.g. 078 123 4567"
          required
          value={phone}
        />

        <fieldset className="mt-5">
          <legend className="text-xs font-semibold">POPIA consent <span aria-hidden="true" className="text-teal">ⓘ</span></legend>
          <label className="mt-2 flex cursor-pointer items-start gap-2.5 text-xs leading-relaxed">
            <input
              checked={consent}
              className="mt-0.5 h-5 w-5 shrink-0 accent-teal"
              onChange={(event) => setConsent(event.target.checked)}
              type="checkbox"
            />
            <span>I confirm that I have the customer&apos;s consent to collect and store their personal information for this service.</span>
          </label>
        </fieldset>

        {error && (
          <p className="mt-4 rounded-lg border border-red-400/30 bg-red-950/20 px-3 py-2 text-sm text-red-200" role="alert">
            {error}
          </p>
        )}

        <button
          className="mt-6 min-h-12 rounded-full bg-teal px-5 py-3 text-sm font-semibold text-[#041A1E] disabled:cursor-not-allowed disabled:opacity-40"
          disabled={!consent || saving}
          type="submit"
        >
          {saving ? "Adding customer…" : "Next"}
        </button>
        <p className="mt-6 text-center text-xs text-foreground/70">
          The customer will set a 4-digit PIN on this phone.
        </p>
      </form>
    </main>
  );
}
