import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createSessionClient: vi.fn(),
  createAdminClient: vi.fn(),
  signUp: vi.fn(),
  insert: vi.fn(),
  deleteUser: vi.fn(),
  redirect: vi.fn((path: string): never => { throw new Error(`REDIRECT:${path}`); }),
  inserted: [] as Array<{ table: string; row: Record<string, unknown> }>,
  failInsertTable: "" as string,
}));

vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.createSessionClient }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: mocks.createAdminClient }));

import { createAccount } from "@/lib/actions/signup";

const USER_ID = "10000000-0000-4000-8000-000000000001";
const PRIVATE_PASSWORD = "synthetic-private-password";

function form(role = "shop_owner") {
  const values = new FormData();
  values.set("role", role);
  values.set("name", "Demo Owner");
  values.set("email", "owner@example.test");
  values.set("password", PRIVATE_PASSWORD);
  if (role === "shop_owner") values.set("shopName", "Demo Shop");
  return values;
}

async function expectRedirect(path: string, input = form()) {
  await expect(createAccount(input)).rejects.toThrow(`REDIRECT:${path}`);
}

describe("signup server action", () => {
  let log: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    mocks.inserted.length = 0;
    mocks.failInsertTable = "";
    mocks.redirect.mockClear();
    mocks.signUp.mockReset().mockResolvedValue({
      data: { user: { id: USER_ID, identities: [{ user_id: USER_ID, provider: "email" }] }, session: null },
      error: null,
    });
    mocks.insert.mockReset().mockImplementation(async (table: string, row: Record<string, unknown>) => {
      mocks.inserted.push({ table, row });
      return { error: mocks.failInsertTable === table ? { message: "synthetic insert failure", code: "XX001" } : null };
    });
    mocks.deleteUser.mockReset().mockResolvedValue({ error: null });
    mocks.createSessionClient.mockReset().mockResolvedValue({ auth: { signUp: mocks.signUp } });
    mocks.createAdminClient.mockReset().mockReturnValue({
      from: (table: string) => ({ insert: (row: Record<string, unknown>) => mocks.insert(table, row) }),
      auth: { admin: { deleteUser: mocks.deleteUser } },
    });
    log = vi.spyOn(console, "error").mockImplementation(() => undefined);
  });

  afterEach(() => log.mockRestore());

  it("creates the owner profile and shop, then uses the email-confirmation redirect", async () => {
    await expectRedirect("/signup?status=created&role=shop_owner");

    expect(mocks.signUp).toHaveBeenCalledWith({
      email: "owner@example.test",
      password: PRIVATE_PASSWORD,
      options: { data: { full_name: "Demo Owner" } },
    });
    expect(mocks.inserted).toEqual([
      { table: "profiles", row: { id: USER_ID, role: "shop_owner", full_name: "Demo Owner" } },
      { table: "shops", row: { owner_id: USER_ID, name: "Demo Shop" } },
    ]);
  });

  it("redirects an authenticated customer when Supabase returns a session", async () => {
    mocks.signUp.mockResolvedValueOnce({
      data: { user: { id: USER_ID, identities: [{ user_id: USER_ID, provider: "email" }] }, session: { access_token: "synthetic" } }, error: null,
    });
    await expectRedirect("/me", form("customer"));
    expect(mocks.inserted).toEqual([
      { table: "profiles", row: { id: USER_ID, role: "customer", full_name: "Demo Owner" } },
    ]);
  });

  it("preserves a code actually supplied by Supabase Auth", async () => {
    mocks.signUp.mockResolvedValueOnce({ data: { user: null, session: null }, error: Object.assign(
      new Error("Auth request failed"), { status: 404, code: "AUTH_TEST_CODE" },
    ) });
    await expectRedirect("/signup?step=details&role=shop_owner&error=account");

    expect(log).toHaveBeenCalledWith("[signup] Auth user creation failed", expect.objectContaining({ status: 404, code: "AUTH_TEST_CODE" }));
    expect(mocks.createAdminClient).not.toHaveBeenCalled();
  });

  it("does not infer an error code from an HTTP status and message", async () => {
    mocks.signUp.mockResolvedValueOnce({ data: { user: null, session: null }, error: Object.assign(
      new Error("Invalid path specified in request URL"), { status: 404 },
    ) });
    await expectRedirect("/signup?step=details&role=shop_owner&error=account");

    expect(log).toHaveBeenCalledWith("[signup] Auth user creation failed", expect.objectContaining({ status: 404, code: "unknown" }));
  });

  it("does not provision or delete the obfuscated existing-email response", async () => {
    mocks.signUp.mockResolvedValueOnce({
      data: { user: { id: USER_ID, identities: [] }, session: null }, error: null,
    });
    await expectRedirect("/signup?step=details&role=shop_owner&error=account");

    expect(mocks.createAdminClient).not.toHaveBeenCalled();
    expect(mocks.inserted).toEqual([]);
    expect(mocks.deleteUser).not.toHaveBeenCalled();
  });

  it("rejects a user object without a matching email identity before provisioning", async () => {
    mocks.signUp.mockResolvedValueOnce({
      data: { user: { id: USER_ID, identities: [{ user_id: USER_ID, provider: "google" }] }, session: null }, error: null,
    });
    await expectRedirect("/signup?step=details&role=shop_owner&error=account");

    expect(mocks.createAdminClient).not.toHaveBeenCalled();
    expect(mocks.inserted).toEqual([]);
    expect(mocks.deleteUser).not.toHaveBeenCalled();
  });

  it("classifies a thrown Auth exception at the Auth stage", async () => {
    mocks.signUp.mockRejectedValueOnce(new Error("synthetic Auth transport failure"));
    await expectRedirect("/signup?step=details&role=shop_owner&error=unavailable");
    expect(log).toHaveBeenCalledWith("[signup] Auth user creation failed", expect.objectContaining({ message: "synthetic Auth transport failure" }));
    expect(mocks.createAdminClient).not.toHaveBeenCalled();
  });

  it("classifies missing server configuration before making an Auth request", async () => {
    mocks.createSessionClient.mockRejectedValueOnce(new Error("Supabase project URL must be an HTTP(S) project root URL"));
    await expectRedirect("/signup?step=details&role=shop_owner&error=unavailable");
    expect(log).toHaveBeenCalledWith("[signup] Auth client initialization failed", expect.any(Object));
    expect(mocks.signUp).not.toHaveBeenCalled();
  });

  it("reports profile setup failure without deleting an Auth user of unproven ownership", async () => {
    mocks.failInsertTable = "profiles";
    await expectRedirect("/signup?step=details&role=shop_owner&error=setup");

    expect(log).toHaveBeenCalledWith("[signup] Profile insert failed", expect.any(Object));
    expect(log).not.toHaveBeenCalledWith("[signup] Auth user creation failed", expect.anything());
    expect(mocks.deleteUser).not.toHaveBeenCalled();
  });

  it("reports shop insertion failure after profile insertion without deleting an ambiguous Auth user", async () => {
    mocks.failInsertTable = "shops";
    await expectRedirect("/signup?step=details&role=shop_owner&error=setup");

    expect(mocks.inserted.map(({ table }) => table)).toEqual(["profiles", "shops"]);
    expect(log).toHaveBeenCalledWith("[signup] Shop insert failed", expect.any(Object));
    expect(mocks.deleteUser).not.toHaveBeenCalled();
  });

  it("does not include submitted credentials in logs or redirects", async () => {
    mocks.signUp.mockResolvedValueOnce({ data: { user: null, session: null }, error: Object.assign(
      new Error(`owner@example.test password=${PRIVATE_PASSWORD}`), { status: 400 },
    ) });
    await expectRedirect("/signup?step=details&role=shop_owner&error=account");

    const logged = JSON.stringify(log.mock.calls);
    expect(logged).not.toContain("owner@example.test");
    expect(logged).not.toContain(PRIVATE_PASSWORD);
    expect(mocks.redirect.mock.calls.flat().join(" ")).not.toContain(PRIVATE_PASSWORD);
  });

  it("retains strict signup validation and the selected role on validation errors", async () => {
    const invalid = form();
    invalid.set("name", "x");
    await expectRedirect("/signup?step=details&role=shop_owner&error=invalid-details", invalid);
    expect(mocks.createSessionClient).not.toHaveBeenCalled();
  });
});
