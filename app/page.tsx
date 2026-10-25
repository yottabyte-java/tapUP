import { Suspense } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { createClient } from "@/lib/supabase/server";

function SpazaIllustration() {
  return (
    <svg
      aria-label="Neighbourhood spaza shop with a tapUP payment QR"
      className="h-auto w-full max-w-[330px]"
      role="img"
      viewBox="0 0 340 220"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path d="M18 179h304" stroke="#00D6B0" strokeLinecap="round" strokeWidth="2" opacity=".75" />
      <path d="m39 103 22-30 28-16m-37 43 30-37m-18 41 31-33m162 32 17-29 29-18m-35 45 25-36m-11 41 28-33" fill="none" stroke="#00BFA5" strokeLinecap="round" strokeWidth="1.5" opacity=".55" />
      <path d="m69 96 20-36h150l21 36v83H69z" fill="#102B31" stroke="#00CDB0" strokeWidth="2" />
      <path d="m57 98 18-39h178l21 39z" fill="#03C9A8" stroke="#00E0BA" strokeWidth="2" />
      <path d="m78 62-12 32h27l12-35zm50-2-4 34h30l-1-34zm57 0 5 34h30l-9-34zm51 0 16 34h19l-16-34z" fill="#10232A" />
      <path d="M57 98h217" stroke="#F5B83D" strokeLinecap="round" strokeWidth="3" />
      <path d="M87 109h54v47H87z" fill="#07171E" stroke="#00D6B0" strokeWidth="2" />
      <path d="M95 116h16v32H95zm22 0h17v18h-17z" fill="#132D33" stroke="#F5B83D" strokeWidth="1.5" />
      <path d="M119 140h12v8h-12z" fill="#00D6B0" />
      <path d="M151 108h48v71h-48z" fill="#07171E" stroke="#00D6B0" strokeWidth="2" />
      <path d="M158 117h34v55h-34z" fill="#112B32" stroke="#F5B83D" strokeWidth="1.5" />
      <path d="M163 123h23v15h-23z" fill="#00C9A6" opacity=".85" />
      <path d="M163 144h22m-22 5h17" stroke="#E9F5F2" strokeLinecap="round" strokeWidth="1.5" />
      <path d="M207 112h34v67h-34z" fill="#07171E" stroke="#00D6B0" strokeWidth="2" />
      <path d="M213 119h22v50h-22z" fill="#122C33" stroke="#F5B83D" strokeWidth="1.5" />
      <path d="M218 125h12v12h-12z" fill="#00D6B0" />
      <path d="m220 127 3 3 5-6m-10 15h12" fill="none" stroke="#07171E" strokeWidth="1.5" />
      <path d="M79 101h157" stroke="#F3F7F5" strokeWidth="1.5" opacity=".6" />
      <rect x="95" y="79" width="94" height="27" rx="4" fill="#07171E" stroke="#F5B83D" strokeWidth="2" />
      <text x="142" y="97" fill="#F5B83D" fontSize="14" fontWeight="700" textAnchor="middle">SPAZA</text>
      <path d="m176 78 18-15 16-2" fill="none" stroke="#00D6B0" strokeWidth="2" />
      <path d="m198 56 11 5-9 8" fill="#00D6B0" />
      <path d="M248 141h29l-4 28h-20z" fill="#07171E" stroke="#F5B83D" strokeWidth="2" />
      <path d="M245 136h38l-4 5h-30z" fill="#F5B83D" />
      <circle cx="258" cy="174" r="5" fill="#07171E" stroke="#00D6B0" strokeWidth="2" />
      <circle cx="273" cy="174" r="5" fill="#07171E" stroke="#00D6B0" strokeWidth="2" />
      <path d="M255 146h18m-16 5h16" stroke="#00D6B0" strokeWidth="1.5" />
      <path d="M226 150h20" stroke="#00D6B0" strokeLinecap="round" strokeWidth="2" />
      <rect x="230" y="132" width="28" height="46" rx="4" fill="#06252B" stroke="#00E0BA" strokeWidth="2" />
      <rect x="235" y="137" width="18" height="21" rx="2" fill="#F3F7F5" />
      <path d="M238 140h5v5h-5zm8 0h4v4h-4zm-8 8h3v6h-3zm5-1h7v3h-7zm-4 7h4v3h-4z" fill="#07171E" />
      <path d="M239 166h10" stroke="#00D6B0" strokeLinecap="round" strokeWidth="2" />
    </svg>
  );
}

