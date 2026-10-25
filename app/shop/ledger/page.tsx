import Link from "next/link";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { z } from "zod";
import { LedgerDashboard, type LedgerData } from "@/components/CustomerRow";
import { ShopAccountMenu } from "@/components/ShopAccountMenu";
import { createClient } from "@/lib/supabase/server";
import { calculateTodayTakings } from "@/lib/ledger";
import { calculateBuyingPower } from "@/lib/buyingPower";

const profileSchema = z.object({
  role: z.enum(["shop_owner", "customer"]),
});

// WHY: Seeded MD5-derived IDs are valid PostgreSQL UUIDs even when their version/variant bits are nonstandard.
const databaseUuidSchema = z.string().regex(/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i);

const shopSchema = z.object({
  id: databaseUuidSchema,
  name: z.string().min(1),
});

const customerSchema = z.object({
  id: databaseUuidSchema,
  display_name: z.string().min(1),
  customer_phone: z.string().min(1),
  credit_limit_cents: z.number().int().nonnegative(),
});

const saleSchema = z.object({
  id: databaseUuidSchema,
  shop_customer_id: databaseUuidSchema.nullable(),
  total_cents: z.number().int().positive(),
  method: z.enum(["tab", "demo_card", "cash", "pending"]),
  status: z.enum(["pending", "tab_requested", "approved", "paid", "repaid", "expired", "cancelled"]),
  paid_now_cents: z.number().int().nonnegative(),
  paid_now_method: z.enum(["cash", "demo_card"]).nullable(),
  paid_now_confirmed_at: z.string().nullable(),
  tab_cents: z.number().int().nonnegative(),
  created_at: z.string().datetime({ offset: true }),
  due_at: z.string().datetime({ offset: true }).nullable(),
});

const repaymentSchema = z.object({
  sale_id: databaseUuidSchema,
  amount_cents: z.number().int().positive(),
  paid_at: z.string().datetime({ offset: true }),
  on_time: z.boolean(),
});

const PAGE_SIZE = 1_000;

type Customer = z.infer<typeof customerSchema>;
type Sale = z.infer<typeof saleSchema>;
type Repayment = z.infer<typeof repaymentSchema>;

async function loadAllSales(
  supabase: Awaited<ReturnType<typeof createClient>>,
  shopId: string,
) {
  const rows: unknown[] = [];
  for (let offset = 0; ; offset += PAGE_SIZE) {
    const { data, error } = await supabase
      .from("sales")
      .select("id, shop_customer_id, total_cents, method, status, paid_now_cents, paid_now_method, paid_now_confirmed_at, tab_cents, created_at, due_at")
      .eq("shop_id", shopId)
      .order("created_at", { ascending: false })
      .range(offset, offset + PAGE_SIZE - 1);
    if (error || !data) return { ok: false as const };
    rows.push(...data);
    if (data.length < PAGE_SIZE) return { ok: true as const, data: rows };
  }
}

async function loadRepayments(
  supabase: Awaited<ReturnType<typeof createClient>>,
  saleIds: string[],
) {
  const rows: unknown[] = [];
  for (let saleOffset = 0; saleOffset < saleIds.length; saleOffset += 200) {
    const batch = saleIds.slice(saleOffset, saleOffset + 200);
    for (let offset = 0; ; offset += PAGE_SIZE) {
      const { data, error } = await supabase
        .from("repayments")
        .select("sale_id, amount_cents, paid_at, on_time")
        .in("sale_id", batch)
        .order("paid_at", { ascending: false })
        .range(offset, offset + PAGE_SIZE - 1);
      if (error || !data) return { ok: false as const };
      rows.push(...data);
      if (data.length < PAGE_SIZE) break;
    }
  }
  return { ok: true as const, data: rows };
}

function DataUnavailable() {
  return (
    <main className="flex min-h-full flex-col px-3 py-3">
      <section className="flex flex-1 flex-col items-center justify-center rounded-2xl border border-white/10 bg-card px-5 py-8 text-center">
        <header className="flex w-full items-center justify-between">
          <h1 className="text-lg font-semibold">Ledger</h1>
          <ShopAccountMenu />
        </header>
        <p className="mt-3 text-sm text-red-200" role="alert">
          We couldn&apos;t load your shop records. Please try again.
        </p>
        <Link
          className="mt-5 flex min-h-11 items-center justify-center rounded-full bg-teal px-5 text-sm font-semibold text-[#041A1E]"
          href="/shop/ledger"
        >
          Try again
        </Link>
      </section>
    </main>
  );
}

