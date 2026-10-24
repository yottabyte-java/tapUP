"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { signIn } from "@/lib/actions/auth";

const INVALID_CREDENTIALS_MESSAGE = "Email or password is incorrect.";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsLoading(true);
    setErrorMessage("");

    try {
      const result = await signIn({ email, password });
      if (!result.ok && result.error === "rate_limited") {
        setErrorMessage("Too many sign-in attempts. Please wait 15 minutes and try again.");
        return;
      }
      if (!result.ok && result.error === "invalid_credentials") {
        // WHY: A shared message prevents the login form from revealing whether an email exists.
        setErrorMessage(INVALID_CREDENTIALS_MESSAGE);
        return;
      }
      if (!result.ok) {
        setErrorMessage("We couldn't load your account. Please try again.");
        return;
      }

      if (result.role === "shop_owner") {
        router.replace("/shop/sell");
      } else {
        router.replace("/me");
      }

      // WHY: Refresh server-rendered routes so they see the session cookie just established by Supabase.
      router.refresh();
    } catch {
      setErrorMessage("Sign-in is temporarily unavailable. Check your connection and try again.");
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <main className="flex min-h-full flex-col px-3 py-3">
      <section className="flex min-h-full flex-1 flex-col rounded-[1.4rem] border border-teal/70 px-5 pb-6 pt-4">
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

        <header className="mt-7">
          <h1 className="text-xl font-semibold">Welcome back</h1>
          <p className="mt-1 text-sm text-foreground/75">Sign in to your account</p>
        </header>

        <form className="mt-6 flex flex-col gap-3" onSubmit={handleSubmit}>
          <div className="relative">
            <label className="sr-only" htmlFor="email">Email address</label>
            <svg aria-hidden="true" className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-foreground/70" viewBox="0 0 24 24" fill="none">
              <rect x="3" y="5" width="18" height="14" rx="2" stroke="currentColor" strokeWidth="1.6" />
              <path d="m4 7 8 6 8-6" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.6" />
            </svg>
            <input
              autoComplete="username"
              className="min-h-12 w-full rounded-xl border border-teal/40 bg-card/70 py-3 pl-11 pr-4 text-sm text-foreground outline-none placeholder:text-foreground/55 focus:border-teal focus:ring-2 focus:ring-teal/25"
              id="email"
              name="email"
              onChange={(event) => setEmail(event.target.value)}
              placeholder="Email address"
              required
              type="email"
              value={email}
            />
          </div>

          <div className="relative">
            <label className="sr-only" htmlFor="password">Password</label>
            <svg aria-hidden="true" className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-foreground/70" viewBox="0 0 24 24" fill="none">
              <rect x="4" y="10" width="16" height="11" rx="2" stroke="currentColor" strokeWidth="1.6" />
              <path d="M8 10V7a4 4 0 1 1 8 0v3" stroke="currentColor" strokeWidth="1.6" />
            </svg>
            <input
              autoComplete="current-password"
              className="min-h-12 w-full rounded-xl border border-teal/40 bg-card/70 py-3 pl-11 pr-12 text-sm text-foreground outline-none placeholder:text-foreground/55 focus:border-teal focus:ring-2 focus:ring-teal/25"
              id="password"
              name="password"
              onChange={(event) => setPassword(event.target.value)}
              placeholder="Password"
              required
              type={showPassword ? "text" : "password"}
              value={password}
            />
            <button
              aria-label={showPassword ? "Hide password" : "Show password"}
              aria-pressed={showPassword}
              className="absolute right-2 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-lg text-foreground/70 transition-colors hover:text-teal focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-teal"
              onClick={() => setShowPassword((visible) => !visible)}
              type="button"
            >
              <svg aria-hidden="true" className="h-5 w-5" viewBox="0 0 24 24" fill="none">
                {showPassword ? (
                  <>
                    <path d="M3 3l18 18M10.6 10.6a2 2 0 0 0 2.8 2.8" stroke="currentColor" strokeLinecap="round" strokeWidth="1.6" />
                    <path d="M9.9 5.2A10.8 10.8 0 0 1 12 5c5.3 0 9 5 9 7a8.7 8.7 0 0 1-2.2 3.4M6.2 6.2C3.9 7.8 3 10.3 3 12c0 2 3.7 7 9 7 1.1 0 2.1-.2 3-.6" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.6" />
                  </>
                ) : (
                  <>
                    <path d="M3 12s3.2-7 9-7 9 7 9 7-3.2 7-9 7-9-7-9-7Z" stroke="currentColor" strokeLinejoin="round" strokeWidth="1.6" />
                    <circle cx="12" cy="12" r="2.5" stroke="currentColor" strokeWidth="1.6" />
                  </>
                )}
              </svg>
            </button>
          </div>

          {errorMessage && (
            <p className="rounded-lg border border-red-400/40 bg-red-950/30 px-3 py-2 text-sm text-red-200" role="alert">
              {errorMessage}
            </p>
          )}

          <button
            className="mt-1 flex min-h-12 w-full items-center justify-center rounded-full bg-gradient-to-r from-[#00CEA8] to-[#00BFA5] px-6 py-3 text-sm font-semibold text-[#041A1E] shadow-[0_0_22px_rgba(0,206,168,0.18)] transition hover:brightness-110 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal disabled:cursor-not-allowed disabled:opacity-60"
            disabled={isLoading}
            type="submit"
          >
            {isLoading ? "Signing in…" : "Sign in"}
          </button>
        </form>

        <div className="mt-auto pt-8 text-center text-xs text-foreground/80">
          Don&apos;t have an account?{" "}
          <Link className="font-semibold text-teal hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal" href="/signup">
            Sign up
          </Link>
        </div>
      </section>
    </main>
  );
}
