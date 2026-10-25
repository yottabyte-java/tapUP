import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import { randomBytes } from "node:crypto";

export async function checked<R extends { data: unknown; error: unknown }>(result: R): Promise<NonNullable<R["data"]>> {
  if (result.error) throw new Error("Disposable fixture/database operation failed (details withheld)");
  return result.data as NonNullable<R["data"]>;
}

export async function provision() {
  const file = process.env.TAPUP_E2E_STATUS_FILE;
  if (!file) throw new Error("TAPUP_E2E_STATUS_FILE is required; see docs/BROWSER_TESTS.md");
  const status = JSON.parse(readFileSync(file, "utf8"));
  if (status.API_URL !== "http://127.0.0.1:54321") throw new Error("Disposable loopback Supabase required");
  const admin = createClient(status.API_URL, status.SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  const users: string[] = [];
  let shopId = "";
  async function cleanup() {
    // WHY: Delete only this fixture's IDs; never reset the local database or run the destructive demo seed.
    if (shopId) await checked(await admin.from("shops").delete().eq("id", shopId));
    for (const id of users) await checked(await admin.auth.admin.deleteUser(id));
  }
  async function user(role: "shop_owner" | "customer") {
    const email = `browser-${randomBytes(8).toString("hex")}@tapup.test`;
    const password = randomBytes(24).toString("base64url");
    const { user } = await checked(await admin.auth.admin.createUser({ email, password, email_confirm: true }));
    if (!user) throw new Error("Synthetic local Auth user was not created");
    users.push(user.id);
    await checked(await admin.from("profiles").insert({ id: user.id, role, full_name: "Synthetic browser judge" }));
    return { id: user.id, email, password };
  }
  try {
    const owner = await user("shop_owner"), customer = await user("customer"), stranger = await user("customer");
    const shop = await checked(await admin.from("shops").insert({ owner_id: owner.id, name: "Browser Demo Shop" }).select("id").single());
    shopId = shop.id;
    // This is the existing documented local Auth/link fixture, not an OTP verification assertion.
    const link = await checked(await admin.from("shop_customers").insert({ shop_id: shopId,
      customer_profile_id: customer.id, customer_phone: "+27825550111", display_name: "Demo Customer",
      consent_at: new Date().toISOString(), owner_confirmed_at: new Date().toISOString(),
    }).select("id").single());
    return { admin, owner, customer, stranger, shopId, customerId: link.id, cleanup };
  } catch (error) { await cleanup(); throw error; }
}

export function localAdmin() {
  const file = process.env.TAPUP_E2E_STATUS_FILE;
  if (!file) throw new Error("TAPUP_E2E_STATUS_FILE is required");
  const status = JSON.parse(readFileSync(file, "utf8"));
  if (status.API_URL !== "http://127.0.0.1:54321") throw new Error("Disposable loopback Supabase required");
  return createClient(status.API_URL, status.SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
}
export type Accounts = Pick<Awaited<ReturnType<typeof provision>>, "admin" | "shopId" | "customerId"> & {
  owner: { id: string }; customer: { id: string }; stranger: { id: string };
};
