# Handoff notes

## For Database

- `supabase/schema.sql` records split tender with `tab_cents`, `paid_now_cents`,
  `paid_now_method`, and `paid_now_confirmed_at`; approved/paid portions must sum to
  `total_cents`, and repayments apply only to `tab_cents`.
- Customer profiles use email/password, not verified phone OTP. A phone match alone is not
  identity proof; only allow an authenticated customer to link their own profile, record
  consent, and require owner confirmation before tab approval.
- A smartphone tab request moves from `pending` to `tab_requested`, then owner approval moves
  it to `approved`. A cash choice remains pending until owner confirmation. The schema
  constrains transitions, expiry, tender totals, available limit, consent, and single use;
  frontend actions must still authorize the caller and use conditional writes.
- Keep `pin_hash`, QR token hashes, and lockout fields inaccessible through client reads;
  every application table needs RLS. See `docs/ARCHITECTURE.md`.

## For Scoring

- Follow `docs/DESIGN_SPEC.md`: R50 increments, R300 cap, and a new customer starts at R0
  until their first completed purchase. Treat limits and history per shop.
- Keep an approved tab’s outstanding balance separate from the amount paid at checkout.
  Count one mixed-tender purchase once; cash purchases carry the agreed lower score weight.

## For Frontend

- Show pending tab/cash requests to the owner and require explicit approval/receipt confirmation.
  No tab is automatic; a customer-side “verified PIN” boolean is never trusted.
- Support smartphone customers opening a QR only when signed in and linked to that shop.
  Phone-only customers enter PIN on the owner’s device.
- The first working slice is project setup/auth, then a complete shop-QR sale and Pay path.
- Add request-level session refresh in the Next.js 16 `proxy.ts`: Server Components cannot write
  refreshed auth cookies, so the Supabase server client intentionally skips cookie writes there.

## For Security

- Verify the phone-only PIN in the same server-side operation that approves the tab, or bind
  verification to a secure one-use server proof; never trust a client-supplied success flag.
- Enforce split tender, shop ownership, available-limit and single-use QR checks atomically.
  See `docs/ARCHITECTURE.md` for route permissions and demo API boundaries.

## For Release

- Required environment variable names are listed in `docs/ARCHITECTURE.md` and
  `.env.example`; keep secrets server-only and keep `.env.local` ignored.
- Check `/api/health` and both judge logins before presenting. If live services fail, use a
  clearly labelled recording/screenshots rather than presenting a fabricated live success.


## PR #2 final verification — 2026-10-25

Verified head: `3b35445dea401a010dbcedc6cdf91dad0d9481a4` on
`review/coderabbit-final-fixes`, base `main` at
`6f99cffe0eb74c8669c6ed31152edfdfa3240a0a`. The PR had not advanced. Initial tree
was clean; no application code, PIN compatibility SQL, or `.idea/` files changed
in this verification. No merge, deployment, or production migration performed.

### Findings to address before merge

- **Cash expiry after a database lock wait:** `lib/actions/sales.ts:807` and `:848`
  use an application timestamp captured before SQL execution. In a fresh isolated
  PostgreSQL 17 database, both a split cash request and a full cash request with
  `used_at` already set were row-locked for two seconds across their expiry. The
  same conditional writes still confirmed receipt after expiry. The existing
  trigger's expiry guard excludes already-used QR rows. Approval correctly
  rejected expiry after the lock wait. A repair needs a database-clock check after
  acquiring the sale lock, while retaining ownership, consent, tender/state and
  duplicate protections; add full/split lock-wait regressions. The supplied floor
  migration does not fix cash expiry. Do not claim the current predicate provides
  strict expiry at mutation time.
- **Intermittent UI regression failure:** fresh full `npm test` exited 1 with
  151 passed, 1 failed, 12 skipped. The failing case is
  `tests/ownerPaymentsUi.test.tsx:133`, “rejects an older request, refreshes that
  page, and prevents duplicate submissions”: zero rejection calls at line 142.
  It waits for the older customer's text but not for the action button to become
  enabled after the page-loading transition. The focused case passed unchanged
  in isolation (1 passed, 17 filtered out). This does not erase the full-suite
  failure or establish that all UI behavior is correct. Stabilize the readiness
  assertion without removing the duplicate-submission assertion, then rerun.
