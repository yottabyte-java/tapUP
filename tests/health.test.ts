import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { connection } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { GET } from "@/app/api/health/route";

vi.mock("next/server", () => ({ connection: vi.fn() }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: vi.fn() }));

describe("health readiness", () => {
  const query = {
    select: vi.fn(),
    limit: vi.fn(),
    abortSignal: vi.fn(),
  };
  const from = vi.fn();

  beforeEach(() => {
    vi.resetAllMocks();
    query.select.mockReturnValue(query);
    query.limit.mockReturnValue(query);
    query.abortSignal.mockResolvedValue({ error: null });
    from.mockReturnValue(query);
    vi.mocked(createAdminClient).mockReturnValue({ from } as unknown as ReturnType<typeof createAdminClient>);
  });

  afterEach(() => vi.restoreAllMocks());

  it("returns uncached 200 after a bounded read with no record body", async () => {
    const timeout = vi.spyOn(AbortSignal, "timeout");
    const response = await GET();

    expect(connection).toHaveBeenCalledOnce();
    expect(from).toHaveBeenCalledWith("shops");
    expect(query.select).toHaveBeenCalledWith("id", { head: true });
    expect(query.limit).toHaveBeenCalledWith(1);
    expect(timeout).toHaveBeenCalledWith(3000);
    expect(query.abortSignal).toHaveBeenCalledWith(expect.any(AbortSignal));
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toEqual({ ok: true });
  });

  it("returns only a generic 503 for a database error", async () => {
    query.abortSignal.mockResolvedValue({ error: { message: "private SQL details" } });
    const response = await GET();

    expect(response.status).toBe(503);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toEqual({ ok: false });
  });

  it("returns a generic 503 when server configuration is missing", async () => {
    vi.mocked(createAdminClient).mockImplementation(() => { throw new Error("private configuration"); });
    const response = await GET();

    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ ok: false });
    expect(from).not.toHaveBeenCalled();
  });

  it.each([new Error("private network details"), new DOMException("request expired", "TimeoutError")])(
    "returns a generic 503 when the probe throws (%s)", async (error) => {
      query.abortSignal.mockRejectedValue(error);
      const response = await GET();

      expect(response.status).toBe(503);
      expect(await response.json()).toEqual({ ok: false });
    },
  );

  it("preserves Next.js request-time control instead of treating it as a backend failure", async () => {
    const frameworkControl = new Error("prerender control");
    vi.mocked(connection).mockRejectedValue(frameworkControl);

    await expect(GET()).rejects.toBe(frameworkControl);
    expect(createAdminClient).not.toHaveBeenCalled();
  });
});
