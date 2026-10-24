# tapUp Runtime Red Team Report

> **Authoritative update: 2026-10-24.** The sections below this latest assessment are the
> earlier checkpoint and are retained as history; their statements about the absence of a local
> stack are superseded by the results here.

## Latest Assessment

### Scope and environment

- Repository: `C:\Users\User\Downloads\tapup-agents`; branch `security/redteam-hardening`;
  HEAD `724ff37`; no commit or push was made.
- Docker Desktop was healthy. The dedicated Supabase local stack uses project ID
  `tapup-redteam-local-20261024`, API `http://127.0.0.1:54321`, and Postgres port `54322`.
  Its uniquely named database container and volume were separate from the pre-existing Docker
  resources. The local DB was healthy; C: had about 109.6 GiB free after images were downloaded.
  Docker published the API and database ports on all host interfaces while the stack was running;
  no remote clients were tested or contacted. The stack was stopped afterward and those ports were
  confirmed closed.
- `supabase/config.toml` disables automatic seed execution. The existing `supabase/seed.sql` was
  not run. `supabase/schema.sql` and `supabase/rls.sql` were applied only to the unique local
  Postgres container. Five application tables had RLS enabled and 14 policies were installed.
- The only `.env.local` interaction was that Next.js reported its environment-file name during
  build. Its contents were never opened, printed, copied, or used for Supabase connectivity:
  local Supabase URL/keys were captured in process memory and explicitly supplied to tests, build,
  and the app. No hosted Supabase project was contacted. No `.env.redteam.local` was created.
- Variable names used by the harness were `TAPUP_REDTEAM_LOCAL`,
  `TAPUP_REDTEAM_PROJECT_ID`, `TAPUP_REDTEAM_SUPABASE_URL`, `TAPUP_REDTEAM_ANON_KEY`, and
  `TAPUP_REDTEAM_SERVICE_ROLE_KEY`. App-only names were
  `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`,
  `SUPABASE_SERVICE_ROLE_KEY`, and `LENDER_API_KEY`; no values are recorded here.
- The production app was bound to `127.0.0.1:3100` with local-only Supabase configuration for
  route probes, then stopped. After testing, only the uniquely named local Supabase stack was
  stopped; its database volume was retained for review/restart. No test fixture rows remain.

### Commands and safety controls

- `npx --yes supabase status --output env` was captured into process memory; only required variable
  names and the loopback URL were checked. Credential values were never echoed.
- The schema and RLS files were copied into the uniquely named DB container and executed with
  `psql -v ON_ERROR_STOP=1`; `seed.sql` and destructive reset/drop commands were not run.
- `npx vitest run tests/redteam/localSupabase.test.ts` ran with the five explicit local-only
  harness variables above. Browser-role and lender probes used ephemeral Node scripts, temporary
  synthetic Auth identities, and local API URLs; those identities were deleted.
- Ran `npm test`, `npm run lint`, `npx tsc --noEmit`, `npm run build`,
  `npm audit --audit-level=moderate`, and `git diff --check`.
- `npx --yes supabase stop --project-id tapup-redteam-local-20261024 --yes` stopped only this
  project's containers. The local database volume was retained.

### Confirmed issue and fix

The first real local consent-RPC test failed: this Supabase Auth version returned a confirmed
South African phone as `27825550201`, without `+`, while shop customer records are stored as
`+27825550201`. That made the database's exact phone comparison reject a valid customer and the
app validator reject the Auth phone before consent linking. The application validator now accepts
the no-plus international form and canonicalizes it to E.164; `link_shop_customer_with_consent`
normalizes the confirmed Auth phone before comparing it. Regression tests cover the format and
the authenticated RPC. The positive RPC test passed after the fix; mismatched-phone, absent-phone,
and missing-consent paths remained rejected. This result describes the local stack's
observed Auth format; hosted behavior was not tested.

### Results

