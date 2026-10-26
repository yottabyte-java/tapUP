import { describe, expect, it } from "vitest";
import { getSupabaseProjectUrl } from "@/lib/supabase/projectUrl";

describe("getSupabaseProjectUrl", () => {
  it("normalizes a project root URL and allows local HTTP roots", () => {
    expect(getSupabaseProjectUrl(" https://demo.supabase.co/ ")).toBe("https://demo.supabase.co");
    expect(getSupabaseProjectUrl("http://127.0.0.1:54321/")).toBe("http://127.0.0.1:54321");
  });

  it.each([
    "https://demo.supabase.co/rest/v1",
    "https://demo.supabase.co/auth/v1/",
    "https://demo.supabase.co/?apikey=synthetic",
    "https://demo.supabase.co/?",
    "https://demo.supabase.co/#",
    "https://user:password@demo.supabase.co/",
    "https://@demo.supabase.co/",
    "not-a-url",
    "",
  ])("rejects non-root or invalid URL configuration without echoing it", (value) => {
    expect(() => getSupabaseProjectUrl(value)).toThrow(/Supabase project URL/);
    try {
      getSupabaseProjectUrl(value);
    } catch (error) {
      if (value) expect((error as Error).message).not.toContain(value);
    }
  });
});
