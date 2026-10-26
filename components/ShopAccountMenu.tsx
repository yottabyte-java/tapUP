"use client";

import Link from "next/link";
import { LogoutButton } from "@/components/LogoutButton";

export function ShopAccountMenu() {
  return (
    <details className="relative">
      <summary
        aria-label="Open shop account menu"
        className="flex h-11 w-11 cursor-pointer list-none items-center justify-center rounded-full border border-white/15 text-foreground/75 transition hover:border-teal/60 hover:text-teal focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal [&::-webkit-details-marker]:hidden"
      >
        <svg aria-hidden="true" className="h-5 w-5" viewBox="0 0 24 24" fill="none">
          <circle cx="12" cy="8" r="3.2" stroke="currentColor" strokeWidth="1.6" />
          <path d="M5.5 20a6.5 6.5 0 0 1 13 0" stroke="currentColor" strokeLinecap="round" strokeWidth="1.6" />
        </svg>
      </summary>
      <div className="absolute right-0 top-full z-30 mt-2 w-48 rounded-xl border border-white/10 bg-card p-2 shadow-xl">
        <Link className="flex min-h-11 items-center rounded-lg px-3 text-sm hover:bg-white/5 focus-visible:outline-2 focus-visible:outline-teal" href="/shop/sell">
          Shop home
        </Link>
        <div className="mt-1 border-t border-white/10 pt-2">
          <LogoutButton className="w-full border-0 text-left" />
        </div>
      </div>
    </details>
  );
}
