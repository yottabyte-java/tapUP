# Chromium judge journey

## Guarded local setup

1. Use Node 24, npm and the committed lockfile: `npm ci --no-audit --no-fund`.
   Install Chromium only if it is absent: `npx playwright install chromium` (Linux
   hosts may need Playwright's documented OS prerequisites). In the CodeRabbit
   workspace use the registered shared Chromium instead; do not install a second
   browser there.
2. Start the disposable Supabase project from `supabase/config.toml`, project ID
   `tapup-redteam-local-20261024`. Follow the local-stack instructions in
   [DEPLOYMENT.md](DEPLOYMENT.md). `scripts/check-local-supabase.sh` can prepare an
   empty local project and verify Auth/PostgREST/RLS; it deliberately does not
   reset an existing database or apply changes to one. Ensure the reviewed schema,
   RLS and both existing migrations are current. Never run the demo seed/reset or
   supply a hosted project.
3. Save CLI status privately, using the same workdir that started this stack:

   ```sh
   umask 077
   supabase status --workdir "$TAPUP_LOCAL_WORKDIR" -o json > "$TAPUP_LOCAL_STATUS_FILE"
   chmod 600 "$TAPUP_LOCAL_STATUS_FILE"
   ```

   Set these two shell variables to your own local workdir and private file path
   first. Never print that file or commit it. It contains generated local keys.
   The harness requires `API_URL` to be exactly `http://127.0.0.1:54321`, plus
   `ANON_KEY` and `SERVICE_ROLE_KEY`. Never add these keys to source; keep raw artifacts private as described below.
4. Docker must provide the disposable container
   `supabase_db_tapup-redteam-local-20261024`. PostgreSQL access via
   `docker exec … psql -U postgres -d postgres` is required for the expiry-clock
   probe and the narrowly scoped test-failure trigger. Use `DOCKER_HOST` for a
   non-default Unix socket. No hosted SQL is supported.
5. Run:

   ```sh
   TAPUP_E2E_STATUS_FILE="$TAPUP_LOCAL_STATUS_FILE" npm run test:e2e
   npm run test:e2e:report
   ```

   Playwright builds using `npm run build` (Webpack), starts the production app
   at `http://127.0.0.1:3100`, and waits for `/api/health` to return 200. This uses
   real local Supabase, not CI's placeholder build configuration. Do not reuse a
   build made for another project. Port 3100 must be available.
6. For headed diagnosis on a desktop host use `npm run test:e2e -- --headed`.
   In the CodeRabbit sandbox, register the ready application service first, then:

   ```sh
   TAPUP_E2E_STATUS_FILE="$TAPUP_LOCAL_STATUS_FILE" \
   TAPUP_E2E_REUSE_SERVER=1 \
   TAPUP_E2E_CDP_URL="$(coderabbit-agent-browser get cdp-url)" \
   npm run test:e2e
   ```

   Reuse is explicit and suitable only for the current source build/local project.
   The normal command owns startup and avoids a stale server. After repeated
   diagnostic runs, respect the login limit's 15-minute window; restarting only
   the disposable Next process also clears its documented process-local limiter.
   The harness never disables or forges rate-limit identity.

## What runs

- Chromium at 1440×900 and 390×844, one worker, no retries. Accounts and real UI
  login sessions are created once per run, reused across worker restarts, then
  deleted. Each test clears only this run's synthetic financial records. Unknown
  local records and other users are preserved.
- Synthetic email/password accounts are created and confirmed via local Auth
  admin setup. Owner/customer profiles, explicit consent and owner-confirmed link
  use the existing integration-fixture pattern. This is **not proof of email
  delivery, OTP, phone verification, self-onboarding or consent capture in UI**.
- Sales use the real cart, displayed QR (decoded from its screenshot), customer
  payment form, owner controls and repayment form. No response is mocked as
  successful. Integer-cent amounts, sale state, receipts and repayments are read
  independently from the local database after browser mutations.
- Recovery scenarios abort real requests before they reach the server and verify
  no mutation, then retry through the UI. Another scenario installs a temporary
  trigger scoped to this run's customer that fails the credit-limit cache update
  **after** a repayment is saved. Cleanup drops that trigger in `finally`.
- Browser console errors/warnings, uncaught errors, HTTP failures and transport
  failures are collected and asserted. Only intentional faults and explicit
  navigation cancellations have test-scoped allowances. Completed HTTP-200 Flight
  streams cancelled by Next navigation/teardown are recorded separately.
- Real database lock-wait races and PIN lockout remain in the PostgreSQL/Supabase
  suites (`npm test` with the documented local variables). Do not infer those
  cases, camera permission/scanning, or hosted HTTPS from browser assertions.

## Artifacts and privacy

`playwright-report/index.html` is the local HTML report; `test-results/` contains
per-test traces for owner/customer/unrelated customer, diagnostics and screenshots.
Both directories are ignored and created privately. Open a trace locally with
`npx playwright show-trace <path-to-trace.zip>`.

Tracing starts after login. Raw traces still contain **local session cookies,
headers and one-use QR URLs**. Never upload raw traces, HTML reports, session state,
or videos to a public issue/CI artifact. Passwords are not intentionally captured;
a failed login can still cause diagnostic tools to capture form state, so treat
all raw browser evidence as private. Only publish inspected screenshots without
QRs/credentials and sanitized evidence.

Shared CDP runs record traces/screenshots; they do not produce Playwright videos.
Normal locally launched contexts retain video on failure and delete successful
videos. Viewport screenshots are saved for the owner dashboard, customer account
and partial/full repayment result. The build alone can be checked with `TAPUP_E2E_STATUS_FILE="$TAPUP_LOCAL_STATUS_FILE" node scripts/start-e2e.mjs --build-only`.

Set `TAPUP_E2E_OUTPUT_DIR` to choose another private test output directory
(the JSON summary remains in `test-results/results.json`). The mobile app scrolls inside `.app-content`;
inspect the visible controls as well as DOM assertions.

The browser suite is an explicit local verification command. Existing Actions
`verify`, `security` and `integration` do not implicitly claim browser coverage.

To export evidence from a complete passing run, inspect the principal screenshots
first, then use a **new** private destination:

```sh
TAPUP_E2E_STATUS_FILE="$TAPUP_LOCAL_STATUS_FILE" \
python3 scripts/export-e2e-evidence.py /tmp/tapup-reviewed-evidence
```

The exporter creates a compact HTML/JSON summary, principal screenshots and
sanitized trace ZIPs. It removes headers/credential fields, JWTs, QR URLs,
SVG geometry and trace images; sanitized traces intentionally lose visual frames.
It refuses failed/skipped/flaky runs and existing destinations. Inspect/scan the
export before sharing. This is separate from Playwright's richer **private** HTML
report. It does not make arbitrary raw diagnostic files safe to publish.
