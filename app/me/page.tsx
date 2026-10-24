import Link from "next/link";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { z } from "zod";
import { LimitMeter } from "@/components/LimitMeter";
import { WhyLimit } from "@/components/WhyLimit";
import { calculateBuyingPower, explainLimit, type BuyingPowerHistory } from "@/lib/buyingPower";
import { likelyToNeedTab } from "@/lib/forecast";
import { createClient } from "@/lib/supabase/server";

const profileSchema = z.object({
  role: z.enum(["shop_owner", "customer"]),
});

// WHY: PostgreSQL accepts any canonical UUID bit pattern, including the seeded MD5-derived IDs.
const databaseUuidSchema = z.string().regex(/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i);

const customerLinksSchema = z.array(z.object({
  id: databaseUuidSchema,
  shop_id: databaseUuidSchema,
}));

const shopsSchema = z.array(z.object({
  id: databaseUuidSchema,
  name: z.string().min(1),
}));

const salesSchema = z.array(z.object({
  id: databaseUuidSchema,
  shop_id: databaseUuidSchema,
  shop_customer_id: databaseUuidSchema,
  created_at: z.string(),
  total_cents: z.number().int().positive(),
  method: z.enum(["tab", "demo_card", "cash", "pending"]),
  status: z.enum(["pending", "tab_requested", "approved", "paid", "repaid", "expired", "cancelled"]),
  tab_cents: z.number().int().nonnegative(),
  paid_now_cents: z.number().int().nonnegative(),
  paid_now_method: z.enum(["cash", "demo_card"]).nullable(),
  due_at: z.string().nullable(),
}));

const repaymentsSchema = z.array(z.object({
  sale_id: databaseUuidSchema,
  amount_cents: z.number().int().positive(),
  paid_at: z.string(),
  on_time: z.boolean(),
}));

const HISTORY_PAGE_SIZE = 1_000;

function logFailure(step: string, error: unknown, fallbackMessage = "Response failed validation"): void {
  const record = typeof error === "object" && error !== null
    ? error as { message?: unknown; code?: unknown }
    : null;
  const message = typeof record?.message === "string" ? record.message : fallbackMessage;
  const safeMessage = message
    .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, "[redacted]")
    .replace(/\bBearer\s+\S+/gi, "Bearer [redacted]")
    .replace(/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g, "[redacted token]")
    .replace(/\b[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}\b/gi, "[redacted id]")
    .replace(/\b\+?\d[\d\s().-]{5,}\d\b/g, "[redacted number]");
  const code = typeof record?.code === "string" ? record.code : "unknown";

  // WHY: Keep a useful server diagnostic while preventing user identifiers and credentials from entering logs.
  console.error("[me] Buying Power load failed", { step, message: safeMessage, code });
}

type BuyingPowerCardData = {
  id: string;
  shopName: string;
  limitCents: number;
  level: number;
  nextLimitCents: number;
  reasons: string[];
  forecast: ReturnType<typeof likelyToNeedTab>;
};

async function loadSales(
  supabase: Awaited<ReturnType<typeof createClient>>,
  customerIds: string[],
) {
  const rows: unknown[] = [];
  for (let offset = 0; ; offset += HISTORY_PAGE_SIZE) {
    const { data, error } = await supabase
      .from("sales")
      .select("id, shop_id, shop_customer_id, created_at, total_cents, method, status, tab_cents, paid_now_cents, paid_now_method, due_at")
      .in("shop_customer_id", customerIds)
      .range(offset, offset + HISTORY_PAGE_SIZE - 1);
    if (error || !data) {
      return { ok: false as const, error };
    }

    rows.push(...data);
    if (data.length < HISTORY_PAGE_SIZE) {
      return { ok: true as const, data: rows };
    }
  }
}

async function loadRepayments(
  supabase: Awaited<ReturnType<typeof createClient>>,
  saleIds: string[],
) {
  const rows: unknown[] = [];
  for (let offset = 0; ; offset += HISTORY_PAGE_SIZE) {
    const { data, error } = await supabase
      .from("repayments")
      .select("sale_id, amount_cents, paid_at, on_time")
      .in("sale_id", saleIds)
      .range(offset, offset + HISTORY_PAGE_SIZE - 1);
    if (error || !data) {
      return { ok: false as const, error };
    }

    rows.push(...data);
    if (data.length < HISTORY_PAGE_SIZE) {
      return { ok: true as const, data: rows };
    }
  }
}

