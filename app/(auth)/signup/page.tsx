import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { z } from "zod";
import { createAccount } from "@/lib/actions/signup";

const roleSchema = z.enum(["shop_owner", "customer"]);

type SignupPageProps = {
  searchParams: Promise<{
    step?: string;
    role?: string;
    error?: string;
    status?: string;
  }>;
};

async function SignupPageContent({ searchParams }: SignupPageProps) {
  const params = await searchParams;
  const isDetailsStep = params.step === "details" && roleSchema.safeParse(params.role).success;
  const selectedRole = roleSchema.safeParse(params.role).success ? params.role : null;

  async function chooseRole(formData: FormData) {
    "use server";

    const parsedRole = roleSchema.safeParse(formData.get("role"));
    if (!parsedRole.success) {
      redirect("/signup?error=invalid-role");
    }

    redirect(`/signup?step=details&role=${parsedRole.data}`);
  }

  const errorMessages: Record<string, string> = {
    "invalid-role": "Choose whether you are a shop owner or a customer.",
    "invalid-details": "Check your details and try again. Passwords need at least 8 characters.",
    account: "We couldn't create that account. Check the email address and try again.",
    setup: "We couldn't finish setting up your account. Please try again or contact support.",
    cleanup: "Account setup was incomplete and needs support. Please contact us before trying again.",
    unavailable: "Sign-up is temporarily unavailable. Check your connection and try again.",
  };
  const errorMessage = params.error ? errorMessages[params.error] : undefined;

  return (
    <main className="flex min-h-full flex-col px-3 py-3">
      <section className="auth-panel flex min-h-full flex-1 flex-col rounded-[1.4rem] border border-teal/70 px-5 pb-6 pt-4">
        <Link
          aria-label="Back to home"
          className="flex h-11 w-11 items-center text-foreground transition-opacity hover:opacity-80 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal"
          href="/"
        >
          <svg aria-hidden="true" className="h-6 w-6" viewBox="0 0 24 24" fill="none">
            <path d="m15 18-6-6 6-6M9 12h11" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" />
          </svg>
        </Link>

        <div className="mt-2 flex items-center justify-center text-3xl font-bold tracking-tight">
          <span className="text-foreground">tap</span>
          <span className="text-teal">UP</span>
          <svg aria-hidden="true" className="ml-0.5 h-4 w-4 self-start text-teal" viewBox="0 0 24 24" fill="none">
            <path d="M12 19V5m0 0L6 11m6-6 6 6" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" />
          </svg>
        </div>

        {params.status === "created" ? (
          <div className="mt-8">
            <h1 className="text-xl font-semibold">Account created</h1>
            <p className="mt-2 text-sm text-foreground/75">
              Your profile{selectedRole === "shop_owner" ? " and shop" : ""} are ready.
              If email confirmation is enabled, check your inbox before signing in.
            </p>
            <Link
              className="mt-6 flex min-h-12 w-full items-center justify-center rounded-full bg-gradient-to-r from-[#00CEA8] to-[#00BFA5] px-6 py-3 text-sm font-semibold text-[#041A1E] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal"
              href="/login"
            >
              Go to sign in
            </Link>
          </div>
        ) : isDetailsStep && selectedRole ? (
          <>
            <header className="mt-7">
              <h1 className="text-xl font-semibold">Create your account</h1>
              <p className="mt-1 text-sm text-foreground/75">
                {selectedRole === "shop_owner" ? "Set up your shop owner account." : "Set up your customer account."}
              </p>
            </header>

            <form action={createAccount} className="mt-6 flex flex-col gap-3">
              <input name="role" type="hidden" value={selectedRole} />
              <label className="flex flex-col gap-1 text-sm">
                Full name
                <input
                  autoComplete="name"
                  className="min-h-12 rounded-xl border border-teal/40 bg-card/70 px-4 py-3 text-foreground outline-none placeholder:text-foreground/55 focus:border-teal focus:ring-2 focus:ring-teal/25"
                  maxLength={120}
                  name="name"
                  placeholder="Your name"
                  required
                  type="text"
                />
              </label>
              {selectedRole === "shop_owner" && (
                <label className="flex flex-col gap-1 text-sm">
                  Shop name
                  <input
                    autoComplete="organization"
                    className="min-h-12 rounded-xl border border-teal/40 bg-card/70 px-4 py-3 text-foreground outline-none placeholder:text-foreground/55 focus:border-teal focus:ring-2 focus:ring-teal/25"
                    maxLength={120}
                    name="shopName"
                    placeholder="Your shop name"
                    required
                    type="text"
                  />
                </label>
              )}
              <label className="flex flex-col gap-1 text-sm">
                Email address
                <input
                  autoComplete="email"
                  className="min-h-12 rounded-xl border border-teal/40 bg-card/70 px-4 py-3 text-foreground outline-none placeholder:text-foreground/55 focus:border-teal focus:ring-2 focus:ring-teal/25"
                  maxLength={254}
                  name="email"
                  placeholder="Email address"
                  required
                  type="email"
                />
              </label>
              <label className="flex flex-col gap-1 text-sm">
                Password
                <input
                  autoComplete="new-password"
                  className="min-h-12 rounded-xl border border-teal/40 bg-card/70 px-4 py-3 text-foreground outline-none placeholder:text-foreground/55 focus:border-teal focus:ring-2 focus:ring-teal/25"
                  minLength={8}
                  name="password"
                  placeholder="At least 8 characters"
                  required
                  type="password"
                />
              </label>

              {errorMessage && (
                <p className="rounded-lg border border-red-400/40 bg-red-950/30 px-3 py-2 text-sm text-red-200" role="alert">
                  {errorMessage}
                </p>
              )}

              <button
                className="mt-1 flex min-h-12 w-full items-center justify-center rounded-full bg-gradient-to-r from-[#00CEA8] to-[#00BFA5] px-6 py-3 text-sm font-semibold text-[#041A1E] shadow-[0_0_22px_rgba(0,206,168,0.18)] transition hover:brightness-110 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal"
                type="submit"
              >
                Create account
              </button>
            </form>
            <Link
              className="mt-4 self-center text-sm text-teal hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal"
              href="/signup"
            >
              Choose a different account type
            </Link>
          </>
        ) : (
          <>
            <header className="mt-7">
              <h1 className="text-xl font-semibold">Create your account</h1>
              <p className="mt-1 text-sm text-foreground/75">Are you a shop owner or a customer?</p>
            </header>

            <form action={chooseRole} className="mt-6 flex flex-col gap-3">
              <button
                className="min-h-20 rounded-xl border border-teal/50 bg-card/70 p-4 text-left transition hover:border-teal focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal"
                name="role"
                type="submit"
                value="shop_owner"
              >
                <span className="block font-semibold">Shop owner</span>
                <span className="mt-1 block text-sm text-foreground/70">Manage your shop, sales and customers.</span>
              </button>
              <button
                className="min-h-20 rounded-xl border border-teal/50 bg-card/70 p-4 text-left transition hover:border-teal focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal"
                name="role"
                type="submit"
                value="customer"
              >
                <span className="block font-semibold">Customer</span>
                <span className="mt-1 block text-sm text-foreground/70">Get access to your tab and buying power.</span>
              </button>
              {errorMessage && (
                <p className="rounded-lg border border-red-400/40 bg-red-950/30 px-3 py-2 text-sm text-red-200" role="alert">
                  {errorMessage}
                </p>
              )}
            </form>
          </>
        )}

        <div className="mt-auto pt-8 text-center text-xs text-foreground/80">
          Already have an account?{" "}
          <Link className="font-semibold text-teal hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal" href="/login">
            Sign in
          </Link>
        </div>
      </section>
    </main>
  );
}

export default function SignupPage(props: SignupPageProps) {
  return (
    <Suspense fallback={<main className="min-h-full px-3 py-3" />}>
      <SignupPageContent searchParams={props.searchParams} />
    </Suspense>
  );
}