- Latest completed CodeRabbit review `5640949938` at this head posted one Minor
  finding: pin `actions/checkout@v5` and `actions/setup-node@v5` to reviewed immutable
  commit SHAs. That thread remains unresolved. The original PIN-feedback thread
  is also unresolved but outdated; the latest walkthrough acknowledges that the
  PIN-feedback problem is fixed. Four follow-up threads and the pagination thread
  are resolved. A newer CodeRabbit status was still pending at the last read;
  do not call the review status green without rechecking.

### Executed checks and scope

All commands ran from the repository root with Node 24.21.0/npm 11.19.0 and the
unchanged lockfile. Dependencies were already installed (`npm ls --depth=0`
passed); `npm ci` was not rerun.

- `DOCKER_HOST=unix:///home/vercel-sandbox/runtime/tapup-test-docker/docker.sock TAPUP_TEST_POSTGRES_CONTAINER=tapup-finding-tests npm test`
  — **failed**, exit 1: 151 passed, 1 failed, 12 skipped, as above.
- `npm run lint` — **passed**, exit 0, no diagnostics.
- `npx next typegen && npx tsc --noEmit` — **passed**, exit 0.
- `NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321 NEXT_PUBLIC_SUPABASE_ANON_KEY=ci-placeholder npm run build`
  — **passed**, exit 0. Synthetic configuration verifies building, not runtime
  Supabase connectivity.
- `npx vitest run tests/ownerPaymentsUi.test.tsx -t 'rejects an older request'`
  — **passed**, exit 0; 1 passed, 17 filtered out.
- Additional focused probes in a new synthetic PostgreSQL database verified actual
  bcrypt comparison feeding the restricted approval RPC, five failures and a
  persisted approximately 15-minute lock, denial of the correct PIN during the
  lock, recovery after simulating expiry on that synthetic customer, and rollback
  of PIN reset/cache/sale transitions after an injected SQL failure. They also
  verified approval expiry after a row-lock wait and reproduced both cash races
  above. Auth was stubbed: these are not authenticated Next.js/Supabase UI tests.
- GitHub Actions run `40149892297` on the same head **passed**, including
  152 passed/12 skipped, lint, route type generation/TypeScript and build. Unlike
  that CI run, this fresh local full suite hit the UI timing failure. The workflow
  now runs on PR updates, pushes to main, or manual dispatch; originally no
  workflows existed. Required-check administrative settings remain unverified.
- CodeRabbit's docstring check reports 18.52% against its default 80% threshold,
  in warning mode. It is not a Vitest/ESLint/TypeScript gate; actual Actions
  succeeded despite it. No filler comments or threshold changes were added.

### Missing full Supabase environment and manual verification

The 12 opt-in tests in `tests/redteam/localSupabase.test.ts` remain unexecuted in
this turn. There is no Supabase CLI/stack here, the loopback API health request
failed to connect, and all five harness variables are unset. CodeRabbit emulate
v0.0.1's catalog was inspected and contains no Supabase/GoTrue/PostgREST service.
Do not substitute its other authentication emulators for Supabase enforcement.

To unblock, restart/provide a confirmed disposable local Supabase stack with
project ID `tapup-redteam-local-20261024` and API `http://127.0.0.1:54321` on the
same host where tests run. The rollback test additionally needs Docker access to
`supabase_db_tapup-redteam-local-20261024`, `psql -U postgres -d postgres`, and
permission to create/remove a test trigger. Ensure the current schema and RLS
are installed; the floor migration alone cannot bootstrap an empty project.
Never run the fixed-demo-ID seed or reset an existing database.

Configure these names privately on that test host (do not paste secrets into
chat):

- `TAPUP_REDTEAM_LOCAL=1`
- `TAPUP_REDTEAM_PROJECT_ID=tapup-redteam-local-20261024`
- `TAPUP_REDTEAM_SUPABASE_URL=http://127.0.0.1:54321`
- `TAPUP_REDTEAM_ANON_KEY` — that local project's anon key
- `TAPUP_REDTEAM_SERVICE_ROLE_KEY` — that local project's service-role key

Then run `npx vitest run tests/redteam/localSupabase.test.ts`. Its fixtures create
synthetic Auth users and perform privileged mutations/cleanup; never point it at
production. The harness calls the approval RPC using its own bcrypt preflight,
not the authenticated Next.js server action. Separately verify the owner UI with
synthetic users: incorrect PIN guidance, five-attempt lock, refresh not bypassing
the lock, recovery after 15 minutes with a fresh unexpired sale, full/split cash
expiry and duplicate submission. Live PostgREST pagination (>100 rows) is also
still unverified; current query/UI tests mock API responses.

