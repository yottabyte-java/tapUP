import { createBrowserClient } from "@supabase/ssr";
import { getSupabaseProjectUrl } from "./projectUrl";

// WHY: Client Components use the public anon key; database access stays protected by RLS.
export function createClient() {
  const url = getSupabaseProjectUrl();
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!anonKey) {
    throw new Error("Supabase browser configuration is missing");
  }

  return createBrowserClient(url, anonKey);
}