function DataUnavailable() {
  return (
    <main className="flex min-h-full flex-col px-3 py-3">
      <section className="flex flex-1 flex-col justify-center rounded-[1.4rem] border border-teal/70 px-5 py-8 text-center">
        <h1 className="text-lg font-semibold">Your Buying Power</h1>
        <p className="mt-3 text-sm text-red-200" role="alert">
          We couldn&apos;t load your buying-power details. Please try again.
        </p>
        <Link
          className="mt-5 flex min-h-11 items-center justify-center rounded-full bg-teal px-5 text-sm font-semibold text-[#041A1E]"
          href="/me"
        >
          Try again
        </Link>
      </section>
    </main>
  );
}

function NoShopLinked() {
  return (
    <main className="flex min-h-full flex-col px-3 py-3">
      <section className="flex flex-1 flex-col justify-center rounded-[1.4rem] border border-teal/70 px-5 py-8 text-center">
        <h1 className="text-lg font-semibold">Your Buying Power</h1>
        <p className="mt-3 text-sm leading-relaxed text-foreground/75">
          Your account is not linked to a shop yet. Ask the shop owner to link your customer record.
        </p>
      </section>
    </main>
  );
}

function ShopBuyingPower({ card }: { card: BuyingPowerCardData }) {
  return (
    <section aria-labelledby={`buying-power-${card.id}`} className="rounded-2xl border border-white/10 bg-card p-4">
      <h2 className="mb-3 text-sm font-semibold text-foreground/80" id={`buying-power-${card.id}`}>
        {card.shopName}
      </h2>
      <LimitMeter
        level={card.level}
        limitCents={card.limitCents}
        nextLimitCents={card.nextLimitCents}
      />
      <WhyLimit reasons={card.reasons} />
      {card.forecast.likely && (
        <aside className="mt-5 flex items-start gap-3 rounded-xl border border-teal/50 bg-[#142329] p-3.5">
          <span aria-hidden="true" className="mt-0.5 text-lg text-amber">▣</span>
          <div>
            <h3 className="text-sm font-semibold">You may need a tab around month end</h3>
            <p className="mt-1 text-xs leading-relaxed text-foreground/70">{card.forecast.reason}</p>
          </div>
        </aside>
      )}
    </section>
  );
}