### Migration and recommendation

`supabase/migrations/202610250001_align_buying_power_floor.sql` is included in the
PR. Its RPC definition/grants match `supabase/schema.sql`; the executed SQL suite
applied both in a fresh test database and checked equivalence. It replaces only
`approve_tab_atomic`, retaining its signature, service-role execution boundary,
PIN/consent/state guards and transaction semantics, and aligns the R50 floor
before late/overdue overrides. It does not reset data or backfill cached limits.

For an existing deployment, review the installed schema/function and backup
first; rehearse the file against a disposable staging copy using a single
transaction and stop-on-error, then rerun the integration checks. Production
application requires the user's explicit approval and an approved target. For a
new database the current `schema.sql` already includes the floor; do not replay
that full CREATE script on an existing database. A future repair of cash expiry
may require an additional migration; none was added in this verification.

**Recommendation: hold merge.** Address strict cash expiry, stabilize the failing
regression, complete live Supabase/action/UI verification, and resolve/review the
remaining CodeRabbit threads/status. Keep these gaps distinct from the checks
that actually passed.

## Hackathon CI/CD implementation — 2026-10-25

This section updates the earlier verification snapshot; retain its cash-expiry
reproduction and local Supabase setup details. Work stays on PR #2's
`review/coderabbit-final-fixes` branch, default/base `main`. PR #2 remains open.

- `.github/workflows/ci.yml` now has unprivileged `verify` and `security` jobs,
  pinned checkout/setup-node SHAs, npm caching and concurrency cancellation.
  Existing PostgreSQL 17 tests are retained; no new deployment infrastructure.
- Security: blocking npm audit (moderate+), checksum-verified Gitleaks 8.30.1,
  Semgrep 1.182.1 with four local rules and positive/negative controls; advisory
  production license inventory (68 entries, 15 requiring review). These checks
  do not constitute a full audit or legal clearance.
- `tests/ownerPaymentsUi.test.tsx` now waits for enabled controls after pagination
  in both rejection and cash cases. No payment assertions or implementation were
  weakened. Local suite passed; CI initially exposed the cash timing failure,
  then run `40152460013` on `93dd92f` passed both jobs after the second fix.
- `app/api/health/route.ts` uses a request-time, read-only three-second HEAD probe
  with the existing server-only admin client. Only `{ "ok": true }`/200 or
  `{ "ok": false }`/503 is returned, with no-store. Six regression tests cover
  success, backend/config/network/timeout failures and Next.js prerender control.
- `vercel.json` disables automatic Git deployments. Keep this gate until account,
  environment and release approval requirements in `docs/DEPLOYMENT.md` are met.
  Vercel documents that a new project's first deployment is production even when
  `--prod` is omitted. No initial deployment is authorized by this task.
- `docs/DEPLOYMENT.md` contains all seven layers, exact variables, setup order,
  seed deletion warnings, actual OTP/consent linking, health/smoke steps and rollback.
  No runtime dependencies, RLS, Auth, payment source or SQL changed in this task.

### Current local verification

Repository root, Node 24.21.0/npm 11.19.0, unchanged lockfile:

- `npm ci --no-audit --no-fund`: passed; existing unrs-resolver install-script warning.
- `DOCKER_HOST=unix:///home/vercel-sandbox/runtime/tapup-test-docker/docker.sock TAPUP_TEST_POSTGRES_CONTAINER=tapup-finding-tests npm test`: **158 passed, 12 skipped**.
- `npm run lint`: passed.
- `npx next typegen && npx tsc --noEmit`: passed.
- `NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321 NEXT_PUBLIC_SUPABASE_ANON_KEY=ci-placeholder npm run build`: passed; health route dynamic.
- `npm audit --audit-level=moderate`: passed, zero vulnerabilities at execution.
- `gitleaks git --redact=100 --no-banner --log-opts="--all" .`: passed on the
  scanned history; final commit is also checked by CI.
- `bash scripts/check-security-rules.sh`: passed all four positive controls and
  server-only negative control after correcting the initial rule configuration.
- `semgrep scan --config .semgrep/security.yml --error --metrics=off --disable-version-check app components lib proxy.ts next.config.ts`:
  passed on final application sources, 54 files/four rules/zero findings.
- `node scripts/license-inventory.mjs`: report produced; advisories not cleared.
- Temporary one-off built-server HTTP check: missing service key yielded actual
  HTTP 503, no-store and exactly `{"ok":false}`; server stopped. This is not a
  live Supabase success check. Unit success uses mocks, as documented by the tests.

