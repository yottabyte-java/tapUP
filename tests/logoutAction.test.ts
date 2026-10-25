import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { createClient, signOut, revalidatePath } = vi.hoisted(() => ({
  createClient: vi.fn(),
  signOut: vi.fn(),
  revalidatePath: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({ createClient }));
vi.mock("next/cache", () => ({ revalidatePath }));

import { signOut as signOutAction } from "@/lib/actions/auth";

beforeEach(() => {
  vi.clearAllMocks();
  createClient.mockResolvedValue({ auth: { signOut } });
  signOut.mockResolvedValue({ error: null });
});
afterEach(() => vi.restoreAllMocks());

describe("sign-out server action", () => {
  it("clears the Supabase session and invalidates protected route output", async () => {
    await expect(signOutAction()).resolves.toEqual({ ok: true });

    expect(signOut).toHaveBeenCalledOnce();
    expect(revalidatePath).toHaveBeenCalledWith("/", "layout");
  });

  it("returns a safe failure result and does not invalidate as if logout succeeded", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    signOut.mockResolvedValueOnce({ error: Object.assign(new Error("private provider details"), { code: "AUTH_TEST", status: 503 }) });

    await expect(signOutAction()).resolves.toEqual({ ok: false });

    expect(revalidatePath).not.toHaveBeenCalled();
    expect(log).toHaveBeenCalledWith("[auth] Sign out failed", {
      code: "AUTH_TEST", status: 503, errorName: "Error",
    });
    expect(JSON.stringify(log.mock.calls)).not.toContain("private provider details");
  });
});
