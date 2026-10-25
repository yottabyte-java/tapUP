import "server-only";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { getSupabaseProjectUrl } from "./projectUrl";

// WHY: Trusted server-only tasks use this client to bypass RLS; never import it into browser code.
export function createAdminClient() {
  const url = getSupabaseProjectUrl();
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceRoleKey) {
    throw new Error("Supabase admin configuration is missing");
  }

  return createSupabaseClient(url, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false,
    },
  });
}
