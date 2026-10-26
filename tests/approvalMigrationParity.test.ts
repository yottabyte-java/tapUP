import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const schema = readFileSync("supabase/schema.sql", "utf8");
const migration = readFileSync("supabase/migrations/202610260003_complete_redeemed_qr_requests.sql", "utf8");

function functionDefinition(source: string, name: string): string | undefined {
  return source.match(new RegExp(`CREATE(?: OR REPLACE)? FUNCTION public\\.${name}\\([\\s\\S]*?\\n\\$\\$;`))?.[0]
    .replace(/^CREATE FUNCTION/, "CREATE OR REPLACE FUNCTION");
}

describe("redeemed QR completion migration", () => {
  it("matches the fresh-schema trigger and atomic approval function", () => {
    expect(functionDefinition(migration, "enforce_sale_state_transition")).toBe(
      functionDefinition(schema, "enforce_sale_state_transition"),
    );
    expect(functionDefinition(migration, "approve_tab_atomic")).toBe(
      functionDefinition(schema, "approve_tab_atomic"),
    );
  });

  it("keeps approval execution restricted to service_role", () => {
    expect(migration).toContain(
      "REVOKE ALL ON FUNCTION public.approve_tab_atomic(uuid, uuid, uuid, uuid, text, boolean, boolean) FROM PUBLIC, anon, authenticated;",
    );
    expect(migration).toContain(
      "GRANT EXECUTE ON FUNCTION public.approve_tab_atomic(uuid, uuid, uuid, uuid, text, boolean, boolean) TO service_role;",
    );
  });
});