### Remaining gates

- Production release remains blocked by the reproduced full/split cash-expiry
  lock-wait race. This pipeline intentionally leaves that payment repair to a
  scoped follow-up with database-level regression tests.
- Latest published CodeRabbit review inspected during implementation was on
  `3b35445`. Its action-SHA finding is resolved by this task. Two threads were
  still unresolved: the outdated original PIN thread and the current
  [refreshKey/action-completion finding](https://github.com/yottabyte-java/tapUP/pull/2#discussion_r4369266529).
  A same-shop refresh can discard a successful pending action's UI callback;
  investigate/fix separately without weakening stale-shop result protection.
- Twelve full Supabase tests, live Auth/OTP/RLS/owner payment checks and deployed
  health 200 remain unexecuted: provide the disposable local stack/keys described
  above and an authorized preview target. Production keys cannot substitute.
- GitHub protection/security settings need owner action; inspection returned403.
  Require both `verify` and `security`. No settings were changed.
- No Vercel/Supabase account credentials or approved hosted target were available.
  Deployment status **not started**. No merge, deployment or hosted SQL operation.
- No new migration for the pipeline. The existing floor migration is still in PR
  #2; current schema already includes it, while existing installs need review,
  staging rehearsal and separate production approval. Seed deletes demo-shop data.
- Before merging, read the final PR checks on its current commit. Earlier green
  runs alone do not prove the final patch; the final task response records that run.

## Master hardening — current verification, 2026-10-25

This section supersedes the prior cash/UI blockers and skipped-integration status.
Starting head `2228ad8a1abeadd5cb32a34ebb52993b675066c3`; PR #2 remains on
`review/coderabbit-final-fixes` → `main`. No merge/hosted SQL/deployment/settings change.

### Repairs

- Cash: the existing BEFORE UPDATE trigger now checks `clock_timestamp()` after
  sale/customer locks, including already-used QR requests, and stamps the receipt
  with that database time. A raised expiry error rolls back the complete write.
  Existing state/consent/tender/ownership/CAS guards remain. `payCash` maps only the
  known trigger expiry error to `sale_expired`; no SQL details reach the user.
- `202610250002_guard_cash_confirmation_expiry.sql` supplies the same replacement
  trigger function for existing installations. Migration001 changes only buying
  power; both are already in fresh `schema.sql`, are repeatable and need separate
  approved hosted deployment. Tests compare installed definitions and rehearse rollback.
- UI: request-generation guards still discard stale reads; an independent mounted
  guard preserves same-shop action outcomes across refreshes. The shop-keyed
  component still discards old-shop results. Submission ref and server protections
  remain. Tests cover success, expiry/network failures, retries, duplicate clicks,
  callback exactly once, and stale-shop behavior.
- Gitleaks now scans merge diffs against the first parent as well as all refs;
  a temporary merge-only synthetic secret verifies detection. No real secret used.
- CI adds **integration** beside **verify** and **security**, using real local
  Supabase Auth/PostgREST and generated private local keys. Require all three checks.
  `verify` explicitly labels its integration skips; the integration job runs them.
  No production credential or automatic deployment/migration job exists.
- All 15 license advisories reviewed in `docs/LICENSE_REVIEW.md`: transitive Sharp/
  libvips platform binaries and Caniuse data. Preserve notices; distribution-specific
  obligations still need review. No dependency upgrades or invented legal clearance.

### Executed evidence

Node24.21.0/npm11.19.0; unchanged lockfile. Commands from repository root:

- `npm ci --no-audit --no-fund`: exit0 (existing unrs-resolver script warning).
- `npm run lint`; `npx next typegen && npx tsc --noEmit`: exit0.
- Full `npm test` with both guarded local Supabase and isolated PostgreSQL configured:
  **191 passed, 0 failed, 0 skipped**: 114 unit/action/query/render tests,
  21 interactive UI tests, 40 PostgreSQL tests, 16 real Supabase integration tests.
- `bash scripts/check-local-supabase.sh`: exit0,16/16. The original12 first passed;
  four PostgREST cash cases were then added, and PIN recovery assertions extended.
- `tests/cashExpiryPostgres.test.ts`:11 real DB tests, including repeated full/split
  sale-lock waits, split customer-lock wait, unchanged snapshots on rejection,
  authoritative receipt time, duplicate/concurrent confirmations and migration parity.
- `NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321 NEXT_PUBLIC_SUPABASE_ANON_KEY=ci-placeholder npm run build`:
  exit0. Also rebuilt with actual private local CLI-generated runtime configuration.
- Built app: safe missing-key503/no-store verified; with real local Supabase, actual
  health200/no-store verified.25 HTTP checks exercised real owner/customer sessions,
  server-action authorization, customer cash/tab requests, full/split receipts,
  approval/rejection and replay. Synthetic fixture setup bypassed email/phone proof;
  this is NOT a browser/OTP/deployed HTTPS pass. Fixtures were cleaned up individually.
- `npm audit --audit-level=moderate`: exit0,0 vulnerabilities.
- `gitleaks git --redact=100 --no-banner --log-opts="--all --diff-merges=first-parent" .`:
  exit0,no leaks in scanned history; staged/final CI checks cover subsequent commits.
- `bash scripts/check-secret-scanner.sh`: exit0,merge-only synthetic finding detected.
- `bash scripts/check-security-rules.sh`: exit0,4positive controls plus negative control.
- `semgrep scan --config .semgrep/security.yml --error --metrics=off --disable-version-check app components lib proxy.ts next.config.ts`:
  exit0,4rules/54files/0application findings.
- `node scripts/license-inventory.mjs`: exit0,68entries/15reviewed advisories.

Failures retained: first UI run45passed/2failed because a new assertion selected the
PIN accessibility status; fixed the test selector, then47/47 passed. First Supabase
startup failed due missing Docker host-gateway mapping; task-local daemon repaired.
First HTTP smoke fixture assumed too small a limit; diagnostic confirmed legitimate
full affordability. A sale above the R300 cap corrected the fixture and all25 passed.
No application assertion or security rule was weakened to get green results.

### Local environment and remaining gates

SupabaseCLI2.122.0 is installed outside the repo, official archive checksum verified.
The copied project config excludes automatic app migrations and seed. A confirmed
blank local database received schema/RLS/both migrations in one transaction. Its
Auth/PostgREST stack is real, not an emulator; keys are private runtime files.
The task-local bridge-none Docker daemon needed explicit host-gateway IP. Reuse
`docs/DEPLOYMENT.md` commands; never use production credentials in the test runner.

Current deployment status: **local verification complete**. Hosted preview/project
access, real email/OTP confirmation, full browser workflow and HTTPS remain manual
release gates. The original cash race and UI callback defect are fixed locally.
A multi-instance production deployment still needs assessment of the documented
in-memory rate limiter; persisted PIN lockout remains enforced in the database.

CodeRabbit published a Minor Gitleaks merge-diff finding after the prior report;
it is addressed here with a positive control. Recheck the final PR head's review
and all three Actions jobs before merge; the task response records their results.
No hosted migration was applied. Preserve `.idea/` and PIN compatibility SQL.

### End-to-end evidence checklist

| Item | Status / scope |
|---|---|
| HTTPS deployment | BLOCKED: no authorized hosted preview |
| Owner authentication | PASSED: real local Auth session and built HTTP owner page |
| Customer authentication | PASSED: real local Auth session and built HTTP customer page |
| Auth-to-record links | PASSED: local synthetic profiles/shops and guarded consent-link RPC |
| Redirects, email/OTP proof | PARTIAL: unauthorized redirect tested; real email/OTP not run |
| Owner request controls | PASSED: UI regressions plus actual authenticated payment HTTP actions |
| Customer authorization | PASSED: local RLS and actual server-action role checks |
| Full/split expired cash | PASSED: PostgreSQL and real PostgREST |
| Lock-wait expiry | PASSED: repeated sale waits and split customer wait |
| PIN lockout/recovery | PASSED: local persisted RPC state; recovery uses synthetic clock advance |
| Buying-power parity | PASSED: real SQL/TypeScript cases |
| Ledger/daily receipts | PASSED: deterministic receipt-date tests and database rollback snapshots |
| Duplicate settlement | PASSED: concurrent DB/PostgREST and HTTP replay checks |
| RLS/server authorization | PASSED: authenticated local negative/positive controls |
| Health | PASSED: built HTTP200 with local DB and generic503 without config |
| Final GitHub checks | Read final commit's verify/security/integration; final response records result |
| Deployment commit | NOT RUN: no deployment exists |
| Secret-free logs | Checked redacted scanner outputs; keep local status/credential files private |
