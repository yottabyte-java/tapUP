# tapUP hackathon deployment

## 1. Git and release controls (Layer 1)

1. The verified default branch is `main`. Continue PR #2 from
   `review/coderabbit-final-fixes` into `main`; it was OPEN at
   `3b35445dea401a010dbcedc6cdf91dad0d9481a4` when this task began.
2. CI runs on `pull_request`, pushes to `main`, and `workflow_dispatch`. It uses
   `contents: read`, no production secrets, and checkout without persisted credentials.
   There are no `pull_request_target` jobs or automatic deployment/migration steps.
   Fork PRs can run these unprivileged checks; never approve a secret-bearing preview
   build of unreviewed fork code.
3. In GitHub Settings → Rules → Rulesets (or Branches → Branch protection), target
   `main`, require pull requests and successful `verify`, `security` and `integration` checks, require an
   up-to-date branch, and disallow force pushes/deletion. Check all three on the final PR commit; the integration job is new. Review the plan's available protection features
   for this private repository. These settings were not changed; the protection
   API returned HTTP 403, so enforcement is unverified.
4. Review the final diff, CI and CodeRabbit findings before approving a merge.
   **PR #2 must be merged before a normal main-branch release includes its fixes.**
   An explicitly approved preview of the PR branch can include them before merging.
5. Record the approved commit, deployment URL and database migration version. If a
   release fails, select a known-good Vercel deployment after checking database
   compatibility, or revert the offending commit through a new PR and rerun CI.
   Never force-push, reset shared history, or reverse SQL blindly. Rollback requires
   explicit approval.

### Release gates

The cash-expiry race is repaired by the post-lock database-clock guard in migration
`202610250002_guard_cash_confirmation_expiry.sql`; fresh schema contains it too.
Real PostgreSQL tests cover full/split sale-lock waits, split customer-lock waits, full-cash customer-assignment FK waits,
rollback and duplicate writes. The same-shop refresh/action-outcome defect is also
repaired, with UI regressions retaining stale-shop protection. These repairs still
need their migrations installed in an approved hosted target before release.

Local Auth/PostgREST/RLS and built-app HTTP verification now run successfully.
Hosted HTTPS, actual email/phone verification, browser end-to-end flows and final
review remain release gates; local tests do not establish deployed readiness.

## 2. Continuous integration (Layer 2)

1. Use Node 24 and npm with the committed `package-lock.json`. Run:

   ```sh
   npm ci --no-audit --no-fund
   npm run lint
   npx next typegen && npx tsc --noEmit
   TAPUP_TEST_POSTGRES_CONTAINER=<existing-disposable-postgres-container> npm test
   NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321 NEXT_PUBLIC_SUPABASE_ANON_KEY=ci-placeholder npm run build
   ```

   The container name is a placeholder, not a command to copy literally. Reuse the
   existing PostgreSQL 17 test fixture; this app does not publish a container image.
   With a non-default Docker Unix socket, also set `DOCKER_HOST` for the test process.
2. The existing `CI / verify` job caches npm downloads keyed by the lockfile. Checkout
   and setup-node are pinned to the commit SHAs returned by their official repositories'
   `v5` refs during this task. Review release changes before updating these pins.
3. Next.js route types must be generated before standalone TypeScript. Build placeholders
   provide configuration only; they do not prove database connectivity. CI never loads
   production Supabase keys or applies production SQL.
4. The PostgreSQL suite creates a new unique database with real schema/RLS/migration and
   synthetic Auth stubs. A separate `integration` job starts real local Supabase
   Auth/PostgREST and runs all 16 integration tests with generated local keys. The
   `verify` job's skips are explicitly labelled and are covered by `integration`;
   require both. Neither job proves a deployed browser/OTP flow.
5. Open PR #2 → Checks → `verify` to inspect the current commit's actual run, or use
   `gh pr checks 2 --repo yottabyte-java/tapUP`. A passing earlier commit is insufficient
   if relevant code has changed. See `docs/VERIFICATION.md` for the original CI history.

