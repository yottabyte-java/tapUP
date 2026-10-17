import { createHash, timingSafeEqual } from "node:crypto";
import { calculateBuyingPower } from "@/lib/buyingPower";
import { lenderQuerySchema } from "@/lib/validation";
import { LenderDataAccessError, loadBuyingPowerHistory } from "@/lib/lenderData";

function jsonResponse(body: Record<string, unknown>, status = 200): Response {
  return Response.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

function matchesApiKey(supplied: string, expected: string): boolean {
  // WHY: Hashing both values gives timingSafeEqual fixed-length inputs without leaking key length.
  const suppliedDigest = createHash("sha256").update(supplied, "utf8").digest();
  const expectedDigest = createHash("sha256").update(expected, "utf8").digest();
  return timingSafeEqual(suppliedDigest, expectedDigest);
}

/*
 * WHY: This endpoint demonstrates tapUP's planned data product: lenders pay for
 * shop-scoped buying-power signals, not a customer's identity or raw transaction history.
 * It is a demo API, not a real lender integration or credit decision.
 */
export async function GET(request: Request): Promise<Response> {
  const expectedApiKey = process.env.LENDER_API_KEY;
  if (!expectedApiKey) {
    return jsonResponse({ error: "Server configuration error" }, 500);
  }
  if (!matchesApiKey(request.headers.get("x-api-key") ?? "", expectedApiKey)) {
    return jsonResponse({ error: "Unauthorized" }, 401);
  }

  const url = new URL(request.url);
  const query = lenderQuerySchema.safeParse({
    shop: url.searchParams.get("shop"),
    customer: url.searchParams.get("customer"),
  });
  if (!query.success) {
    return jsonResponse({ error: "Invalid shop or customer identifier" }, 400);
  }

  // TODO: Return 429 after applying lib/rateLimit.ts when that shared limiter is available.
  const now = new Date();
  try {
    const history = await loadBuyingPowerHistory(query.data.shop, query.data.customer, now);
    if (!history) {
      return jsonResponse({ error: "Shop customer not found" }, 404);
    }

    const buyingPower = calculateBuyingPower(history, now);
    return jsonResponse({
      limitCents: buyingPower.limitCents,
      level: buyingPower.level,
      reasons: buyingPower.reasons,
      demo: true,
    });
  } catch (error) {
    if (error instanceof LenderDataAccessError) {
      return jsonResponse({ error: "Buying-power data is temporarily unavailable" }, 503);
    }
    throw error;
  }
}
