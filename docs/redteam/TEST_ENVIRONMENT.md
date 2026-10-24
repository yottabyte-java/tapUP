# Red-team test environment preparation

## Phase 1 boundary

This document prepares a disposable test setup; it does not connect to Supabase or mutate a
database. The hosted URL configured in the existing `.env.local` was not printed or contacted.
Never treat a project as a test target based only on its display name.

## Repository and tooling state inspected

- Branch: `master`
- Commit: `724ff37`
- Worktree was clean before these preparation documents were added.
- The repository has `supabase/schema.sql`, `supabase/rls.sql`, `supabase/rls-checks.sql`,
  and `supabase/seed.sql`.
- `tests/` contains Vitest unit and mocked security/API tests; `package.json` has `npm test`
  (`vitest run`), but no integration or E2E test command/configuration.
- Docker is installed, but no local Supabase containers/configuration were found. Supabase CLI
  and `psql` were not available in PATH.
- `.env.local` exists. Only its variable names were inspected. `.env.example`, `.env.test`, and
  `.env.redteam.local` do not exist.
- `.gitignore` ignores `.env*`; `git check-ignore .env.redteam.local` confirmed that a proposed
  file with this name would be ignored.

## Environment variables

| Variable | Needed for | Notes |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Next.js server/client Supabase access | Required for protected routes; must come from the separately verified test project. |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Session-aware Supabase clients and `proxy.ts` | Required for protected routes; only use the confirmed test project. |
| `SUPABASE_SERVICE_ROLE_KEY` | Server actions and privileged state snapshots | Required for tested server mutations. Secret; server-only, never browser code, commits, chat, or logs. |
| `LENDER_API_KEY` | Lender API requests | Required only when testing the lender route; use a new test-only value. |
| `NEXT_PUBLIC_APP_URL` | Documented app setting | Not read by current TypeScript source; not currently required. Use a loopback origin if a future flow requires it. |

Existing unit tests use mocks and test-only stub values; they do not need a Supabase project.
No database-backed test scaffold exists yet. The minimum for protected app flows is the URL,
anon key, and service-role key; include the lender key to test the lender endpoint. `npm test`
uses no Supabase environment variables.

### Safe configuration decision

Do not create `.env.redteam.local` at this stage. Although `.gitignore` ignores it, Next.js does
not load arbitrary `.env.<name>.local` files by default. A custom loader would need to be added
and reviewed to prevent accidental fallback to `.env.local`. For a later approved run, use a separate PowerShell process and explicitly provide **all**
variables used by the planned test surface (Supabase URL, anon key, service-role key, and lender
key when testing that route). Do not rely on `.env.local` defaults. Providing the consumed values
in the process prevents a missing test value from silently falling back to another project's
configuration.

Before any later connection, compare the project's displayed name **and project reference** in
Supabase Dashboard > Project Settings > General against the separate test-project details you
intend to use. Confirm that its reference differs from the existing project, that it contains
no valuable data, and that it is disposable. Do not put credentials in this repository or send
them in chat. If the project identity is unclear, stop.

## Synthetic fixture design

Use only new test accounts and generated UUIDs in the confirmed disposable project. The schema
has no auth-user/profile creation trigger: the app's signup flow creates an Auth user, inserts
`profiles`, and creates a `shops` row for an owner. Prefer that flow for base identities.

| Fixture | Application records | Purpose |
|---|---|---|
| Shop A owner | Auth user with `profiles.role = 'shop_owner'`; one shop named `RT Shop A <run-id>` | Authorized owner and cross-shop attacker identity |
| Shop B owner | Separate owner account and one `RT Shop B <run-id>` shop | Foreign-shop target and reciprocal authorization check |
| Customer A | Auth user with `profiles.role = 'customer'`; linked `shop_customers` row in Shop A | Own-row positive control and customer IDOR attacker |
| Customer B | Separate customer account and linked row in Shop B; optionally another row in Shop A for same-shop isolation | Foreign customer/sale target |
| Phone-only customer | Shop A `shop_customers` row with no `customer_profile_id`, consent timestamp, and a PIN set through the app | PIN/lockout tests |
| Linking variants | Additional synthetic customer accounts and unlinked shop-customer rows per case | Matching confirmed phone, mismatching confirmed phone, missing/unconfirmed phone, and no-consent/RPC rejection |
| Sale fixtures | Pending QR sale, tab-requested sale, approved tab, fully and partially repaid tabs; one sale per relevant shop/customer | QR, amount, tab limit, replay, repayment, and ownership tests |

Use a unique run tag in shop/customer display names and Auth emails under the reserved `.test`
domain; never reuse judge/demo accounts. Phone strings must be synthetic and must not receive
SMS. The current action accepts South-African phone formatting, while Supabase Auth phone
confirmation may impose additional validation. Configure a test-only Auth confirmation method
in the test project; if confirmation cannot be created without contacting a real number, leave
those cases unverified rather than use real customer data or send SMS.

Respect the actual schema:

- `profiles.id` references `auth.users.id`; only `shop_owner` and `customer` roles are valid.
- Each shop/customer pair is unique; each customer row's `customer_profile_id` is unique per
  shop, and a linked row requires `consent_at`.
- A sale's `(shop_id, shop_customer_id)` must refer to a customer in that same shop.
- New sales start `pending`; state-transition and repayment triggers enforce allowed transitions,
  QR expiry, one-use state, tender totals, available limit, repayment balance, `paid_at`,
  `on_time`, and full-repayment status.
- Buying-power limits are cents, from R0 to R300 in R50 increments. Use app flows to create sale
  states; do not bypass trigger invariants with hand-crafted rows.

Do **not** run `supabase/seed.sql` for this lab. It deletes and recreates rows under a fixed
demo-shop UUID and is not a red-team fixture loader.

## Project setup checklist for a later approved phase

1. Verify the separate project name and project reference in the dashboard; compare the
   reference to the existing project without printing or copying any secret.
2. Confirm the test project is disposable and contains no data to preserve.
3. Review the SQL files; apply `schema.sql` and `rls.sql` only to the verified blank test project.
   Do not disable RLS. Do not run `seed.sql`.
4. Create the test accounts using the app signup flow and unique `.test` emails. Confirm each
   account has the expected profile role and exactly one shop for each owner.
5. Set test-only phone confirmation behavior without sending SMS to a real number.
6. Start the app from a separate PowerShell process with all required test-project variables
   explicitly set, and use a loopback-only local app URL.
7. Record the starting fixture IDs and a read-only database baseline before attempting attacks.
8. Stop if the displayed project reference, credentials source, or data ownership is ambiguous.