| Area | Execution and result | Database evidence |
|---|---|---|
| Unauthenticated route access | Local HTTP requests to `/shop/ledger`, `/me`, and `/pay/<token>` returned 307 to `/login`. | No protected page data was returned. |
| Authenticated role boundaries | Synthetic owner could load `/shop/ledger` (200) and was redirected from `/me` and `/pay/<token>` to `/shop/sell`. Synthetic customer could load `/me` and the invalid-token `/pay/<token>` page shell (200), and was redirected from `/shop/ledger` to `/me`. | Test identities and owner shop were deleted afterward. Payment-token acceptance was not tested by this role probe. |
| Security headers | CSP with `frame-ancestors 'none'`, `nosniff`, `strict-origin-when-cross-origin`, and `camera=(self)` observed on protected redirects and lender API response. | Not applicable. |
| Lender API authentication | Missing API key returned 401. With a local placeholder key and a synthetic shop/customer, response was 200 and contained only `demo`, `level`, `limitCents`, and `reasons`; no identity/history fields. | Synthetic owner/shop/customer removed; no hosted calls. |
| Cross-shop and cross-customer SELECT (RLS) | Authenticated PostgREST sessions saw their own shop/customer/sale but not the other shop or another customer's sale in the same shop. | Positive and negative controls passed against local Postgres. |
| RLS INSERT / UPDATE / DELETE | Foreign-shop customer insert, direct sale insert, foreign-customer update, foreign-shop delete, and direct sale delete were denied or affected zero rows. | Service-role before/after checks confirmed no unauthorized rows/changes. |
| Profile phone restriction | Authenticated profile phone update was denied/ineffective. | Before/after service-role reads matched. |
| Consent and confirmed-phone linking | Valid confirmed-phone + consent RPC linked the matching row; wrong phone, absent phone, and no-consent calls failed. | Linked and rejected row state was inspected. |
| Sale amount / QR expiry / replay | Sale-total update was rejected and total unchanged. Expired QR redemption was rejected and sale remained pending/unused. Two concurrent transitions for one valid QR produced at most one state change. | State was read back from local Postgres. |
| Buying-power limit race | Two concurrent 8,000-cent tab approvals against a 10,000-cent customer limit resulted in one approval; total approved exposure did not exceed the limit. | Approved rows and limit were queried after both requests. |
| Repayment overrun / replay / timing | Two concurrent 7,000-cent repayments against a 10,000-cent tab yielded one success. A final 3,000-cent payment settled the sale; a later replay failed. Client-supplied `paid_at`/`on_time` were replaced by database values. | Repayment totals, timestamps, on-time value, and final status were read back. |
| Input validation, XSS, mass assignment, error shape | Unit/security tests passed for strict extra-field rejection, ignored client totals, SQL/script-looking text handling/HTML escaping, generic errors, QR token expiry/tampering, and PIN helper lockout logic. | These are unit/mock checks, not data-backed runtime probes. |

### Important limits / not tested

- PIN guessing and persisted lockout were not exercised through the authenticated server action; only the PIN helper and mocked security tests ran.
- QR amount tampering was not separately submitted to a live route; sale-total tampering was rejected by the database trigger and client-supplied totals were covered by unit tests. QR expiry/replay, tab approval, and repayment were tested at the database trigger or unit/mock layer, not by submitting the browser UI or Next.js Server Action request.
- SQL/script-looking inputs and error-stack/table-name leakage were covered by unit tests; no live XSS/browser payload or database injection campaign was run.
- `supabase/rls-checks.sql` contains placeholder UUIDs and was not executed. Equivalent SELECT/INSERT/UPDATE/DELETE checks were performed with synthetic authenticated PostgREST sessions and verified with service-role reads.
- Hosted Supabase, production/demo data, SMS delivery, external lender systems, and real customer data were not contacted or used. No production security claim is made.

### Fix and regression files

