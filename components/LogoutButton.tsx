"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { signOut } from "@/lib/actions/auth";

export function LogoutButton({ className = "" }: { className?: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState(false);

  function handleSignOut() {
    if (pending) return;
    setError(false);
    startTransition(async () => {
      try {
        const result = await signOut();
        if (!result.ok) {
          // WHY: Supabase may already have cleared the local cookie when remote revocation fails.
          router.refresh();
          setError(true);
          return;
        }

        router.replace("/login");
        router.refresh();
      } catch {
        router.refresh();
        setError(true);
      }
    });
  }

  return (
    <span className="inline-flex flex-col items-end">
      <button
        className={`min-h-11 rounded-full border border-white/15 px-4 text-sm font-semibold text-foreground transition hover:border-teal/60 hover:text-teal focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal disabled:cursor-wait disabled:opacity-60 ${className}`}
        disabled={pending}
        onClick={handleSignOut}
        type="button"
      >
        {pending ? "Logging out…" : "Log out"}
      </button>
      {error && <span className="mt-1 text-xs text-red-200" role="alert">Could not log out. Please try again.</span>}
    </span>
  );
}