function NoShop() {
  return (
    <main className="flex min-h-full flex-col px-3 py-3">
      <section className="flex flex-1 flex-col items-center justify-center rounded-2xl border border-white/10 bg-card px-5 py-8 text-center">
        <header className="flex w-full items-center justify-between">
          <h1 className="text-lg font-semibold">Ledger</h1>
          <ShopAccountMenu />
        </header>
        <p className="mt-3 text-sm text-foreground/70" role="alert">
          We couldn&apos;t find a shop linked to this owner account.
        </p>
      </section>
    </main>
  );
}

async function LedgerContent() {
  // WHY: The authenticated shop data and current day are request-specific and must not be prerendered.
  await connection();
  const now = new Date();
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError && authError.name !== "AuthSessionMissingError") throw authError;
  if (!user) redirect("/login");

  const { data: profileData, error: profileError } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();
  if (profileError) return <DataUnavailable />;
  const profile = profileSchema.safeParse(profileData);
  if (!profile.success) return <DataUnavailable />;
  if (profile.data.role !== "shop_owner") redirect("/me");

  // WHY: RLS and the session-derived owner ID keep every ledger query within this owner's shop.
  const { data: shopData, error: shopError } = await supabase
    .from("shops")
    .select("id, name")
    .eq("owner_id", user.id)
    .maybeSingle();
  if (shopError) return <DataUnavailable />;
  if (!shopData) return <NoShop />;
  const shop = shopSchema.safeParse(shopData);
  if (!shop.success) return <DataUnavailable />;

  const [customersResult, salesResult] = await Promise.all([
    supabase
      .from("shop_customers")
      .select("id, display_name, customer_phone, credit_limit_cents")
      .eq("shop_id", shop.data.id)
      .order("display_name"),
    loadAllSales(supabase, shop.data.id),
  ]);
  if (customersResult.error || !salesResult.ok) return <DataUnavailable />;

  const customersParsed = z.array(customerSchema).safeParse(customersResult.data);
  const salesParsed = z.array(saleSchema).safeParse(salesResult.data);
  if (!customersParsed.success || !salesParsed.success) return <DataUnavailable />;

  const saleIds = salesParsed.data.map((sale) => sale.id);
  const repaymentsResult = await loadRepayments(supabase, saleIds);
  if (!repaymentsResult.ok) return <DataUnavailable />;
  const repaymentsParsed = z.array(repaymentSchema).safeParse(repaymentsResult.data);
  if (!repaymentsParsed.success) return <DataUnavailable />;

  const customers: Customer[] = customersParsed.data;
  const sales: Sale[] = salesParsed.data;
  const repayments: Repayment[] = repaymentsParsed.data;
  const customerById = new Map(customers.map((customer) => [customer.id, customer]));
  const saleById = new Map(sales.map((sale) => [sale.id, sale]));
  const repaidBySale = new Map<string, number>();
  const owedByCustomer = new Map<string, number>();
  const repaymentsByCustomer = new Map<string, Repayment[]>();

  for (const repayment of repayments) {
    const sale = saleById.get(repayment.sale_id);
    if (!sale) return <DataUnavailable />;

    const repaidCents = (repaidBySale.get(sale.id) ?? 0) + repayment.amount_cents;
    if (!Number.isSafeInteger(repaidCents)) return <DataUnavailable />;
    repaidBySale.set(sale.id, repaidCents);

    if (sale.shop_customer_id) {
      const customerRepayments = repaymentsByCustomer.get(sale.shop_customer_id) ?? [];
      customerRepayments.push(repayment);
      repaymentsByCustomer.set(sale.shop_customer_id, customerRepayments);
    }
  }

  let todayTakingsCents: number;
  try {
    todayTakingsCents = calculateTodayTakings(sales, repayments, now);
  } catch {
    return <DataUnavailable />;
  }
  for (const sale of sales) {
    if (
      sale.status === "approved"
      && sale.shop_customer_id
      && sale.tab_cents > (repaidBySale.get(sale.id) ?? 0)
    ) {
      const owed = sale.tab_cents - (repaidBySale.get(sale.id) ?? 0);
      const nextOwed = (owedByCustomer.get(sale.shop_customer_id) ?? 0) + owed;
      if (!Number.isSafeInteger(nextOwed)) return <DataUnavailable />;
      owedByCustomer.set(sale.shop_customer_id, nextOwed);
    }
  }

  const customerRows: LedgerData["customers"] = customers.map((customer) => {
    const outstandingSales = sales
      .filter((sale) => sale.shop_customer_id === customer.id && sale.status === "approved")
      .map((sale) => {
        const owedCents = sale.tab_cents - (repaidBySale.get(sale.id) ?? 0);
        return owedCents > 0
          ? {
            id: sale.id,
            owedCents,
            dueAt: sale.due_at ?? "",
            late: Date.parse(sale.due_at ?? "") < now.getTime(),
          }
          : null;
      })
      .filter((sale): sale is NonNullable<typeof sale> => sale !== null);
    const late = outstandingSales.some((sale) => Date.parse(sale.dueAt) < now.getTime());
    return {
      id: customer.id,
      displayName: customer.display_name,
      phone: customer.customer_phone,
      // WHY: The cached limit is only updated by some mutations; display the same history-based rule as /me and approval.
      limitCents: calculateBuyingPower({
        sales: sales.filter((sale) => sale.shop_customer_id === customer.id).map((sale) => ({
          id: sale.id, createdAt: sale.created_at, totalCents: sale.total_cents, method: sale.method,
          status: sale.status, tabCents: sale.tab_cents, paidNowCents: sale.paid_now_cents,
          paidNowMethod: sale.paid_now_method, dueAt: sale.due_at,
        })),
        repayments: (repaymentsByCustomer.get(customer.id) ?? []).map((payment) => ({
          saleId: payment.sale_id, amountCents: payment.amount_cents, paidAt: payment.paid_at, onTime: payment.on_time,
        })),
      }, now).limitCents,
      owedCents: owedByCustomer.get(customer.id) ?? 0,
      late,
      outstandingSales,
      repayments: (repaymentsByCustomer.get(customer.id) ?? []).map((repayment) => ({
        amountCents: repayment.amount_cents,
        paidAt: repayment.paid_at,
        onTime: repayment.on_time,
      })),
    };
  });

  const transactions: LedgerData["transactions"] = sales.map((sale) => ({
    id: sale.id,
    type: "sale" as const,
    label: sale.shop_customer_id
      ? customerById.get(sale.shop_customer_id)?.display_name ?? "Customer"
      : "Walk-in sale",
    amountCents: sale.total_cents,
    method: sale.method,
    status: sale.status,
    occurredAt: sale.created_at,
  }));
  for (const repayment of repayments) {
    const sale = saleById.get(repayment.sale_id);
    if (!sale) return <DataUnavailable />;
    transactions.push({
      id: `${repayment.sale_id}-${repayment.paid_at}`,
      type: "repayment" as const,
      label: sale.shop_customer_id
        ? customerById.get(sale.shop_customer_id)?.display_name ?? "Customer"
        : "Customer",
      amountCents: repayment.amount_cents,
      method: "tab" as const,
      status: repayment.on_time ? "on_time" : "late",
      occurredAt: repayment.paid_at,
    });
  }

  const ledger: LedgerData = {
    shopName: shop.data.name,
    todayTakingsCents,
    tabsOwedCents: [...owedByCustomer.values()].reduce((total, owed) => total + owed, 0),
    customers: customerRows,
    transactions: transactions.sort(
      (left, right) => Date.parse(right.occurredAt) - Date.parse(left.occurredAt),
    ),
  };

  return <LedgerDashboard ledger={ledger} />;
}

function LedgerLoading() {
  return (
    <main className="flex min-h-full flex-col px-3 py-3">
      <section className="flex flex-1 flex-col rounded-2xl border border-white/10 bg-card px-4 py-5">
        <h1 className="text-lg font-semibold">Ledger</h1>
        <p className="mt-3 text-sm text-foreground/70" role="status">Loading shop records…</p>
      </section>
    </main>
  );
}

export default function ShopLedgerPage() {
  // WHY: Streaming the session-scoped database reads behind a shell avoids prerendering private ledger data.
  return (
    <Suspense fallback={<LedgerLoading />}>
      <LedgerContent />
    </Suspense>
  );
}
