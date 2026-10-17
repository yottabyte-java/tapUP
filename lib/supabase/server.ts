import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

// WHY: Server Components, Server Actions, and Route Handlers use cookies to keep the user's session.
export async function createClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    throw new Error("Supabase server configuration is missing");
  }

  const cookieStore = await cookies();
  return createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, options);
          });
        } catch {
          // WHY: Server Components cannot write cookies; session refresh belongs in proxy or a writable handler.
        }
      },
    },
  });
}
