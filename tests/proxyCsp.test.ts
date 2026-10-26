import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { proxy } from "@/proxy";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("proxy Content-Security-Policy", () => {
  async function scriptPolicy(): Promise<string> {
    const response = await proxy(new NextRequest("http://localhost/"));
    const policy = response.headers.get("Content-Security-Policy");
    if (!policy) throw new Error("Content-Security-Policy header is missing");
    return policy.split(";").map((directive) => directive.trim())
      .find((directive) => directive.startsWith("script-src ")) ?? "";
  }

  it("allows React's eval-based debugging only in development", async () => {
    vi.stubEnv("NODE_ENV", "development");
    expect(await scriptPolicy()).toBe("script-src 'self' 'unsafe-inline' 'unsafe-eval'");

    vi.stubEnv("NODE_ENV", "production");
    expect(await scriptPolicy()).toBe("script-src 'self' 'unsafe-inline'");
  });
});
