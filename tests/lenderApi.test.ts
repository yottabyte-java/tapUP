import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GET } from "@/app/api/v1/buying-power/route";
import { loadBuyingPowerHistory } from "@/lib/lenderData";

vi.mock("@/lib/lenderData", () => ({
  LenderDataAccessError: class LenderDataAccessError extends Error {},
  loadBuyingPowerHistory: vi.fn(),
}));

const SHOP_ID = "00000000-0000-4000-8000-000000000001";
const CUSTOMER_ID = "00000000-0000-4000-8000-000000000002";
const API_KEY = "lender-test-key";

function request(path: string, apiKey = API_KEY): Request {
  return new Request(`http://localhost${path}`, {
    headers: { "x-api-key": apiKey },
  });
}

describe("lender buying-power API", () => {
  beforeEach(() => {
    vi.stubEnv("LENDER_API_KEY", API_KEY);
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("returns 401 for an incorrect API key without querying customer data", async () => {
    const response = await GET(
      request(`/api/v1/buying-power?shop=${SHOP_ID}&customer=${CUSTOMER_ID}`, "wrong-key"),
    );

    expect(response.status).toBe(401);
    expect(loadBuyingPowerHistory).not.toHaveBeenCalled();
  });

  it("returns 400 for malformed query identifiers", async () => {
    const response = await GET(request("/api/v1/buying-power?shop=not-a-uuid&customer=bad"));

    expect(response.status).toBe(400);
    expect(loadBuyingPowerHistory).not.toHaveBeenCalled();
  });

  it("returns a generic 404 when the shop/customer pair does not exist", async () => {
    vi.mocked(loadBuyingPowerHistory).mockResolvedValue(null);

    const response = await GET(
      request(`/api/v1/buying-power?shop=${SHOP_ID}&customer=${CUSTOMER_ID}`),
    );

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: "Shop customer not found" });
  });

  it("returns only the demo buying-power response for a found shop customer", async () => {
    vi.mocked(loadBuyingPowerHistory).mockResolvedValue({ sales: [], repayments: [] });

    const response = await GET(
      request(`/api/v1/buying-power?shop=${SHOP_ID}&customer=${CUSTOMER_ID}`),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(Object.keys(body).sort()).toEqual(["demo", "level", "limitCents", "reasons"]);
    expect(body).toMatchObject({ limitCents: 0, level: 0, demo: true });
    expect(response.headers.get("Cache-Control")).toBe("no-store");
  });

  it("returns 429 with Retry-After after the IP reaches the lender API limit", async () => {
    vi.mocked(loadBuyingPowerHistory).mockResolvedValue({ sales: [], repayments: [] });
    const limitedRequest = () => new Request(
      `http://localhost/api/v1/buying-power?shop=${SHOP_ID}&customer=${CUSTOMER_ID}`,
      {
        headers: {
          "x-api-key": API_KEY,
          "x-real-ip": "198.51.100.241",
        },
      },
    );

    for (let attempt = 0; attempt < 60; attempt += 1) {
      expect((await GET(limitedRequest())).status).toBe(200);
    }
    const blockedResponse = await GET(limitedRequest());

    expect(blockedResponse.status).toBe(429);
    expect(blockedResponse.headers.get("Retry-After")).toBeTruthy();
    expect(loadBuyingPowerHistory).toHaveBeenCalledTimes(60);
  });
});
