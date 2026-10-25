import { execFileSync, spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { setTimeout as delay } from "node:timers/promises";
import { beforeAll, describe, expect, it } from "vitest";

const container = process.env.TAPUP_TEST_POSTGRES_CONTAINER;
const database = `tapup_cash_${randomUUID().replaceAll("-", "")}`;
function args(db = database, name = "cash-test") {
  if (!container || !/^[a-zA-Z0-9_-]+$/.test(container)) throw new Error("Disposable PostgreSQL container required");
  return ["exec", "-i", "-e", `PGAPPNAME=${name}`, container, "psql", "-X", "-qAt", "-v", "ON_ERROR_STOP=1", "-U", "postgres", "-d", db];
}
function sql(query: string, db = database) {
  return execFileSync("docker", args(db), { input: query, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] }).trim();
}
function session(query: string, name: string, keepOpen = false) {
  const child = spawn("docker", args(database, name));
  let stdout = "", stderr = "";
  child.stdout.on("data", (chunk) => { stdout += chunk; });
  child.stderr.on("data", (chunk) => { stderr += chunk; });
  const done = new Promise<{ code: number | null; stdout: string; stderr: string }>((resolve, reject) => {
    child.on("error", reject);
    child.on("close", (code) => resolve({ code, stdout: stdout.trim(), stderr }));
  });
  child.stdin.write(`SET statement_timeout = '12s';\n${query}\n`);
  if (!keepOpen) child.stdin.end();
  return { child, done };
}
async function waitFor(predicate: string) {
  for (let attempt = 0; attempt < 60; attempt++) {
    if (sql(`SELECT EXISTS (${predicate});`) === "t") return;
    await delay(25);
  }
  throw new Error("Expected database lock state was not reached");
}

