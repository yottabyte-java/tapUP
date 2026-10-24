# tapUp runtime red-team attack plan

## Scope and execution boundary

This plan is for the app running locally against a confirmed, separate, disposable Supabase
project only. Phase 1 did not connect to either hosted Supabase project and did not run attacks.
Do not proceed if the dashboard project reference is not independently confirmed. Never use
production/demo users, real customer data, real SMS, destructive traffic, database resets, or
RLS-disabled test modes.

The repository currently has unit/mocked Vitest tests only; no live integration/E2E harness,
Supabase CLI, `psql`, or local Supabase stack is present. Phase 2 should add a focused runtime
harness only after project approval. It must fail closed unless it is given an explicit test
project reference and matches the configured Supabase URL. No test should silently fall back to
`.env.local`.

## Baseline and evidence rules

For each attempt, record:

1. Test identity and role, request/action, target shop/customer/sale, expected result, and actual
   HTTP/action result.
2. A read-only state snapshot before the attempt.
3. The same snapshot after the attempt, taken with a test-only privileged observer and scoped to
   the fixture IDs.
4. Whether the response was denied **and** whether the persisted state remained unchanged.

Never equate a `4xx`, empty response, or zero rows returned to proof of no mutation. Assert exact
row counts, status/tender/relationship fields, repayment totals, PIN lock counters, and affected
IDs before and after. Use only a few deterministic requests. For write attempts, retain fixtures
for evidence until the result is recorded; clean up only rows carrying that run's unique marker
and only after explicit review.

Use two distinct test access paths:

- **RLS path:** Supabase anon/publishable client authenticated as a test user, or the existing
  `supabase/rls-checks.sql` executed with test JWT claims. Never use a service-role client for
  requests intended to test RLS.
- **Application path:** Local app and browser session for that identity; exercise the existing
  server actions/routes and capture the actual response.
- **State observer:** Test-only service-role client or SQL observer, restricted to exact fixture
  IDs, used only to compare before/after state. Never send its key to a browser.

RLS behavior may return an error or an empty/zero-row result for denied operations. Tests must
assert the row count/state as well as response semantics.

## Runtime matrix