- `lib/validation.ts`: canonicalizes Supabase Auth phone values with or without the E.164 plus sign.
- `supabase/rls.sql`: canonicalizes the confirmed Auth phone inside the consent RPC before matching the stored phone.
- `tests/security.test.ts`: validates canonical phone formats and the SQL normalization guard.
- `tests/redteam/localSupabase.test.ts`: opt-in local-only integration tests; requires explicit loopback URL/project ID and never loads `.env.local`.
- `supabase/config.toml`: unique project ID and automatic seed disabled; `supabase/.gitignore` ignores local CLI state.

### Validation

- `npx vitest run tests/redteam/localSupabase.test.ts` with the explicit local-only environment:
  passed, 7/7 tests.
- `npm test`: passed, 9 test files / 57 tests; the 7 opt-in local integration cases are skipped
  when the required environment variables are absent.
- `npm run lint`: 0 errors; one existing unused-parameter warning remains in
  `lib/lenderData.ts:124`.
- `npx tsc --noEmit`: passed.
- `npm run build`: passed with Supabase URL/keys explicitly set to the loopback stack.
- `npm audit --audit-level=moderate`: passed; 0 vulnerabilities reported.
- `git diff --check`: passed.

---

## Historical earlier checkpoint (superseded)

### Previous environment

- **Application:** Next.js 16.4.1. Earlier limited loopback checks used a local server with dummy Supabase values at `http://127.0.0.1:3100`; it was stopped after those checks. During the follow-up one-shot assessment, starting a new local server was blocked because Next.js reported another dev server using the shared `.next` directory (PID 1960, port 3000). That existing server was not contacted or stopped because its configuration and owner were not verified.
- **Database:** No local Supabase/Postgres test stack or test database was available. `.env.local` points to a hosted Supabase project; its values were not printed, and no attack requests were sent to it.
- **Branch / commit:** `security/redteam-hardening` / `724ff37`.
- **Test project:** The supplied test project reference was compared locally to the reference inferred from `.env.local` without displaying either value or making a network request. No dedicated test credentials were present, so the test project was not contacted.
- **Base URL:** `http://127.0.0.1:3100` for earlier limited checks only. No base URL was used for the follow-up assessment.

### Previous executive result

**SECURE WITH GAPS.** Limited unauthenticated HTTP checks were performed against the running local app. Database-backed and authenticated attacks were not run, so this is not a complete runtime red-team assessment and does not establish that tapUp is secure.

### Previous runtime attack results

| Attack | Result | Database Effect |
|---|---|---|
| Unauthenticated access to `/shop/ledger` | Blocked: first-hop HTTP 307 to `/login` | Not queried |
| Unauthenticated access to `/me` | Blocked: first-hop HTTP 307 to `/login` | Not queried |
| Unauthenticated access to `/pay/demo` | Blocked: first-hop HTTP 307 to `/login` | Not queried |
| Security headers on protected-page redirects | Observed CSP, `X-Content-Type-Options`, `Referrer-Policy`, and `Permissions-Policy` | Not applicable |
| Lender API with no key | Blocked: HTTP 401 | No data request made |
| Lender API with wrong key | Blocked: HTTP 401 | No data request made |
| Cross-shop access / IDOR | NOT VERIFIED: no test identities or database | Not queried |
| RLS read/write boundaries | NOT VERIFIED: no local test database; hosted project not contacted | Not queried |
| Customer consent and phone-link bypass | NOT VERIFIED at runtime | Not queried |
| PIN lockout bypass | NOT VERIFIED at runtime | Not queried |
| QR replay or tampering | NOT VERIFIED at runtime | Not queried |
| Sale tampering / mass assignment | NOT VERIFIED at runtime | Not queried |
| Buying-power bypass / concurrent race | NOT VERIFIED at runtime | Not queried |
| Replay of sale, tab approval, repayment, or linking | NOT VERIFIED at runtime | Not queried |
| XSS / SQL injection | NOT VERIFIED against a running data-backed flow | Not queried |
| Lender data manipulation / data leakage | NOT VERIFIED beyond missing/wrong-key denial | Not queried |
| Authenticated role/session attacks | NOT VERIFIED: no test accounts | Not queried |