async function RedirectSignedInUser(): Promise<null> {
  // WHY: This session-aware redirect must wait for a request instead of running during prerendering.
  await connection();
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();

  // WHY: Treat only an absent session as logged out; unexpected auth failures should not look like a successful sign-out.
  if (authError && authError.name !== "AuthSessionMissingError") {
    throw authError;
  }

  if (user) {
    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();

    if (profileError) {
      throw profileError;
    }

    if (profile.role === "shop_owner") {
      redirect("/shop/sell");
    }
    if (profile.role === "customer") {
      redirect("/me");
    }

    throw new Error("Account profile has an unsupported role");
  }

  return null;
}

function SessionCheckFallback() {
  return (
    <p className="mt-4 text-sm text-foreground/70" role="status">
      Checking your sign-in…
    </p>
  );
}

function Splash() {
  return (
    <main className="flex min-h-full flex-col px-3 py-3 text-center">
      <section className="flex min-h-full flex-1 flex-col items-center rounded-[1.4rem] border border-teal/70 px-4 pb-4 pt-3">
        <div aria-hidden="true" className="flex h-6 w-full items-center justify-between px-5 text-[10px] font-semibold text-foreground">
          <span>9:41</span>
          <span className="flex items-center gap-1">
            <svg className="h-3 w-8" viewBox="0 0 32 12" fill="none">
              <path d="M2 10V7m5 3V5m5 5V3m5 7V1" stroke="currentColor" strokeLinecap="round" strokeWidth="2" />
              <path d="M22 4c2-2 5-2 7 0m-5 3c1-1 2-1 3 0" stroke="currentColor" strokeLinecap="round" strokeWidth="1.5" />
              <rect x="23" y="8" width="7" height="3" rx="1" fill="currentColor" />
            </svg>
          </span>
        </div>

        <div className="mt-5 flex items-center text-[3.25rem] font-bold leading-none tracking-tight">
          <span className="text-foreground">tap</span>
          <span className="text-teal">UP</span>
          <svg aria-hidden="true" className="ml-0.5 h-7 w-7 self-start text-teal" viewBox="0 0 24 24" fill="none">
            <path d="M12 19V5m0 0L6 11m6-6 6 6" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" />
          </svg>
        </div>

        <h1 className="mt-3 text-sm font-medium text-foreground">
          The spaza tab, but with a record.
        </h1>

        <div className="my-4 flex w-full flex-1 items-center justify-center">
          <SpazaIllustration />
        </div>

        <p className="mb-1 max-w-xs text-xs font-medium leading-relaxed text-foreground">
          Build credit. Grow your shop.<br />Create opportunity.
        </p>

        <div className="mt-3 flex w-full flex-col items-center gap-2">
          <Link
            className="flex min-h-11 w-full max-w-[300px] items-center justify-center rounded-full bg-gradient-to-r from-[#00CEA8] to-[#00BFA5] px-6 py-2.5 text-sm font-semibold text-[#041A1E] shadow-[0_0_22px_rgba(0,206,168,0.18)] transition hover:brightness-110 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal"
            href="/signup"
          >
            Get started
          </Link>
          <Link
            className="flex min-h-10 items-center justify-center px-4 py-2 text-xs font-medium text-teal transition-opacity hover:opacity-80 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal"
            href="/login"
          >
            I already have an account
          </Link>
        </div>
      </section>
    </main>
  );
}

export default function Home() {
  return (
    <>
      <Splash />
      <Suspense fallback={<SessionCheckFallback />}>
        <RedirectSignedInUser />
      </Suspense>
    </>
  );
}