Reference: Romano Roth's verified
[GitHub: Build a DevSecOps Pipeline playlist](https://www.youtube.com/playlist?list=PLrsbMazVPK_pt9u_PiTGAb3s9aw8ashvQ).
Its workflow/security stages inform this small pipeline; no course or extra platform
infrastructure is required.

## 3. Security and software supply chain (Layer 3)

1. Require `verify`, `security` and `integration` in the main branch protection rule once
   each has run successfully on the intended revision. No setting is changed by this repository patch.
2. The `security` job runs on the same unprivileged events as CI:

   | Check | Policy | Scope/limits |
   |---|---|---|
   | `npm audit --audit-level=moderate` | Blocking for moderate/high/critical vulnerabilities or audit errors | Includes development dependencies; registry advisories change over time |
   | Gitleaks 8.30.1 | Blocking, redacted output | Full fetched Git history including merge diffs against the first parent; a synthetic merge-only control proves coverage; official archive checked against a committed SHA-256 digest |
   | Semgrep OSS 1.182.1 | Blocking on rule findings or scan errors | Local `.semgrep/security.yml`: dynamic code, raw React HTML, public privileged-key names and direct admin-client imports into client modules; a small static gate, not a complete security audit |
   | Rule positive controls | Blocking | `bash scripts/check-security-rules.sh` verifies all four rules catch synthetic unsafe examples |
   | License inventory | Advisory | `node scripts/license-inventory.mjs` reports lockfile production license declarations to the Actions summary; it does not validate bundled notices or provide legal clearance |

3. All 15 advisories have been individually reviewed in `docs/LICENSE_REVIEW.md`:
   transitive platform-specific Sharp/libvips packages and Caniuse-lite data, with
   no unknown metadata. Keep notices and review binary/source and attribution
   obligations before distributing artifacts; this is not legal clearance.
4. Review GitHub Settings → Security → Code security and analysis for secret scanning,
   push protection and dependency alerts available to this private repo's plan.
   These were not enabled or verified. Do not buy GitHub Code Security/Secret Protection
   for this task; standalone OSS checks run without those paid features.
5. No container image is built/published, so no container scanner is added. There is
   no authorized deployed preview yet, so dynamic scanning has not run. Authorize a
   specific synthetic-data preview URL before any active dynamic scanner is used.
6. Tool installs are CI utilities, not application dependencies. Semgrep uses reviewed
   local rules with metrics/version checks disabled; no SEMGREP token is required.
   Its pinned CLI still resolves Python dependencies at installation time; review
   upgrades and install failures. Ubuntu 24.04 is explicit to avoid runner-image drift.

## 4. Supabase database and authentication (Layer 4)

### Fresh hackathon demo setup

Use this sequence only for a **new, disposable hackathon project**. The seed deletes
and rebuilds its fixed demo shop, so never run it against a project containing data
you need. It creates demo history; it does not create or phone-link the customer judge.

1. Use Supabase **Free** for the hackathon database. Create a new Supabase project
   in the dashboard, choose the region, set a strong database password, and keep the
   password and project credentials private. Confirm the project is the intended
   disposable demo target before opening SQL Editor.
2. In SQL Editor, run the complete contents of `supabase/schema.sql` followed by
   `supabase/rls.sql` in one transaction (`BEGIN;` before the schema contents and
   `COMMIT;` after the RLS contents) on this fresh project. Keep RLS enabled and
   stop if either script reports an error. These scripts establish the tables, constraints,
   approval functions, policies and grants; do not use them to recreate an existing
   database. The fresh schema and RLS files include the current consent objects.
3. In Authentication → Users, create a **confirmed** owner Auth user with the exact
   email `judge-owner@example.test` and a private demo password. This address is a
   seed identifier, not a deliverable inbox. Do not use it for email confirmation.
4. Now run the complete contents of `supabase/seed.sql` once. It finds that Auth
   user, creates its owner profile and the fixed demo shop, then deletes and rebuilds
   rows belonging to that fixed shop. Do not rerun it after recording demo activity
   unless you intentionally want that shop's sales, repayments and customers erased.
5. Use Vercel **Hobby** for a personal, non-commercial hackathon demo. Confirm the
   account's current plan terms apply. Import the intended GitHub repository and set
   the documented Next.js build settings in Layer 5. Add the target Supabase values
   from the dashboard to the Vercel project's intended environment:
   `NEXT_PUBLIC_SUPABASE_URL` (project API URL, public),
   `NEXT_PUBLIC_SUPABASE_ANON_KEY` (RLS-scoped browser key, public),
   `SUPABASE_SERVICE_ROLE_KEY` (privileged server-side database/Auth operations,
   **server-only**, never prefixed `NEXT_PUBLIC_` or used in browser code), and
   `LENDER_API_KEY` (private key for the lender demo endpoint, server-only). Do not
   put a database password or service-role key in the public variables. A new
   Vercel project's first deployment is Production; verify the repository, branch,
   target and environment, then deploy only when you intend to publish that build.
   For an existing approved project, use the Preview procedure in Layer 5. This
   guide does not perform a deployment.
6. Copy the actual HTTPS origin shown by Vercel. In Supabase Authentication → URL
   Configuration, set **Site URL** to that exact origin (for example,
   `https://<your-project>.vercel.app`). If configuring Redirect URLs, allow only
   that project origin and required paths; do not wildcard all Vercel domains.
   This app does not pass a custom `emailRedirectTo` or implement an auth callback;
   confirmation returns to the configured Site URL, after which the user signs in
   through `/login`.
7. Create the customer judge at `/signup` with role **customer**, a controlled email,
   and a private password; complete email confirmation if enabled, then sign in at
   `/login`. The seeded customer phone numbers are fictional, so they cannot be
   used for this account's phone verification or linking.
8. As the owner, add a separate demo customer at `/shop/customers/new`, using the
   customer's real, controlled South African phone number and record consent. Confirm
   the customer's identity using the existing owner control. Do not edit seeded rows
   or link an account by copying a UUID.
9. Create a fresh sale for that customer. On the customer judge's signed-in phone,
   open the actual `/pay/[token]` link, request and complete Supabase phone-change
   OTP verification for the same controlled number, and grant consent. The app links
   the verified Auth identity to the matching shop record. This requires a working
   Supabase phone verification provider/configuration and access to the phone; do not
   bypass OTP or pretend an SMS was verified. The shop owner still approves every tab.
10. Request `/api/health` on the actual HTTPS origin shown by Vercel. In PowerShell,
    replace the example with that exact origin:

    ```powershell
    Invoke-RestMethod -Uri "https://<your-project>.vercel.app/api/health"
    ```

    Expect HTTP 200 with `{"ok":true}` when the deployed server can
    query the configured Supabase project. HTTP 503 with `{"ok":false}` means the
    health check could not reach/use the database; inspect Vercel runtime logs and
    environment configuration without exposing keys. Health checks database
    connectivity only; it does not prove login, OTP, RLS or sale flows. See Layer 7.

**What you must have before carrying out these steps:** access to the intended
Supabase and Vercel accounts, a private owner demo password, the customer's
controlled email/password, access to a phone that can receive OTPs, and a working
Supabase phone-verification configuration. The customer OTP step cannot be completed
with the seed's example phone numbers. Keep judge passwords out of this document and
share them only through the agreed private channel.

**External gate:** no authorized hosted Supabase target or account credentials are
configured. A disposable local stack has been started and tested; the following
hosted setup steps still require explicit user action.
Use a disposable preview/test project first. Do not run production SQL without
explicit approval. Start with [Supabase Free](https://supabase.com/pricing), subject
to its current quotas and terms; do not enable paid services automatically.

1. In the Supabase dashboard create/select the approved project, record its project
   reference and purpose privately, choose the intended region, and store its database
   password securely. Confirm this is the test project before each SQL operation.
2. For a **fresh database only**, review `supabase/schema.sql` and `supabase/rls.sql`.
   Apply both in one SQL transaction (`BEGIN;`, schema contents, RLS contents,
   `COMMIT;`) so tables are not exposed between creation and RLS/grant setup. Stop on
   an error. Supabase supplies Auth and its roles; do not install the CI Auth stubs
   into a hosted project. Do not rerun these CREATE scripts on an existing database.
   If you prefer separate SQL Editor runs, first turn **Enable Data API** off in
   its integration overview, review/run schema and then RLS separately, verify
   policies/grants, and re-enable the Data API before app tests. This prevents an
   exposure window; never disable RLS. See [hardening the Data API](https://supabase.com/docs/guides/database/hardening-data-api).
   Review/run the optional destructive seed as a separate explicit action only.
3. On an **existing database**, inspect installed objects and take a backup first.
   `supabase/migrations/202610250001_align_buying_power_floor.sql` replaces only
   `approve_tab_atomic`; it is not a database bootstrap. The current schema already
   contains the same function. Rehearse the migration on a disposable staging copy,
   using a single transaction and stop-on-error; production execution requires
   approval. It changes the R50 scoring floor, preserves service-role-only execution,
   and does not backfill cached limits or fix cash expiry. Migration
   `202610250002_guard_cash_confirmation_expiry.sql` separately replaces the existing
   sale-transition trigger function, checking cash expiry after its row locks and
   stamping receipt time from the database clock. Both definitions are already in
   the fresh schema. Migration `202610250003_add_lender_sharing_consent.sql` adds
   the customer-specific lender-consent column, RPC, and column grant needed by the
   Buying Power screen and lender API. Apply it through the tracked migration workflow
   after confirming the intended project; do not run the SQL directly in a remote editor.
   See the rehearsal procedure below.
4. Verify the five application tables have RLS enabled and privileged approval is
   unavailable to browser roles. These read-only checks expose no customer data:

   ```sql
   SELECT tablename, rowsecurity FROM pg_tables
   WHERE schemaname = 'public'
     AND tablename IN ('profiles','shops','shop_customers','sales','repayments');
   SELECT
     has_function_privilege('anon', 'public.approve_tab_atomic(uuid,uuid,uuid,uuid,text,boolean,boolean)', 'EXECUTE') AS anon_can_approve,
     has_function_privilege('authenticated', 'public.approve_tab_atomic(uuid,uuid,uuid,uuid,text,boolean,boolean)', 'EXECUTE') AS browser_can_approve,
     has_function_privilege('service_role', 'public.approve_tab_atomic(uuid,uuid,uuid,uuid,text,boolean,boolean)', 'EXECUTE') AS server_can_approve;
   ```

   Expect five `true` RLS flags and approval permissions `false, false, true`.
   This is configuration inspection; also test actual owner/customer sessions.
5. Choose one judge setup path before creating accounts:
   - **Recommended application path:** supply two controlled test email addresses;
     register once as owner and once as customer through `/signup`, then complete
     email confirmation if enabled and sign in at `/login`. Signup creates
     `profiles.id = auth.users.id` and, for the owner, one shop with that owner ID.
     No UUID copying or fabricated links are needed. Label the accounts/shop as demo
     and use synthetic business data. Share passwords privately with judges.
   - **Optional existing seed path — destructive, approval required:** the repository
     seed expects the existing literal `judge-owner@example.test` Auth user, created
     and confirmed in the dashboard first. That `.test` address cannot receive a
     normal confirmation email. The seed creates the owner profile and the fixed demo
     shop; it **deletes that shop's repayments, sales, customers and shop before
     rebuilding them**. Do not run it against existing data without explicit approval.
     Do not first create another shop for that owner through `/signup`: server actions
     require exactly one owned shop. The seed does not create the smartphone customer
     Auth account or link one. Its fictional phone numbers are not OTP recipients.
     No seed was run in this task.
6. For the application path, the owner adds a test customer at `/shop/customers/new`
   with consent, using a phone number controlled by the authorized tester. For a
   phone-only record, the customer sets the four-digit PIN once on the owner device.
   The owner separately confirms identity through the existing control. Do not
   reset an existing PIN by SQL or bypass consent/identity checks.
7. For the smartphone test customer, create a fresh owner sale and open its actual
   `/pay/[token]` URL while signed in as that customer. The implemented link flow
   calls `auth.updateUser({ phone })`, verifies an actual OTP using
   `verifyOtp({ type: 'phone_change' })`, then asks for consent and calls
   `link_shop_customer_with_consent`. Auth's confirmed phone must match the active,
   unlinked record in that shop. The owner must confirm identity before tab approval.
   Email/password login alone does not establish that link. **You must provide a
   controlled phone and working Supabase phone-change verification configuration.**
   Inspect [Supabase phone auth](https://supabase.com/docs/guides/auth/phone-login);
   provider fees/availability are a manual decision, not included in this pipeline.
   Use only documented test OTP configuration on a disposable local test project;
   never fabricate a verification result or send OTPs to the seed's fictional numbers.
8. Verify privately that the owner profile has one shop and the customer profile ID
   matches the intended shop-customer link with consent/identity timestamps. Using
   separate signed-in sessions, confirm each can see only its own authorized records;
   a second synthetic owner must not see or mutate the first shop's rows. Never put
   phone numbers, user IDs, keys or database rows into public logs/screenshots.
9. Run the opt-in local integration suite only with its hardcoded local project/API
   guards and synthetic fixtures as documented in `docs/HANDOFF.md`. It needs a real
   local Supabase Auth/PostgREST stack and Docker access for the rollback probe.
   Ordinary CI's PostgreSQL suite cannot replace that verification. Hosted smoke
   checks need a separately authorized test target; do not point the local harness
   at production or weaken its loopback guard.

The seed order above deliberately creates its required Auth owner **before** seed
execution. Earlier architecture prose about phone matches is superseded for setup
by the actual OTP and consent checks in `lib/actions/customers.ts` and `supabase/rls.sql`.

## 5. Vercel preview path and environment (Layer 5)

**External gate: deployment not started.** No Vercel project link, CLI credentials,
Supabase runtime keys, or deployed URL is available here. No account was created
or modified. Start with [Vercel Hobby](https://vercel.com/docs/plans/hobby) and
[current pricing](https://vercel.com/pricing); Hobby is restricted to personal,
non-commercial use. Confirm the hackathon demo qualifies; future commercial use
needs a separate plan decision. No paid plan is enabled by this repository.

1. Sign in to the intended personal Vercel account. Inspect whether tapUP already has
   an approved Vercel project. Give the GitHub integration access only to
   `yottabyte-java/tapUP` if connecting it. Keep Git Fork Protection enabled.
2. For an existing project, Settings → Build and Deployment: Framework **Next.js**,
   repository root **`.`**, Node.js **24.x**, install command
   `npm ci --no-audit --no-fund`, build command `npm run build`, and the framework's
   default output directory. Do not use static export or upload only HTML. Set the
   intended Production Branch to verified default branch `main`.
3. `vercel.json` disables automatic Git deployments. **WHY:** connecting Git or merging
   a PR must not deploy production before approval, and preview credentials must be
   configured before any branch code executes. The setting was checked against
   Vercel's official JSON schema. It does not prevent an authorized manual deployment.
   No Vercel token or deploy job is added to GitHub Actions.
4. For a new project, use the import/setup UI to review those same settings, but
   **stop before clicking Deploy**. The current official
   [CLI deploy documentation](https://vercel.com/docs/cli/deploy) states that a
   project's **first deployment is production even without `--prod`**. Do not assume
   omitting that flag makes a new project safe. Either use an existing approved
   project for a preview or obtain explicit approval for the initial production
   operation. This task grants neither initial-production nor promotion approval.
5. In Project Settings → Environment Variables, add the **Preview** values from the
   disposable Supabase test project, using the table below. Leave Production
   values separate and unset until its release is approved. Do not select “all
   environments” for privileged keys. Treat a preview server as privileged code:
   only reviewed trusted branches may execute with its service-role key. Never
   authorize an untrusted fork deployment with these keys.
6. Once an existing approved project and test variables are available, install/login
   using the official [Vercel CLI](https://vercel.com/docs/cli), then from the repo root
   run `vercel link` and select that exact existing project/account. Verify the linked
   project before continuing. Keep `.vercel/` metadata and any downloaded env files
   out of commits. Check out the approved, committed PR revision and verify its CI.
7. For that existing project, run `vercel deploy` for Preview, without `--prod`,
   `--public`, or production environment overrides. Let the remote build use Preview
   variables. Record the returned actual URL and source commit; check the deployment
   is labelled **Preview** in the dashboard. Do not manufacture a URL or claim one
   exists before the deployment succeeds. The first-deployment gate above still applies.
8. Test that preview with the synthetic accounts and Layer 7 checklist before any
   promotion. Public variables are embedded at build time; rebuild after changing
   them. A preview built against a test Supabase project must not be blindly promoted
   to production: build again using the approved production settings after approval.

### Environment inventory

Values belong in the relevant Vercel environment or an ignored local environment
file, never source control, CI logs, screenshots, chat or this document.

| Exact variable | Purpose and source | Exposure / where needed |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Project URL from that environment's Supabase dashboard | Public; browser, server and build |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Current client configuration name; project anon key from Supabase API settings | Public RLS-scoped client key; browser, server and build |
| `SUPABASE_SERVICE_ROLE_KEY` | Privileged project key from Supabase API settings | Server-only; signup provisioning, guarded payment/customer actions, lender data and health probe |
| `LENDER_API_KEY` | Operator-generated private demo API key, stored securely and supplied by the authorized caller through `x-api-key` | Server-only; required for the lender demo endpoint, not browser payment flows |
| `NODE_ENV` | Set by Next.js/Vercel (`production` for deployed builds) | Runtime-controlled; do not manually override |

Consumers: `lib/supabase/client.ts`, `server.ts` and `proxy.ts` use the public
URL/key; `lib/supabase/admin.ts` uses URL plus service-role key for guarded server
actions, signup, lender data and health. `app/api/v1/buying-power/route.ts` reads
`LENDER_API_KEY`. These same names apply to local development, Preview and
Production, with different target-specific values. Public URL/key are required at
build time; privileged values belong only to the corresponding server runtime.

The code currently uses legacy variable names and has been exercised with anon/
service-role semantics. Supabase recommends
[publishable and secret keys](https://supabase.com/docs/guides/api/api-keys) for new
integrations. Keep the actual names above for this release; assess new key values
with this installed Supabase SDK in a separate compatibility change and test Auth,
PostgREST, admin provisioning and the lender endpoint before switching. Never put a
secret/service-role value into the public key variable or prefix it `NEXT_PUBLIC_`.
No privileged key is required for ordinary CI builds.

`NEXT_PUBLIC_APP_URL` appears in older prose but is not read by application code;
sale links use `window.location.origin`. Do not add it as a required deployment key.
There is no `/auth/callback` or `/api/health` requirement for Vercel project creation;
the health route is supplied by Layer 7. No Vercel token is needed by the CI workflow.

Local verification-only variables (never production application configuration):

| Variable | Source/purpose | Exposure |
|---|---|---|
| `TAPUP_TEST_POSTGRES_CONTAINER` | Existing disposable PostgreSQL 17 Docker container name; GitHub service ID in CI | Local test configuration |
| `DOCKER_HOST` | Existing Docker Unix socket, only if non-default | Local tool configuration |
| `TAPUP_SUPABASE_NETWORK` | Optional existing Docker network name passed to the local integration starter | Local test tooling only |
| `TAPUP_REDTEAM_LOCAL` | Set `1` only when intentionally enabling the local integration harness | Test guard |
| `TAPUP_REDTEAM_PROJECT_ID` | Must match existing harness/config ID `tapup-redteam-local-20261024` | Test guard |
| `TAPUP_REDTEAM_SUPABASE_URL` | Must be `http://127.0.0.1:54321` on the test host | Local test endpoint |
| `TAPUP_REDTEAM_ANON_KEY` | That local Supabase stack's anon key | Test-only public key |
| `TAPUP_REDTEAM_SERVICE_ROLE_KEY` | That local stack's service-role key | Test-only secret |

The optional service placeholders in `supabase/config.toml` (Studio OpenAI,
Twilio, Apple OAuth and experimental S3) are not tapUP deployment requirements;
do not populate or enable them speculatively. Configure a phone provider only after
an explicit account/cost decision for the OTP flow.

## 6. Controlled production release (Layer 6)

1. Confirm the cash/UI fixes and both migration versions are included; complete applicable
   Supabase/Auth/UI tests. Confirm the intended PR #2 revision is committed and
   reviewed; merge it into `main` only with explicit approval. A green CI status
   does not waive the known payment defect or skipped integration coverage.
2. Require `verify`, `security` and `integration` on the exact release revision. Review license
   advisories and CodeRabbit threads. Read Actions logs through PR → Checks or
   `gh run view <actual-run-id> --repo yottabyte-java/tapUP --log-failed`.
   The angle-bracket run ID is a placeholder to replace with the real ID.
3. Record the proposed release commit and approved Supabase target. Review the
   schema/migration delta, backup/restore plan and staging rehearsal. **Stop for
   explicit approval immediately before any production SQL**, including initial
   schema/RLS setup or the destructive demo seed. Never bundle SQL into Actions
   or the Next.js build. The existing floor migration does not fix cash expiry.
4. Configure the four application variables listed in Layer 5 under Vercel
   **Production**, from the approved production project, before the approved build.
   Do not reuse test keys or blindly promote a test-project preview artifact.
5. In Supabase Authentication → URL Configuration, set **Site URL** to the actual
   approved HTTPS application origin once known, separately for test and production.
   The current signup does not pass `emailRedirectTo`, and there is no callback
   route or `exchangeCodeForSession` handler. Keep the default confirmation-link
   template that verifies with Supabase and returns to the Site URL; after email
   confirmation the user signs in explicitly through the existing `/login` route.
   Do not configure a template that returns an auth code/token hash to a nonexistent
   callback. Inspect the project's actual template before relying on this flow.
6. Do not invent callback paths or wildcard every `*.vercel.app` URL. This app
   currently supplies no custom email redirect URL, so it requires no additional
   callback allowlist entry. If a project already uses a custom redirect, allow
   only its verified actual application URL after checking the implementation.
   Use a stable approved preview origin as the test project's Site URL and update
   it when that preview changes. See [Supabase redirect URLs](https://supabase.com/docs/guides/auth/redirect-urls).
7. Confirm synthetic judge login and shop/customer links through the real flow.
   Keep email confirmation, verified-phone OTP, consent, owner attestation, PIN
   lockout, RLS and service-role boundaries intact. A payment link expires in five
   minutes; create a fresh sale after waiting out a 15-minute PIN lock.
8. **Approval gate:** present the exact commit, target project/domain, passing
   checks, unresolved risks and proposed database operations. Obtain explicit
   production approval before clicking Deploy, running an initial deployment,
   `vercel deploy --prod`, promoting a deployment, or changing production SQL.
9. After approval, use the linked project's reviewed production build settings and
   variables. Verify the target/account before invoking the approved Vercel process.
   Record the actual deployment ID/HTTPS URL, commit, migration version and release
   time in the release log. Inspect Deployment → Build Logs and Runtime Logs,
   redact sensitive values, and run the Layer 7 checks. Do not report production
   verified until those checks actually pass.

Production release is **waiting for account configuration, defect resolution,
verification and explicit approval**. No hosted deployment or production migration ran; both migrations were exercised locally.


## 7. Health, smoke tests and recovery (Layer 7)

1. After an approved deployment, copy its actual HTTPS origin from Vercel. Set
   `TAPUP_DEPLOYMENT_URL` locally to that origin (no credentials), then run:

   ```sh
   curl --silent --show-error --max-time 10 --include "$TAPUP_DEPLOYMENT_URL/api/health"
   ```

   Expect HTTP 200, `Cache-Control: no-store` and exactly `{"ok":true}` when the
   server can query Supabase. Missing configuration, database errors and timeout
   return HTTP 503 with only `{"ok":false}`. No login or API key is required.
   A Vercel protection login page is not a health pass: use the authorized browser
   session or Vercel's supported private protection bypass without publishing its key.
2. The endpoint makes a read-only HEAD request for at most one shop with a three-second
   abort signal. It uses the existing server-only admin client, returns no rows, and
   is evaluated per request. This checks the configured REST/database path; it does
   **not** prove Auth, OTP, customer RLS or payment correctness. Avoid high-frequency
   polling that consumes the free-plan quota. Never disable RLS to repair health.
3. If health fails, inspect Vercel Runtime Logs and confirm the project URL and
   server-only key are configured for that deployment's environment. Check Supabase
   availability and schema setup. Do not expose SQL, stack traces or credentials in
   the public health response. Build success alone is insufficient.
4. Complete this compact checklist on the approved preview using only synthetic data:

   - HTTPS pages load without mixed-content or runtime errors; demo payment labels remain visible.
   - Owner and customer email/password login and confirmation work.
   - Each owner has exactly one shop; customer Auth ID, verified phone, shop record,
     owner attestation and explicit consent agree through the supported linking flow.
   - Owner can approve/reject a tab and confirm cash once; PIN failures/lockout,
     expired QR, stale actions and pagination are handled correctly.
   - A different owner/customer cannot read or mutate another shop/customer's records;
     repeat with authenticated browser credentials, not the service-role client.
   - R25 upfront plus R50 repaid today gives R75; yesterday's upfront receipt is not
     counted today. Partial and settled tabs retain their real receipt dates.
   - UI and approval RPC agree on buying power, including low-score R50 floor,
     overdue blocking, increments and cap.
   - `/api/health` returns the expected live 200 and generic failure behavior is
     confirmed in an isolated test environment, never by breaking production.
   - Required GitHub checks pass for the exact deployment commit; Vercel's displayed
     source commit and recorded migration version match the release record.

   Local SQL, Auth/PostgREST and built-app HTTP checks passed, including lock-wait
   expiry. They do not establish a preview/browser/OTP pass. Complete and record the
   hosted checklist before promotion.
5. Inspect GitHub PR → Checks → job logs and security job summary. CLI equivalents:

   ```sh
   gh pr checks 2 --repo yottabyte-java/tapUP
   gh run view <actual-run-id> --repo yottabyte-java/tapUP --log-failed
   ```

   Inspect Vercel Project → Deployments → the exact deployment → Build Logs and
   Runtime Logs. Record only redacted evidence. A CodeRabbit warning is not the same
   as a failed Actions check; resolve or explicitly assess outstanding review threads.
6. For a failed release, stop further releases and identify the last known-good
   deployment and its database compatibility. Obtain rollback approval, then use
   Vercel's [Instant Rollback](https://vercel.com/docs/instant-rollback) when available
   for the plan/project, or revert the faulty change in a new PR and deploy the
   reviewed build. Do not reverse migrations or restore a database without a separate
   data-preservation plan and approval. Rerun health and smoke checks after recovery.

### Release record (fill only with actual observations)

- Deployment status: **not started**.
- Approved commit, Vercel project/deployment ID, HTTPS origin: not assigned.
- Supabase target/migration version, release approval and time: not assigned.
- Local health/Auth/RLS/payment HTTP checks: passed. Hosted HTTPS/browser/OTP smoke: not executed.

### Manual actions, in order

1. Review PR #2's cash/UI repairs, new migration and final CodeRabbit findings.
   Resolve any remaining findings before approving release.
2. In GitHub, require `verify`, `security` and `integration` on `main` if the account plan supports
   rules for this private repo; inspect available secret/push protection. No repository
   settings were changed automatically.
3. Create/select the authorized non-production Supabase project. Review schema/RLS,
   seed deletion effects and the migration relationship in Layer 4 before running SQL.
   The agent completed local integration setup and tests; use the command below to
   reproduce them. Never substitute hosted production keys.
4. Configure synthetic judge identities using Layer 4. Supply a verified phone that
   you control for the customer OTP flow; seed example phones cannot receive OTP.
   Keep passwords/keys private and share judge credentials only through the agreed
   submission channel.
5. Confirm free-plan eligibility and select/link the correct Vercel project. Set the
   documented Preview variables from the test project. Keep Git deployments disabled.
   A brand-new Vercel project's first deployment needs explicit production approval;
   do not assume omitting `--prod` makes that initial deployment a preview.
6. Once the account gate is cleared, authorize the exact preview/test target, deploy
   through Layer 5, and complete this health/smoke checklist and full Supabase tests.
7. Review and approve merging PR #2 when checks and unresolved risks permit it.
   Separately approve any production SQL and the exact production deployment; merging
   alone does not grant either approval. Configure production Auth URLs/keys only
   from the actual approved target, then record and verify the release.


## Disposable local integration (no hosted credentials)

1. Install Docker with a working daemon and Supabase CLI **2.122.0**. CI downloads
   the official Linux amd64 release and verifies its SHA-256. Node24/npm and the
   repository lockfile remain the application toolchain.
2. From the checkout run `bash scripts/check-local-supabase.sh` with `supabase` and
   `docker` on PATH. It copies the guarded config into a temporary directory, starts
   the minimal real stack, and bootstraps schema/RLS/migrations only if public has
   no tables. It never runs `seed.sql`, resets a database or links a hosted project.
   Existing local schemas are reused without modification; review/apply missing
   migrations yourself to that confirmed disposable target before testing.
3. Local CLI status includes keys. The script stores it in a private file and calls
   `node scripts/run-local-supabase-tests.mjs <private-status.json>`; that runner
   passes the five `TAPUP_REDTEAM_*` variables to Vitest without printing values.
   Its command is `npx vitest run tests/redteam/localSupabase.test.ts` with the
   existing loopback/project guards enabled. Failure returns nonzero.
4. On this sandbox use the task-local Docker Unix socket through `DOCKER_HOST` and
   add the installed CLI's runtime bin directory to PATH. If starting here, set
   `TAPUP_SUPABASE_NETWORK=tapup-supabase-local` (local-only Docker network name).
   The bridge-none daemon needs its network gateway explicitly configured as
   `host-gateway-ip`; this is sandbox recovery, not a production requirement.
5. The script stops only a stack it started and retains its data. Synthetic fixtures
   clean up their own records. A pre-existing local stack is left running. Never
   publish status/startup logs or upload local keys as CI artifacts.
6. Required GitHub checks are **`verify`**, **`security`**, **`integration`**. Integration
   runs on the same PR/push/manual events, uses no repository secrets, and exercises
   real email/password sessions, RLS, confirmed-phone consent linking, PIN lockout
   and simulated recovery, approval/rejection guards, cash expiry, replay and rollback.
   It does not send real SMS or verify a Vercel browser session.

### Migration rehearsal and recovery

1. Identify the target as disposable/staging. Back up its data and capture installed
   function definitions with `pg_get_functiondef` before any change. Store backups
   privately; do not paste database rows or credentials into reports.
2. For migration001 inspect the exact existing signature
   `public.approve_tab_atomic(uuid,uuid,uuid,uuid,text,boolean,boolean)`. It uses
   CREATE OR REPLACE and reapplies REVOKE/GRANT; it updates the R50 scoring floor
   only, has no DROP/TRUNCATE/DELETE or backfill, and is safe to repeat on the
   compatible existing schema. It does not fix cash expiry.
3. Migration002 replaces `public.enforce_sale_state_transition()` without replacing
   its trigger attachment, permissions or existing guards. It uses `clock_timestamp()`
   after sale, split-customer and full-cash customer-reference locks, rejects expired cash atomically, and
   writes the actual database receipt timestamp. It contains no data rewrite.
4. In staging, run each reviewed migration in a transaction with stop-on-error
   (`psql -X -v ON_ERROR_STOP=1 --single-transaction -f <reviewed-file>` with connection
   configured privately). Compare installed definitions with the fresh schema.
   Reapply and compare again, then run PostgreSQL and full integration suites.
   The repository tests exercised both repeatability and transactional rehearsal.
5. Before commit, ROLLBACK cancels the migration. After commit, prefer a reviewed
   forward fix. Restoring an older function requires the captured definition,
   compatible grants/signature and explicit approval; restoring the old cash
   function reintroduces the expiry race. Code rollback alone does not undo SQL.
   Restore data from backup only under a separately approved recovery plan.
6. **Production stop:** obtain explicit approval for the target and exact SQL first.
   Do not rerun full CREATE schema scripts on an existing database. On a new project,
   schema already includes both fixes; do not mistake migration001 for a bootstrap.

### Minimal authorized preview dynamic check

After the user authorizes an exact preview origin, run the health curl above and
check HTTPS redirects, security response headers, unauthenticated protected-page
redirects and authenticated synthetic owner/customer flows. Limit requests to that
origin and those fixtures; do not crawl unrelated links or send active attack
payloads without separate authorization. Record actual URL, commit and outcomes.
The local HTTP checks are not a DAST pass against a deployment.