### Previous successful exploits

None confirmed in the limited local HTTP checks. This does not mean the untested attack classes are safe.

### Previous fixed exploits

The previously reported phone-linking issue was **not attacked at runtime**. The code fix and static regression test were reviewed separately, but the requested runtime verification requires a disposable test Supabase project with synthetic users and data.

### Previous remaining vulnerabilities

No additional exploit was confirmed by this limited runtime exercise. The authenticated and database-backed attack surface remains unverified.

### Previous runtime limitations

The repository had no local Supabase configuration, and Docker showed no Supabase containers. The only configured Supabase URL is hosted. Because its test/staging status could not be established, no authenticated traffic, mutations, RLS queries, or database forensics were sent to it.

Without a disposable test database and synthetic test accounts, the following remain unverified: IDOR, RLS, consent/phone linking, PIN, QR replay, sale tampering, buying-power enforcement, races, replay, mass assignment, stored/reflected XSS, SQL injection, lender data manipulation, and session/role boundaries.

For the follow-up one-shot assessment, no `.env.redteam.local` or other dedicated test configuration/credentials existed. A local server restart on port 3100 was attempted with explicit dummy variables but Next.js refused to start because another dev server already owned the shared `.next` dev state. The existing server was deliberately left untouched and unqueried rather than risk using unknown Supabase configuration. No attacks requiring an authenticated app session or database were attempted.

### Previous database verification

**Not performed.** There was no local test database, and the hosted Supabase project was not contacted. No database state was created or changed by this assessment.

### Previous follow-up assessment

- The user-approved work branch `security/redteam-hardening` was created; no commit was made.
- The untracked preparation documents `docs/redteam/TEST_ENVIRONMENT.md` and `docs/redteam/ATTACK_PLAN.md` were preserved.
- No hosted project was contacted. No database migration, fixture creation, attack mutation, or cleanup ran.
- Previously observed unauthenticated redirects and lender 401 responses are limited app-boundary observations from the earlier dummy-config loopback run, not authenticated or database-backed evidence.
- No vulnerability was confirmed, fixed, or re-exploited in this follow-up run.

### Previous final verdict

The local app denied unauthenticated access to the tested protected routes and rejected lender requests without a correct API key. Those checks provide limited runtime evidence only. **RLS runtime behavior, authenticated authorization, state-changing operations, and the phone-link fix remain NOT VERIFIED.**

### Previous explicit assessment answers

- **Was the running application attacked?** YES, in earlier limited loopback checks using dummy Supabase configuration; the follow-up one-shot run could not start an isolated server and did not query the already-running unknown server.
- **Was a real database attacked?** NO.
- **Were RLS policies executed as real authenticated users?** NO.
- **Was the phone-link fix exercised against the real RPC/database?** NO.
- **Was cross-shop access attempted and verified?** NO.
- **Were QR replay and sale tampering attempted against the running app?** NO; existing unit tests cover pure token/schema behavior only.
- **Was buying-power enforcement tested concurrently?** NO.
- **Were unauthorized database changes observed?** NOT VERIFIED; no database attack or forensic query ran.
- **Were vulnerabilities fixed and successfully re-exploited?** NO in this assessment.
- **What remains NOT VERIFIED?** Authenticated authorization, RLS, IDOR, phone linking at runtime, PIN lockout in persisted state, QR and mutation replay, sale/tender tampering, tab limits/races, repayment concurrency, XSS/SQL injection against data-backed flows, lender data isolation, and database non-mutation.

### Previous validation

- `npm test`: passed, 9 test files / 56 tests.
- `npm run lint`: passed with one existing warning in `lib/lenderData.ts:124` (`now` is defined but never used).
- `npx tsc --noEmit`: passed.
- `npm run build`: passed.
- `npm audit --audit-level=moderate`: passed, zero vulnerabilities reported.
- `git diff --check`: passed.
- Follow-up server start: **not started**; blocked by an existing Next.js dev server using shared `.next` state. Existing server was not queried or stopped.
