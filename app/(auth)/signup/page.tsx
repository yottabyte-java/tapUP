import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

const roleSchema = z.enum(["shop_owner", "customer"]);

const signupSchema = z.object({
  role: roleSchema,
  name: z.string().trim().min(2).max(120),
  email: z.string().trim().email().max(254),
  password: z.string().min(8).max(128),
  shopName: z.string().trim().min(1).max(120).optional(),
}).strict().refine(
  (data) => data.role !== "shop_owner" || Boolean(data.shopName),
  { path: ["shopName"], message: "Enter your shop name." },
);

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

  async function createAccount(formData: FormData) {
    "use server";

    const parsed = signupSchema.safeParse({
      role: formData.get("role"),
      name: formData.get("name"),
      email: formData.get("email"),
      password: formData.get("password"),
      shopName: formData.get("shopName") || undefined,
    });

    if (!parsed.success) {
      const role = roleSchema.safeParse(formData.get("role"));
      redirect(`/signup?step=details&role=${role.success ? role.data : "customer"}&error=invalid-details`);
    }

    const { role, name, email, password, shopName } = parsed.data;
    const emailDomain = email.split("@")[1] ?? "unknown";
    function logFailure(step: string, error: unknown) {
      const details = error !== null && typeof error === "object"
        ? error
        : {};
      const rawMessage = "message" in details && typeof details.message === "string"
        ? details.message
        : error instanceof Error ? error.message : "Unknown error";
      const code = "code" in details && typeof details.code === "string"
        ? details.code
        : "unknown";
      const message = rawMessage
        .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, "[redacted email]")
        .replace(/\bBearer\s+\S+/gi, "Bearer [redacted]")
        .replace(/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g, "[redacted token]")
        .replace(/\b(password|token|secret)\s*[:=]\s*\S+/gi, "$1=[redacted]");

      console.error(`[signup] ${step} failed`, { message, code, emailDomain });
    }

    let authClient;
    try {
      authClient = await createClient();
    } catch (error) {
      logFailure("Auth client initialization", error);
      redirect(`/signup?step=details&role=${role}&error=unavailable`);
    }

    let signupResult;
    try {
      signupResult = await authClient.auth.signUp({
        email,
        password,
        options: { data: { full_name: name } },
      });
    } catch (error) {
      logFailure("Auth user creation", error);
      redirect(`/signup?step=details&role=${role}&error=unavailable`);
    }

    if (signupResult.error || !signupResult.data.user) {
      if (signupResult.error) {
        logFailure("Auth user creation", signupResult.error);
      } else {
        logFailure("Auth user creation", new Error("Supabase returned no user and no error"));
      }
      redirect(`/signup?step=details&role=${role}&error=account`);
    }

    const userId = signupResult.data.user.id;
    let setupSucceeded = false;
    let adminClient;
    let setupStep = "Admin client initialization";
    try {
      adminClient = createAdminClient();
      setupStep = "Profile insert";
      const { error: profileError } = await adminClient.from("profiles").insert({
        id: userId,
        role,
        full_name: name,
      });

      if (profileError) {
        logFailure("Profile insert", profileError);
      } else if (role === "shop_owner") {
        setupStep = "Shop insert";
        const { error: shopError } = await adminClient.from("shops").insert({
          owner_id: userId,
          name: shopName,
        });
        if (shopError) {
          logFailure("Shop insert", shopError);
        } else {
          setupSucceeded = true;
        }
      } else {
        setupSucceeded = true;
      }
    } catch (error) {
      logFailure(setupStep, error);
      setupSucceeded = false;
    }

    if (!setupSucceeded) {
      let cleanupFailed = false;
      try {
        const cleanupClient = adminClient ?? createAdminClient();
        const { error: cleanupError } = await cleanupClient.auth.admin.deleteUser(userId);
        if (cleanupError) {
          logFailure("Auth user rollback", cleanupError);
        }
        cleanupFailed = Boolean(cleanupError);
      } catch (error) {
        logFailure("Auth user rollback", error);
        cleanupFailed = true;
      }
      if (cleanupFailed) {
        redirect(`/signup?step=details&role=${role}&error=cleanup`);
      }
      redirect(`/signup?step=details&role=${role}&error=setup`);
    }

    // WHY: Auth confirmation settings decide whether signup also creates an active session.
    if (signupResult.data.session) {
      redirect(role === "shop_owner" ? "/shop/sell" : "/me");
    }

    redirect(`/signup?status=created&role=${role}`);
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