async function BuyingPowerContent() {
  // WHY: Establish request-time rendering before creating clients, validating data, or reading the clock.
  await connection();
  const now = new Date();
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();

  // WHY: An unexpected auth failure must not be mistaken for an ordinary signed-out visit.
  if (authError && authError.name !== "AuthSessionMissingError") {
    throw authError;
  }
  if (!user) {
    redirect("/login");
  }

  const { data: profileData, error: profileError } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();
  if (profileError) {
    logFailure("profile query", profileError);
    return <DataUnavailable />;
  }

  const profile = profileSchema.safeParse(profileData);
  if (!profile.success) {
    logFailure("profile response validation", null);
    return <DataUnavailable />;
  }
  if (profile.data.role === "shop_owner") {
    redirect("/shop/sell");
  }

  // WHY: RLS limits these links to the signed-in customer, preserving a separate limit for each shop.
  const { data: linkData, error: linksError } = await supabase
    .from("shop_customers")
    .select("id, shop_id")
    .eq("customer_profile_id", user.id)
    .eq("status", "active");
  if (linksError) {
    logFailure("customer links query", linksError);
    return <DataUnavailable />;
  }

  const linkRows = customerLinksSchema.safeParse(linkData);
  if (!linkRows.success) {
    logFailure("customer links response validation", null);
    return <DataUnavailable />;
  }
  if (linkRows.data.length === 0) {
    return <NoShopLinked />;
  }

  const customerIds = linkRows.data.map((link) => link.id);
  const shopIds = [...new Set(linkRows.data.map((link) => link.shop_id))];
  const [shopsResult, salesResult] = await Promise.all([
    supabase.from("shops").select("id, name").in("id", shopIds),
    loadSales(supabase, customerIds),
  ]);
  if (shopsResult.error) {
    logFailure("shops query", shopsResult.error);
    return <DataUnavailable />;
  }
  if (!salesResult.ok) {
    logFailure("sales query", salesResult.error);
    return <DataUnavailable />;
  }

  const shops = shopsSchema.safeParse(shopsResult.data);
  const sales = salesSchema.safeParse(salesResult.data);
  if (!shops.success || !sales.success) {
    if (!shops.success) {
      logFailure("shops response validation", null);
    } else if (!sales.success) {
      // WHY: Report only the invalid field and its required format; never log row data or identifiers.
      console.error("[me] Buying Power load failed", {
        step: "sales response validation",
        failures: sales.error.issues.map((issue) => ({
          field: issue.path.filter((part): part is string => typeof part === "string").join(".") || "row",
          expected: issue.code === "invalid_format" && issue.format === "regex"
            ? "canonical PostgreSQL UUID string (8-4-4-4-12 hexadecimal)"
            : issue.code === "invalid_format"
              ? issue.format
            : issue.code === "invalid_type"
              ? issue.expected
              : issue.code,
        })),
      });
    }
    return <DataUnavailable />;
  }

  const salesByCustomer = new Map<string, BuyingPowerHistory["sales"]>(
    linkRows.data.map((link) => [link.id, []]),
  );
  for (const sale of sales.data) {
    const customerSales = salesByCustomer.get(sale.shop_customer_id);
    const customerLink = linkRows.data.find((link) => link.id === sale.shop_customer_id);

    // WHY: Verify returned rows still match the exact customer/shop pair before scoring them.
    if (!customerSales || !customerLink || customerLink.shop_id !== sale.shop_id) {
      logFailure("sales customer/shop consistency check", null);
      return <DataUnavailable />;
    }
    customerSales.push({
      id: sale.id,
      createdAt: sale.created_at,
      totalCents: sale.total_cents,
      method: sale.method,
      status: sale.status,
      tabCents: sale.tab_cents,
      paidNowCents: sale.paid_now_cents,
      paidNowMethod: sale.paid_now_method,
      dueAt: sale.due_at,
    });
  }

  const saleIds = sales.data.map((sale) => sale.id);
  let repaymentRows: z.infer<typeof repaymentsSchema> = [];
  if (saleIds.length > 0) {
    const repaymentResult = await loadRepayments(supabase, saleIds);
    if (!repaymentResult.ok) {
      logFailure("repayments query", repaymentResult.error);
      return <DataUnavailable />;
    }

    const repayments = repaymentsSchema.safeParse(repaymentResult.data);
    if (!repayments.success) {
      logFailure("repayments response validation", null);
      return <DataUnavailable />;
    }
    repaymentRows = repayments.data;
  }

  const shopsById = new Map(shops.data.map((shop) => [shop.id, shop.name]));
  const saleToCustomer = new Map(sales.data.map((sale) => [sale.id, sale.shop_customer_id]));
  const repaymentsByCustomer = new Map<string, BuyingPowerHistory["repayments"]>(
    linkRows.data.map((link) => [link.id, []]),
  );
  for (const repayment of repaymentRows) {
    const customerId = saleToCustomer.get(repayment.sale_id);
    const customerRepayments = customerId ? repaymentsByCustomer.get(customerId) : undefined;
    if (!customerRepayments) {
      logFailure("repayment sale/customer consistency check", null);
      return <DataUnavailable />;
    }
    customerRepayments.push({
      saleId: repayment.sale_id,
      amountCents: repayment.amount_cents,
      paidAt: repayment.paid_at,
      onTime: repayment.on_time,
    });
  }

  const cards: BuyingPowerCardData[] = [];
  for (const link of linkRows.data) {
    const shopName = shopsById.get(link.shop_id);
    const customerSales = salesByCustomer.get(link.id);
    const customerRepayments = repaymentsByCustomer.get(link.id);
    if (!shopName || !customerSales || !customerRepayments) {
      logFailure("shop/customer history consistency check", null);
      return <DataUnavailable />;
    }

    const history: BuyingPowerHistory = {
      sales: customerSales,
      repayments: customerRepayments,
    };
    const buyingPower = calculateBuyingPower(history, now);
    cards.push({
      id: link.id,
      shopName,
      limitCents: buyingPower.limitCents,
      level: buyingPower.level,
      nextLimitCents: buyingPower.nextLimitCents,
      reasons: explainLimit(buyingPower),
      forecast: likelyToNeedTab(history, now),
    });
  }

  return (
    <main className="flex min-h-full flex-col px-3 py-3">
      <section className="flex flex-1 flex-col rounded-[1.4rem] border border-teal/70 px-4 py-5">
        <header className="mb-5">
          <h1 className="text-lg font-semibold">Your Buying Power</h1>
          <p className="mt-1 text-xs text-foreground/65">A separate record for each shop</p>
        </header>
        <div className="space-y-4">
          {cards.map((card) => <ShopBuyingPower card={card} key={card.id} />)}
        </div>
      </section>
    </main>
  );
}

function BuyingPowerLoading() {
  return (
    <main className="flex min-h-full flex-col px-3 py-3">
      <section className="flex flex-1 flex-col rounded-[1.4rem] border border-teal/70 px-4 py-5">
        <h1 className="text-lg font-semibold">Your Buying Power</h1>
        <p className="mt-3 text-sm text-foreground/70" role="status">
          Loading your shop records…
        </p>
      </section>
    </main>
  );
}

export default function BuyingPowerPage() {
  // WHY: Stream the authenticated, uncached buying-power data behind a route shell as Next.js 16 requires.
  return (
    <Suspense fallback={<BuyingPowerLoading />}>
      <BuyingPowerContent />
    </Suspense>
  );
}
