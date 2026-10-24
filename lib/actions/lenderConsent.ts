"use server";

import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

const consentSchema = z.object({
  shopCustomerId: z.string().uuid(),
  consent: z.boolean(),
}).strict();

export type LenderConsentResult =
  | { ok: true; consent: boolean }
  | { ok: false; error: "invalid_input" | "unauthorized" | "forbidden" | "unavailable" };

export async function setLenderSharingConsent(input: unknown): Promise<LenderConsentResult> {
  const parsed = consentSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid_input" };

  let supabase;
  try {
    supabase = await createClient();
  } catch {
    return { ok: false, error: "unavailable" };
  }

  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return { ok: false, error: "unauthorized" };

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();
  if (profileError) return { ok: false, error: "unavailable" };
  if (!profile || profile.role !== "customer") return { ok: false, error: "forbidden" };

  const { error } = await supabase.rpc("set_lender_sharing_consent", {
    target_shop_customer_id: parsed.data.shopCustomerId,
    consent_given: parsed.data.consent,
  });
  if (error) return { ok: false, error: "forbidden" };
  return { ok: true, consent: parsed.data.consent };
}
