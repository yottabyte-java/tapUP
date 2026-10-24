"use server";

import { headers } from "next/headers";
import { z } from "zod";
import { checkRateLimit, getClientIp, RATE_LIMITS } from "@/lib/rateLimit";
import { createClient } from "@/lib/supabase/server";

const signInSchema = z.object({
  email: z.string().trim().email().max(254),
  password: z.string().min(1).max(256),
}).strict();

type SignInResult =
  | { ok: true; role: "shop_owner" | "customer" }
  | { ok: false; error: "invalid_input" | "rate_limited" | "invalid_credentials" | "unavailable" };

export async function signIn(input: unknown): Promise<SignInResult> {
  const parsed = signInSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid_input" };

  const requestHeaders = await headers();
  const rateLimit = checkRateLimit(
    getClientIp(requestHeaders),
    "login",
    RATE_LIMITS.login,
  );
  if (!rateLimit.allowed) return { ok: false, error: "rate_limited" };

  let supabase;
  try {
    supabase = await createClient();
  } catch {
    return { ok: false, error: "unavailable" };
  }

  const { data, error } = await supabase.auth.signInWithPassword({
    email: parsed.data.email,
    password: parsed.data.password,
  });
  if (error || !data.user) {
    // WHY: One response for bad credentials avoids revealing whether an email belongs to an account.
    return { ok: false, error: "invalid_credentials" };
  }

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", data.user.id)
    .maybeSingle();
  if (profileError || !profile || (profile.role !== "shop_owner" && profile.role !== "customer")) {
    await supabase.auth.signOut();
    return { ok: false, error: "unavailable" };
  }

  return { ok: true, role: profile.role };
}
