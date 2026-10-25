import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { beforeAll, describe, expect, it } from "vitest";
import { calculateBuyingPower, type BuyingPowerHistory } from "@/lib/buyingPower";
import { buyingPowerCases } from "./buyingPowerCases";

const container = process.env.TAPUP_TEST_POSTGRES_CONTAINER;
const database = `tapup_findings_${randomUUID().replaceAll("-", "")}`;
const now = new Date();
const cases = buyingPowerCases(now);
const literal = (value: unknown): string => value === null || value === undefined ? "NULL" : `'${String(value).replaceAll("'", "''")}'`;
function sql(query: string, db = database): string {
  if (!container || !/^[a-zA-Z0-9_-]+$/.test(container)) throw new Error("A task-owned PostgreSQL container is required");
  return execFileSync("docker", ["exec", "-i", container, "psql", "-X", "-qAt", "-v", "ON_ERROR_STOP=1", "-U", "postgres", "-d", db], { input: query, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] }).trim();
}

// WHY: This opt-in suite creates a NEW uniquely named database. It never resets an existing database.
// Auth is stubbed only to install the real schema/RLS; scoring and approval run in PostgreSQL.
describe.skipIf(!container)("PostgreSQL buying-power parity and existing approval RPC", () => {
  beforeAll(() => {
    sql(`CREATE DATABASE ${database};`, "postgres");
    const schema = readFileSync("supabase/schema.sql", "utf8");
    const migration = readFileSync("supabase/migrations/202610250001_align_buying_power_floor.sql", "utf8");
    expect(migration.slice(migration.indexOf("CREATE OR REPLACE FUNCTION")))
      .toBe(schema.slice(schema.indexOf("CREATE OR REPLACE FUNCTION public.approve_tab_atomic(")));
    const scoring = schema.slice(schema.indexOf("  WITH completed AS ("), schema.indexOf("  SELECT COALESCE(pg_catalog.sum(s.tab_cents::bigint"));
    sql(`
      DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='anon') THEN CREATE ROLE anon; END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated; END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='service_role') THEN CREATE ROLE service_role; END IF;
        -- WHY: Another isolated database suite may create these cluster roles concurrently in CI.
        EXCEPTION WHEN duplicate_object OR unique_violation THEN NULL;
      END $$;
      CREATE SCHEMA auth;
      CREATE TABLE auth.users (id uuid PRIMARY KEY, phone text, phone_confirmed_at timestamptz);
      CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT NULL::uuid $$;
      ${schema}
      ${readFileSync("supabase/rls.sql", "utf8")}
      ${migration}
      CREATE FUNCTION public.test_score(target_shop_id uuid, target_shop_customer_id uuid, approval_now timestamptz)
      RETURNS jsonb LANGUAGE plpgsql AS $$
      DECLARE completed_count bigint; weighted_days bigint; weighted_spend bigint; weekly_spend bigint;
        late_count bigint; settled_tabs bigint; on_time_tabs bigint; score integer; calculated_limit integer;
      BEGIN
        ${scoring}
        RETURN jsonb_build_object('score', score, 'limitCents', calculated_limit);
      END $$;
    `);
  });

  it("reapplies and transactionally rehearses the floor migration without changing its installed definition", () => {
    const definition = "SELECT pg_get_functiondef('public.approve_tab_atomic(uuid,uuid,uuid,uuid,text,boolean,boolean)'::regprocedure)";
    const before = sql(definition);
    const migration = readFileSync("supabase/migrations/202610250001_align_buying_power_floor.sql", "utf8");
    sql(migration);
    expect(sql(definition)).toBe(before);
    sql(`BEGIN; ${migration} ROLLBACK;`);
    expect(sql(definition)).toBe(before);
  });

  function fixture(history: BuyingPowerHistory, totalCents = 1) {
    const owner = randomUUID(), profile = randomUUID(), shop = randomUUID(), customer = randomUUID(), pending = randomUUID();
    const ids = new Map(history.sales.map((sale) => [sale.id, randomUUID()]));
    // Historical fixtures need past receipt timestamps and terminal states. Only fixture inserts
    // bypass triggers; constraints stay active, and the actual approval uses all original triggers.
    let query = `BEGIN; SET LOCAL session_replication_role = replica;
      INSERT INTO auth.users(id) VALUES ('${owner}'),('${profile}');
      INSERT INTO profiles(id,role,full_name) VALUES ('${owner}','shop_owner','Test owner'),('${profile}','customer','Test customer');
      INSERT INTO shops(id,owner_id,name) VALUES ('${shop}','${owner}','Test shop');
      INSERT INTO shop_customers(id,shop_id,customer_profile_id,customer_phone,display_name,consent_at,owner_confirmed_at)
        VALUES ('${customer}','${shop}','${profile}','+27820000000','Test customer',now(),now());`;
    for (const sale of history.sales) {
      const tab = sale.method === "tab" ? sale.tabCents ?? sale.totalCents : 0;
      const paid = sale.method === "tab" ? sale.paidNowCents ?? 0 : sale.status === "paid" ? sale.totalCents : 0;
      const paidMethod = paid > 0 ? sale.method === "tab" ? sale.paidNowMethod : sale.method : null;
      const isTab = sale.status === "approved" || sale.status === "repaid";
      query += `INSERT INTO sales(id,shop_id,shop_customer_id,items,total_cents,method,status,tab_cents,paid_now_cents,paid_now_method,paid_now_confirmed_at,used_at,created_at,approved_at,due_at)
        VALUES ('${ids.get(sale.id)}','${shop}','${customer}','[]',${sale.totalCents},${literal(sale.method)},${literal(sale.status)},${tab},${paid},${literal(paidMethod)},${paid > 0 ? literal(sale.createdAt) : "NULL"},${literal(sale.createdAt)},${literal(sale.createdAt)},${isTab ? literal(sale.createdAt) : "NULL"},${isTab ? literal(sale.dueAt ?? new Date(now.getTime() + 86_400_000).toISOString()) : "NULL"});`;
    }
    for (const r of history.repayments) {
      query += `INSERT INTO repayments(sale_id,amount_cents,paid_at,on_time) VALUES ('${ids.get(r.saleId)}',${r.amountCents},${literal(r.paidAt)},${r.onTime});`;
    }
    query += `SET LOCAL session_replication_role = origin;
      INSERT INTO sales(id,shop_id,items,total_cents) VALUES ('${pending}','${shop}','[]',${totalCents});`;
    return { query, owner, shop, customer, pending };
  }

  it.each(cases)("matches TypeScript: $name", ({ history }) => {
    const f = fixture(history);
    const expected = calculateBuyingPower(history, now);
    const output = sql(`${f.query}
      SELECT public.test_score('${f.shop}','${f.customer}',${literal(now.toISOString())});
      SELECT approve_tab_atomic('${f.pending}','${f.customer}','${f.shop}','${f.owner}',NULL,false,false);
      ROLLBACK;`).split("\n").map((line) => JSON.parse(line));
    expect(output[0]).toEqual({ score: expected.score, limitCents: expected.limitCents });
    const outstanding = history.sales.filter((sale) => sale.status === "approved")
      .reduce((sum, sale) => sum + (sale.tabCents ?? 0) - history.repayments.filter((r) => r.saleId === sale.id).reduce((sum, r) => sum + r.amountCents, 0), 0);
    expect(output[1].ok).toBe(expected.limitCents - outstanding >= 1);
    if (output[1].ok) expect(output[1].limitCents).toBe(expected.limitCents);
    else expect(output[1].error).toBe("insufficient_buying_power");
  });

  it("requires cash confirmation before approving a split and records it once", () => {
    const history = cases.find((entry) => entry.name === "late installments reduce score to zero but retain R50")!.history;
    const f = fixture(history, 7500);
    const call = `SELECT approve_tab_atomic('${f.pending}','${f.customer}','${f.shop}','${f.owner}',NULL,false,false);`;
    const output = sql(`${f.query}
      UPDATE sales SET shop_customer_id='${f.customer}',method='tab',status='tab_requested',tab_cents=5000,
        paid_now_cents=2500,paid_now_method='cash' WHERE id='${f.pending}';
      ${call}
      WITH changed AS (UPDATE sales SET paid_now_confirmed_at=now() WHERE id='${f.pending}' AND status='tab_requested' AND paid_now_confirmed_at IS NULL RETURNING id)
        SELECT count(*) FROM changed;
      WITH changed AS (UPDATE sales SET paid_now_confirmed_at=now() WHERE id='${f.pending}' AND status='tab_requested' AND paid_now_confirmed_at IS NULL RETURNING id)
        SELECT count(*) FROM changed;
      ${call} ROLLBACK;`).split("\n").map((line) => JSON.parse(line));
    expect(output[0]).toEqual({ ok: false, error: "immediate_payment_unconfirmed" });
    expect(output[1]).toBe(1);
    expect(output[2]).toBe(0);
    expect(output[3]).toMatchObject({ ok: true, limitCents: 5000 });
  });

  it("cancels a requested tab once and preserves its confirmed receipt", () => {
    const f = fixture({ sales: [], repayments: [] }, 7500);
    const output = sql(`${f.query}
      UPDATE sales SET shop_customer_id='${f.customer}',method='tab',status='tab_requested',tab_cents=5000,
        paid_now_cents=2500,paid_now_method='demo_card',paid_now_confirmed_at=now() WHERE id='${f.pending}';
      WITH changed AS (UPDATE sales SET status='cancelled' WHERE id='${f.pending}' AND status='tab_requested' RETURNING id)
        SELECT count(*) FROM changed;
      WITH changed AS (UPDATE sales SET status='cancelled' WHERE id='${f.pending}' AND status='tab_requested' RETURNING id)
        SELECT count(*) FROM changed;
      SELECT json_build_object('status',status,'received',paid_now_cents,'confirmed',paid_now_confirmed_at IS NOT NULL) FROM sales WHERE id='${f.pending}';
      ROLLBACK;`).split("\n").map((line) => JSON.parse(line));
    expect(output).toEqual([1, 0, { status: "cancelled", received: 2500, confirmed: true }]);
  });

  it("records a full cash sale once and rejects an invalid paid-to-cancelled transition", () => {
    const f = fixture({ sales: [], repayments: [] });
    const pay = `UPDATE sales SET method='cash',paid_now_cents=1,paid_now_method='cash',paid_now_confirmed_at=now(),status='paid' WHERE id='${f.pending}' AND status='pending'`;
    const output = sql(`${f.query}
      WITH changed AS (${pay} RETURNING id) SELECT count(*) FROM changed;
      WITH changed AS (${pay} RETURNING id) SELECT count(*) FROM changed;
      SELECT used_at IS NOT NULL FROM sales WHERE id='${f.pending}'; ROLLBACK;`).split("\n");
    expect(output).toEqual(["1", "0", "t"]);
    expect(() => sql(`${f.query}${pay}; UPDATE sales SET status='cancelled' WHERE id='${f.pending}'; ROLLBACK;`)).toThrow();
  });

  it("approves once, rejects replays, and retains the owner boundary", () => {
    const f = fixture(cases.find((entry) => entry.name === "late installments reduce score to zero but retain R50")!.history);
    const call = (owner = f.owner) => `SELECT approve_tab_atomic('${f.pending}','${f.customer}','${f.shop}','${owner}',NULL,false,false);`;
    const output = sql(`${f.query}${call(randomUUID())}${call()}${call()} ROLLBACK;`).split("\n").map((line) => JSON.parse(line));
    expect(output[0]).toEqual({ ok: false, error: "forbidden" });
    expect(output[1]).toMatchObject({ ok: true, limitCents: 5000 });
    expect(output[2]).toEqual({ ok: false, error: "sale_not_approvable" });
  });
});

// Always run the original failure case even when PostgreSQL is not configured.
it("keeps the existing R50 starter floor after low-score late repayments", () => {
  const regression = cases.find((entry) => entry.name === "late installments reduce score to zero but retain R50")!;
  expect(calculateBuyingPower(regression.history, now)).toMatchObject({ score: 0, limitCents: 5000, level: 1 });
});
