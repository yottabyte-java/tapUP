import { execFileSync, spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const container = process.env.TAPUP_TEST_POSTGRES_CONTAINER;
const database = `tapup_cash_${randomUUID().replaceAll("-", "")}`;
let databaseCreated = false;
function args(db = database, applicationName = "cash-test") {
  if (!container || !/^[a-zA-Z0-9_-]+$/.test(container)) throw new Error("Disposable PostgreSQL container required");
  if (!/^[a-zA-Z0-9_-]+$/.test(applicationName)) throw new Error("Unsafe local PostgreSQL application name");
  // WHY: PGAPPNAME is sent in libpq's startup packet, so pg_stat_activity can identify the connection before its first SQL statement runs.
  return ["exec", "-i", "-e", `PGAPPNAME=${applicationName}`, container, "psql", "-X", "-qAt", "-v", "ON_ERROR_STOP=1", "-U", "postgres", "-d", db];
}
function sql(query: string, db = database, name = "cash-test") {
  if (!/^[a-zA-Z0-9_-]+$/.test(name)) throw new Error("Unsafe local PostgreSQL application name");
  return execFileSync("docker", args(db, name), { input: query, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"], timeout: 30_000 }).trim();
}
function session(query: string, name: string, keepOpen = false) {
  if (!/^[a-zA-Z0-9_-]+$/.test(name)) throw new Error("Unsafe local PostgreSQL application name");
  const child = spawn("docker", args(database, name), { timeout: 30_000 });
  let stdout = "", stderr = "";
  child.stdout.on("data", (chunk) => { stdout += chunk; });
  child.stderr.on("data", (chunk) => { stderr += chunk; });
  const done = new Promise<{ code: number | null; stdout: string; stderr: string }>((resolve, reject) => {
    child.on("error", reject);
    child.on("close", (code) => resolve({ code, stdout: stdout.trim(), stderr }));
  });
  child.stdin.write(`SET statement_timeout = '25s';\n${query}\n`);
  if (!keepOpen) child.stdin.end();
  return { child, done };
}
async function waitForSessions(
  names: string[],
  expected: "holds_row_lock" | "blocked",
  running: Array<{ name: string; process: ReturnType<typeof session> }> = [],
  blockerNames: string[] = [],
) {
  if (names.length === 0 || names.some((name) => !/^[a-zA-Z0-9_-]+$/.test(name))) {
    throw new Error("Unsafe local PostgreSQL session name");
  }
  const appNames = names.map((name) => `'${name}'`).join(",");
  if (blockerNames.some((name) => !/^[a-zA-Z0-9_-]+$/.test(name))) throw new Error("Unsafe blocker session name");
  if (expected === "blocked" && blockerNames.length === 0) throw new Error("Blocked-state check requires a named blocker");
  const condition = expected === "holds_row_lock"
    ? "a.xact_start IS NOT NULL AND EXISTS (SELECT 1 FROM pg_catalog.pg_locks AS l WHERE l.pid = a.pid AND l.locktype = 'advisory' AND l.granted)"
    : `a.state = 'active' AND a.wait_event_type = 'Lock' AND a.wait_event IS NOT NULL AND EXISTS (
      SELECT 1 FROM pg_catalog.pg_stat_activity AS blocker
      WHERE blocker.application_name IN (${blockerNames.map((name) => `'${name}'`).join(",")})
        AND blocker.pid = ANY(pg_catalog.pg_blocking_pids(a.pid)))`;
  // WHY: The advisory barrier proves the designated row lock is held; each contender must then be observed waiting on that lock-holder or an earlier contender in the same queue.
  try {
    sql(`DO $wait$
    DECLARE attempt integer; found_sessions integer; observed text;
    BEGIN
      FOR attempt IN 1..800 LOOP
        -- WHY: PostgreSQL caches statistics snapshots within a transaction; refresh activity/lock views on every poll.
        PERFORM pg_catalog.pg_stat_clear_snapshot();
        SELECT count(*) INTO found_sessions
          FROM pg_catalog.pg_stat_activity AS a
          WHERE a.application_name IN (${appNames}) AND ${condition};
        IF found_sessions = ${names.length} THEN RETURN; END IF;
        PERFORM pg_catalog.pg_sleep(0.025);
      END LOOP;
      PERFORM pg_catalog.pg_stat_clear_snapshot();
      SELECT pg_catalog.string_agg(
        pg_catalog.format('%s pid=%s state=%s xact_start=%s advisory_grants=%s query=%s wait=%s:%s blockers=%s blocker_names=%s', a.application_name, a.pid,
          a.state, a.xact_start, (SELECT count(*) FROM pg_catalog.pg_locks AS l WHERE l.pid=a.pid AND l.locktype='advisory' AND l.granted), a.query, a.wait_event_type, a.wait_event, pg_catalog.pg_blocking_pids(a.pid),
          (SELECT pg_catalog.string_agg(b.application_name, ',') FROM pg_catalog.pg_stat_activity AS b
            WHERE b.pid = ANY(pg_catalog.pg_blocking_pids(a.pid)))), '; ')
        INTO observed
        FROM pg_catalog.pg_stat_activity AS a
        WHERE a.application_name IN (${appNames});
      RAISE EXCEPTION 'Expected PostgreSQL session condition % was not reached; observed: %',
        '${expected}', COALESCE(observed, 'no matching sessions');
    END
    $wait$;`);
  } catch (error) {
    const exited = running.filter(({ process }) => process.child.exitCode !== null);
    if (exited.length > 0) {
      const results = await Promise.all(
        exited.map(({ name, process }) => process.done.then((result) => ({ name, ...result }))),
      );
      const details = results.map(({ name, code, stderr }) => `${name} exited ${code}: ${stderr.trim() || "no stderr"}`).join("; ");
      throw new Error(`${error instanceof Error ? error.message : "PostgreSQL session wait failed"}; ${details}`);
    }
    const pending = running.filter(({ process }) => process.child.exitCode === null)
      .map(({ name }) => `${name} process still running`).join("; ");
    if (pending) throw new Error(`${error instanceof Error ? error.message : "PostgreSQL session wait failed"}; ${pending}`);
    throw error;
  }
}

function rowLockBlocker(table: "sales" | "shop_customers", id: string, name: string) {
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw new Error("Unsafe PostgreSQL row-lock ID");
  // WHY: The transaction advisory lock is an observable barrier acquired only after the row lock succeeds.
  return session(`BEGIN; SELECT id FROM ${table} WHERE id='${id}' FOR UPDATE; SELECT pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext('${name}'));`, `${name}_block`, true);
}

function waitForQrExpiry(saleId: string) {
  if (!/^[0-9a-f-]{36}$/i.test(saleId)) throw new Error("Unsafe local sale ID");
  // WHY: Use the database's immutable fixture expiry as the synchronization point, not an assumed wall-clock duration.
  sql(`SELECT pg_catalog.pg_sleep(greatest(0,
    extract(epoch FROM expires_at - pg_catalog.clock_timestamp())) + 0.05)
    FROM public.sales WHERE id='${saleId}'`);
}

describe.skipIf(!container)("PostgreSQL cash confirmation expiry", () => {
  beforeAll(async () => {
    // WHY: Each suite owns a fresh database; no existing database or customer data is reset.
    sql(`CREATE DATABASE ${database}`, "postgres");
    databaseCreated = true;
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
    const approvalBefore = sql("SELECT pg_get_functiondef('public.approve_tab_atomic(uuid,uuid,uuid,uuid,text,boolean,boolean)'::regprocedure)");
    const priorMigration = readFileSync("supabase/migrations/202610250002_guard_cash_confirmation_expiry.sql", "utf8");
    const currentMigration = readFileSync("supabase/migrations/202610260001_guard_qr_expiry_after_lock.sql", "utf8");
    const completionMigration = readFileSync("supabase/migrations/202610260003_complete_redeemed_qr_requests.sql", "utf8");
    // WHY: Existing installations apply migrations in order; the newest definition must restore the canonical trigger.
    sql(priorMigration);
    sql(priorMigration);
    sql(currentMigration);
    sql(currentMigration);
    sql(completionMigration);
    sql(completionMigration);
    expect(sql("SELECT pg_get_functiondef('public.enforce_sale_state_transition()'::regprocedure)")).toBe(before);
    expect(sql("SELECT pg_get_functiondef('public.approve_tab_atomic(uuid,uuid,uuid,uuid,text,boolean,boolean)'::regprocedure)")).toBe(approvalBefore);
  });

  afterAll(() => {
    if (!databaseCreated) return;
    // WHY: Remove only the uniquely named disposable database this suite created, including sessions left by a failed assertion.
    sql(`SELECT pg_terminate_backend(pid) FROM pg_catalog.pg_stat_activity WHERE datname='${database}' AND pid <> pg_catalog.pg_backend_pid()`, "postgres", "cash_test_cleanup");
    sql(`DROP DATABASE ${database}`, "postgres", "cash_test_cleanup");
    databaseCreated = false;
  });

  function fixture(split: boolean, seconds = 60, unusedQr = false) {
    const owner = randomUUID(), shop = randomUUID(), customer = randomUUID(), sale = randomUUID();
    sql(`INSERT INTO auth.users(id) VALUES ('${owner}');
      INSERT INTO profiles(id,role,full_name) VALUES ('${owner}','shop_owner','Synthetic owner');
      INSERT INTO shops(id,owner_id,name) VALUES ('${shop}','${owner}','Synthetic shop');
      INSERT INTO shop_customers(id,shop_id,customer_phone,display_name,consent_at)
        VALUES ('${customer}','${shop}','+27820000000','Synthetic customer',now());
      INSERT INTO sales(id,shop_id,items,total_cents,qr_token_hash,expires_at)
        VALUES ('${sale}','${shop}','[]',7500,'${randomUUID()}',clock_timestamp()+interval '${seconds} seconds');`);
    if (!unusedQr) sql(`UPDATE sales SET shop_customer_id='${customer}',method='${split ? "tab" : "cash"}',
        status='${split ? "tab_requested" : "pending"}',paid_now_cents=${split ? 2500 : 7500},
        tab_cents=${split ? 5000 : 0},paid_now_method='cash',used_at=now() WHERE id='${sale}';`);
    return { sale, customer, shop, split };
  }
  type Fixture = ReturnType<typeof fixture>;
  function confirm(f: Fixture) {
    // WHY: Reproduce the action's stale pre-lock timestamp and compare-and-set predicates.
    return `WITH captured AS MATERIALIZED (SELECT clock_timestamp() AS captured_at),
      changed AS (UPDATE sales AS s SET paid_now_confirmed_at=captured.captured_at${f.split ? "" : ",status='paid'"}
      FROM captured
      WHERE s.id='${f.sale}' AND s.shop_id='${f.shop}' AND s.status='${f.split ? "tab_requested" : "pending"}'
        AND s.paid_now_confirmed_at IS NULL AND s.expires_at > captured.captured_at RETURNING s.id)
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

    it(`finishes an already redeemed ${label} cash request after QR expiry`, () => {
      const f = fixture(split);
      // Historical expiry fixture only; the confirmation itself executes every original trigger.
      sql(`BEGIN; SET LOCAL session_replication_role=replica;
        UPDATE sales SET created_at=now()-interval '2 minutes',expires_at=now()-interval '1 minute' WHERE id='${f.sale}'; COMMIT;`);
      expect(sql(`UPDATE sales SET paid_now_confirmed_at=now()${split ? "" : ",status='paid'"} WHERE id='${f.sale}' RETURNING status`))
        .toBe(split ? "tab_requested" : "paid");
      expect(sql(`SELECT paid_now_confirmed_at IS NOT NULL FROM sales WHERE id='${f.sale}'`)).toBe("t");
    });

    it.each(split ? ["sale-1", "sale-2", "customer"] : ["sale-1", "sale-2", "assignment"])(`finishes redeemed ${label} cash after a lock wait (%s)`, async (lock) => {
      // WHY: Full-suite startup and Docker scheduling can consume several seconds before the waiter reaches PostgreSQL.
      const f = fixture(split, 12);
      if (lock === "assignment") sql(`UPDATE sales SET shop_customer_id=NULL WHERE id='${f.sale}'`);
      const before = snapshot(f);
      const name = `cash_${randomUUID()}`;
      const lockTarget = lock === "customer" || lock === "assignment"
        ? { table: "shop_customers" as const, id: f.customer }
        : { table: "sales" as const, id: f.sale };
      const blocker = rowLockBlocker(lockTarget.table, lockTarget.id, name);
      try {
        await waitForSessions([`${name}_block`], "holds_row_lock", [{ name: `${name}_block`, process: blocker }]);
        const query = confirm(f);
        const write = session(lock === "assignment"
          ? query.replace("SET paid_now_confirmed_at=", `SET shop_customer_id='${f.customer}',paid_now_confirmed_at=`)
          : query, name);
        await waitForSessions([name], "blocked", [{ name, process: write }], [`${name}_block`]);
        expect(sql(`SELECT expires_at > clock_timestamp() FROM sales WHERE id='${f.sale}'`)).toBe("t");
        // WHY: Release only after the DB's expiry boundary, not after an assumed wall-clock sleep.
        sql(`SELECT pg_sleep(greatest(0,extract(epoch FROM expires_at-clock_timestamp()))+0.05) FROM sales WHERE id='${f.sale}'`);
        blocker.child.stdin.end("COMMIT;\n");
        expect((await blocker.done).code).toBe(0);
        const result = await write.done;
        expect(result.code).toBe(0);
        expect(result.stdout).toBe("1");
        expect(snapshot(f)).not.toBe(before);
      } finally {
        if (!blocker.child.stdin.destroyed) blocker.child.stdin.end("ROLLBACK;\n");
        await blocker.done;
      }
    }, 45000);

    it(`serializes concurrent ${label} confirmations to one receipt`, async () => {
      const f = fixture(split);
      const name = `duplicate_${randomUUID()}`;
      const blocker = rowLockBlocker("sales", f.sale, name);
      try {
        await waitForSessions([`${name}_block`], "holds_row_lock", [{ name: `${name}_block`, process: blocker }]);
        const query = confirm(f);
        // WHY: Establish the first wait before launching the second contender; otherwise CI startup scheduling can leave one psql process at ClientRead when the barrier observation begins.
        const aName = `${name}_a`, bName = `${name}_b`, blockerName = `${name}_block`;
        const a = session(query, aName);
        await waitForSessions([aName], "blocked", [{ name: aName, process: a }], [blockerName]);
        const b = session(query, bName);
        await waitForSessions([bName], "blocked", [{ name: bName, process: b }], [blockerName, aName]);
        blocker.child.stdin.end("COMMIT;\n");
        const results = await Promise.all([a.done, b.done]);
        expect(results.map((r) => r.code)).toEqual([0, 0]);
        expect(results.map((r) => r.stdout).sort()).toEqual(["0", "1"]);
        expect(sql(`SELECT count(*) FROM repayments WHERE sale_id='${f.sale}'`)).toBe("0");
      } finally {
        if (!blocker.child.stdin.destroyed) blocker.child.stdin.end("ROLLBACK;\n");
        await blocker.done;
      }
    }, 45000);
  }

  it.each(["tab request", "demo-card purchase"])("rejects a %s queued on the customer lock until after QR expiry", async (transition) => {
    // WHY: These cases test first redemption; an already-consumed cash fixture cannot prove QR-expiry locking.
    const f = fixture(false, 6, true);
    const before = snapshot(f);
    const name = `qr_expiry_${randomUUID()}`;
    const blocker = rowLockBlocker("shop_customers", f.customer, name);
    try {
      await waitForSessions([`${name}_block`], "holds_row_lock", [{ name: `${name}_block`, process: blocker }]);
      const transitionSql = transition === "tab request"
        ? `UPDATE sales SET shop_customer_id='${f.customer}',method='tab',status='tab_requested',
             paid_now_cents=0,tab_cents=7500,used_at=clock_timestamp() WHERE id='${f.sale}';`
        : `UPDATE sales SET shop_customer_id='${f.customer}',method='demo_card',status='paid',
             paid_now_cents=7500,tab_cents=0,paid_now_method='demo_card',paid_now_confirmed_at=clock_timestamp()
           WHERE id='${f.sale}';`;
      const write = session(transitionSql, name);
      await waitForSessions([name], "blocked", [{ name, process: write }], [`${name}_block`]);
      waitForQrExpiry(f.sale);
      blocker.child.stdin.end("COMMIT;\n");
      expect((await blocker.done).code).toBe(0);
      const result = await write.done;
      expect(result.code).not.toBe(0);
      expect(result.stderr).toContain("Sale QR has expired");
      expect(snapshot(f)).toBe(before);
    } finally {
      if (!blocker.child.stdin.destroyed) blocker.child.stdin.end("ROLLBACK;\n");
      await blocker.done;
    }
  }, 45000);
});