describe.skipIf(!container)("PostgreSQL cash confirmation expiry", () => {
  beforeAll(async () => {
    // WHY: Each suite owns a fresh database; no existing database or customer data is reset.
    sql(`CREATE DATABASE ${database}`, "postgres");
    // Role creation can race the existing parity suite on a fresh CI server.
    sql(`DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='anon') THEN CREATE ROLE anon; END IF;
      IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated; END IF;
      IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='service_role') THEN CREATE ROLE service_role; END IF;
      EXCEPTION WHEN duplicate_object OR unique_violation THEN NULL;
    END $$;`);
    sql(`CREATE SCHEMA auth;
      CREATE TABLE auth.users(id uuid PRIMARY KEY, phone text, phone_confirmed_at timestamptz);
      CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT NULL::uuid $$;
      ${readFileSync("supabase/schema.sql", "utf8")}
      ${readFileSync("supabase/rls.sql", "utf8")}`);
    const before = sql("SELECT pg_get_functiondef('public.enforce_sale_state_transition()'::regprocedure)");
    const migration = readFileSync("supabase/migrations/202610250002_guard_cash_confirmation_expiry.sql", "utf8");
    sql(migration);
    sql(migration);
    expect(sql("SELECT pg_get_functiondef('public.enforce_sale_state_transition()'::regprocedure)")).toBe(before);
  });

  function fixture(split: boolean, seconds = 60) {
    const owner = randomUUID(), shop = randomUUID(), customer = randomUUID(), sale = randomUUID();
    sql(`INSERT INTO auth.users(id) VALUES ('${owner}');
      INSERT INTO profiles(id,role,full_name) VALUES ('${owner}','shop_owner','Synthetic owner');
      INSERT INTO shops(id,owner_id,name) VALUES ('${shop}','${owner}','Synthetic shop');
      INSERT INTO shop_customers(id,shop_id,customer_phone,display_name,consent_at)
        VALUES ('${customer}','${shop}','+27820000000','Synthetic customer',now());
      INSERT INTO sales(id,shop_id,items,total_cents,qr_token_hash,expires_at)
        VALUES ('${sale}','${shop}','[]',7500,'${randomUUID()}',clock_timestamp()+interval '${seconds} seconds');
      UPDATE sales SET shop_customer_id='${customer}',method='${split ? "tab" : "cash"}',
        status='${split ? "tab_requested" : "pending"}',paid_now_cents=${split ? 2500 : 7500},
        tab_cents=${split ? 5000 : 0},paid_now_method='cash',used_at=now() WHERE id='${sale}';`);
    return { sale, customer, shop, split };
  }
  type Fixture = ReturnType<typeof fixture>;
  function confirm(f: Fixture) {
    // WHY: Reproduce the action's stale pre-lock timestamp and compare-and-set predicates.
    const captured = sql("SELECT clock_timestamp()");
    return `WITH changed AS (UPDATE sales SET paid_now_confirmed_at='${captured}'${f.split ? "" : ",status='paid'"}
      WHERE id='${f.sale}' AND shop_id='${f.shop}' AND status='${f.split ? "tab_requested" : "pending"}'
        AND paid_now_confirmed_at IS NULL AND expires_at > '${captured}' RETURNING id)
      SELECT count(*) FROM changed;`;
  }
  function snapshot(f: Fixture) {
    return sql(`SELECT jsonb_build_object('sale',to_jsonb(s),'repayments',
      (SELECT count(*) FROM repayments WHERE sale_id=s.id)) FROM sales s WHERE id='${f.sale}'`);
  }

  for (const split of [false, true]) {
    const label = split ? "split" : "full";
    it(`confirms valid ${label} cash once with the database receipt time`, () => {
      const f = fixture(split);
      // An untrusted pre-lock receipt timestamp must be replaced by database confirmation time.
      const staleTimestamp = "2000-01-01T00:00:00Z";
      expect(sql(`WITH changed AS (UPDATE sales SET paid_now_confirmed_at='${staleTimestamp}'${split ? "" : ",status='paid'"}
        WHERE id='${f.sale}' AND paid_now_confirmed_at IS NULL RETURNING id) SELECT count(*) FROM changed`)).toBe("1");
      expect(sql(`SELECT paid_now_confirmed_at >= created_at FROM sales WHERE id='${f.sale}'`)).toBe("t");
      expect(sql(confirm(f))).toBe("0");
      expect(sql(`SELECT status || ':' || (paid_now_confirmed_at IS NOT NULL)::text FROM sales WHERE id='${f.sale}'`))
        .toBe(`${split ? "tab_requested" : "paid"}:true`);
    });

    it(`rejects already expired ${label} cash without modifying receipts or state`, () => {
      const f = fixture(split);
      // Historical expiry fixture only; the confirmation itself executes every original trigger.
      sql(`BEGIN; SET LOCAL session_replication_role=replica;
        UPDATE sales SET created_at=now()-interval '2 minutes',expires_at=now()-interval '1 minute' WHERE id='${f.sale}'; COMMIT;`);
      const before = snapshot(f);
      expect(() => sql(`UPDATE sales SET paid_now_confirmed_at=now()${split ? "" : ",status='paid'"} WHERE id='${f.sale}'`))
        .toThrow(/Cash request has expired/);
      expect(snapshot(f)).toBe(before);
    });

    it.each(split ? ["sale-1", "sale-2", "customer"] : ["sale-1", "sale-2", "assignment"])(`rejects ${label} cash after a lock wait (%s)`, async (lock) => {
      const f = fixture(split, 4);
      if (lock === "assignment") sql(`UPDATE sales SET shop_customer_id=NULL WHERE id='${f.sale}'`);
      const before = snapshot(f);
      const name = `cash_${randomUUID()}`;
      const lockTarget = lock === "customer" || lock === "assignment" ? `shop_customers WHERE id='${f.customer}'` : `sales WHERE id='${f.sale}'`;
      const blocker = session(`BEGIN; SELECT id FROM ${lockTarget} FOR UPDATE;`, `${name}_block`, true);
      try {
        await waitFor(`SELECT 1 FROM pg_stat_activity WHERE application_name='${name}_block' AND state='idle in transaction'`);
        const query = confirm(f);
        const write = session(lock === "assignment"
          ? query.replace("SET paid_now_confirmed_at=", `SET shop_customer_id='${f.customer}',paid_now_confirmed_at=`)
          : query, name);
        await waitFor(`SELECT 1 FROM pg_stat_activity WHERE application_name='${name}' AND wait_event_type='Lock'`);
        expect(sql(`SELECT expires_at > clock_timestamp() FROM sales WHERE id='${f.sale}'`)).toBe("t");
        // WHY: Release only after the DB's expiry boundary, not after an assumed wall-clock sleep.
        sql(`SELECT pg_sleep(greatest(0,extract(epoch FROM expires_at-clock_timestamp()))+0.05) FROM sales WHERE id='${f.sale}'`);
        blocker.child.stdin.end("COMMIT;\n");
        expect((await blocker.done).code).toBe(0);
        const result = await write.done;
        expect(result.code).not.toBe(0);
        expect(result.stderr).toContain("Cash request has expired");
        expect(snapshot(f)).toBe(before);
      } finally {
        if (!blocker.child.stdin.destroyed) blocker.child.stdin.end("ROLLBACK;\n");
        await blocker.done;
      }
    }, 15000);

    it(`serializes concurrent ${label} confirmations to one receipt`, async () => {
      const f = fixture(split);
      const name = `duplicate_${randomUUID()}`;
      const blocker = session(`BEGIN; SELECT id FROM sales WHERE id='${f.sale}' FOR UPDATE;`, `${name}_block`, true);
      try {
        await waitFor(`SELECT 1 FROM pg_stat_activity WHERE application_name='${name}_block' AND state='idle in transaction'`);
        const query = confirm(f);
        const a = session(query, `${name}_a`), b = session(query, `${name}_b`);
        await waitFor(`SELECT 1 FROM pg_stat_activity WHERE application_name IN ('${name}_a','${name}_b') AND wait_event_type='Lock' HAVING count(*)=2`);
        blocker.child.stdin.end("COMMIT;\n");
        const results = await Promise.all([a.done, b.done]);
        expect(results.map((r) => r.code)).toEqual([0, 0]);
        expect(results.map((r) => r.stdout).sort()).toEqual(["0", "1"]);
        expect(sql(`SELECT count(*) FROM repayments WHERE sale_id='${f.sale}'`)).toBe("0");
      } finally {
        if (!blocker.child.stdin.destroyed) blocker.child.stdin.end("ROLLBACK;\n");
        await blocker.done;
      }
    }, 15000);
  }
});
