import { connection } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

/** Check live database readiness without disclosing records or failure details. */
export async function GET(): Promise<Response> {
  // WHY: Readiness must run per request, never during a build or from a cached response.
  await connection();

  let ok = false;
  try {
    // WHY: A bounded HEAD query checks the configured backend without returning shop data.
    const { error } = await createAdminClient()
      .from("shops")
      .select("id", { head: true })
      .limit(1)
      .abortSignal(AbortSignal.timeout(3000));
    ok = !error;
  } catch {
    // WHY: Configuration, network and timeout failures have the same safe public response.
    ok = false;
  }

  return Response.json({ ok }, {
    status: ok ? 200 : 503,
    headers: { "Cache-Control": "no-store" },
  });
}