| Area | Attempt | Required assertion and state check |
|---|---|---|
| Unauthenticated access | Request `/shop/*`, `/me`, and `/pay/*`; call sensitive server actions without a session | Protected requests redirect/deny; no fixture rows or balances change |
| Role authorization | Customer session requests shop routes/actions; shop owner requests customer-only routes/actions; unknown profile role | Intentional deny/redirect; no mutation |
| Cross-shop IDOR | Shop A requests Shop B shop/customer/sale IDs; repeat in reverse; vary IDs in every reachable read and mutation flow | Denial/absence plus unchanged Shop B rows |
| Cross-customer IDOR | Customer A queries Customer B and Customer B's sales/repayments, both across shops and within a shared shop fixture | Only A's linked rows visible; no change to B's rows |
| RLS SELECT | As each authenticated identity, query own and foreign profiles, shops, customers, sales, and repayments | Expected own rows visible; foreign rows absent; include positive controls |
| RLS INSERT/UPDATE/DELETE | Direct authenticated PostgREST/SQL operations per table where applicable: profiles (own name vs phone/role), shops, customers, sales, repayments | Authorized policies work only where intended; denied operations fail or affect zero rows; state observer confirms no unauthorized change |
| Phone linking and consent | Try no consent, false consent, pending/expired/used token, wrong phone, missing/unconfirmed phone, and matching confirmed phone. Attempt client update of `profiles.phone` | Only confirmed Auth phone matching an active unlinked row plus explicit consent can link; failed attempts leave both records unchanged |
| PIN | Set a test PIN on phone-only fixture; make five wrong attempts; then correct PIN in lockout window, new browser/session, and altered forwarded-IP case; test after expiry | Persisted row reaches lock at five failures, all sessions remain blocked through lockout, no approval occurs; verify no PIN/hash exposure |
| QR | Replay the same valid token; tamper token/amount/customer/shop fields; submit at/after expiry; send only two simultaneous redemption requests | At most one state transition; DB sale has one customer/tender transition and one-use marker; altered request does not change it |
| Sale tampering / mass assignment | Modify total, product price, quantity, customer/shop/status/method, and add role/limit/approved/verified fields to actual app requests | Server derives amount from catalogue and rejects unexpected fields; persisted sale fields match authoritative calculation only |
| Buying-power/tab limit | Request a tab just below, at, and above remaining limit; use two distinct sales whose combined tabs exceed available limit | Above-limit action denied and database trigger rejects; after each request compare approved tab exposure to limit |
| Concurrent approval race | Set available power to a known amount; issue exactly two barrier-synchronized approvals that individually fit but jointly exceed it | At most one approved; inspect sale statuses, outstanding repayment-adjusted balance, and limit after both complete |
| Replay | Replay tab approval and repayment requests; replay sale/pay request if idempotency is expected | One logical approval/repayment only; compare sale status and repayment row count/total |
| Repayment rules | Try zero, negative, non-integer, over-balance, cross-shop, duplicate, partial, and final payment; vary client `paid_at`/`on_time` if accepted | Only valid owner payments persist; database clock determines time/on-time and full balance changes status to `repaid` once |
| Lender API | Missing, empty, wrong and malformed keys; then valid test key with valid/foreign IDs and extra query parameters | Unauthorized calls do not load data; valid response contains only limit, level, reasons, demo; no name/phone/raw history; verify no-store and rate limit |
| XSS / SQL-looking text | Submit inert `<script>`/`<img onerror>` strings and quote/`OR` strings to accepted text/search fields; reload/render locally | Payload stays text, no script executes, no query broadening or unexpected rows; compare stored text exactly |
| Data dumping / session | Try large pagination, absent filters, guessed IDs, copied own test cookies only between test browsers, and forged role/query fields | Only role/relationship-scoped fixture data returned; no session or role escalation |

## RLS DML checklist

Use the database grants and policies actually defined in `supabase/rls.sql`; distinguish missing
SQL privilege from a row blocked by RLS. Test both outcomes without weakening either control.

- `profiles`: own SELECT and name update; phone/role update and INSERT/DELETE should be denied.
- `shops`: owner sees/updates/deletes own shop and cannot read/change another shop; insert must
  use the authenticated owner and `shop_owner` role. If testing DELETE, use only a disposable
  fixture and confirm before/after state; prefer a rolled-back SQL transaction.
- `shop_customers`: owner can access only their shop; a customer can select only their linked
  record. Attempt cross-shop insert/update/delete and verify no effect.
- `sales`: related SELECT only; direct client INSERT/UPDATE/DELETE are intentionally denied.
- `repayments`: related SELECT only; direct client INSERT/UPDATE/DELETE are intentionally denied.

The existing `supabase/rls-checks.sql` has SELECT checks and a `pin_hash` column-grant check. It
is not a complete DML test suite. Extend it or use authenticated PostgREST calls in Phase 2 and
verify each attempted operation against the state observer.

## Safe sequencing

1. Confirm project reference and apply schema/RLS only in the verified disposable project.
2. Create run-tagged synthetic accounts and seed only through the app or reviewed test-only
   fixture setup. Do not use the destructive fixed-ID demo `supabase/seed.sql`.
3. Run positive controls first (owner sees own shop; customer sees own linked sale).
4. Run low-volume negative cases and state snapshots.
5. Run the two-request concurrency/replay checks last, resetting only the specific disposable
   fixtures through reviewed, scoped cleanup.
6. If a request appears to succeed unexpectedly, stop further attacks, preserve evidence, check
   database state, and report the exploit before attempting a fix.
7. Mark unrun cases `NOT VERIFIED`; do not infer runtime behavior from static policy text or
   mocked tests.

## Current baseline

Existing local-only validation at preparation time: `npm test` (Vitest). Existing static
security tests inspect policy SQL and mock action/API boundaries; they do not prove live RLS,
authenticated authorization, or database non-mutation. No runtime attack is claimed by this plan.
