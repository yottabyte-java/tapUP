# tapUP Security Review and SSDLC Fact Check

**Reviewed:** 2026-10-24
**Repository state:** `security/redteam-hardening` at `17ba7bd`; worktree was clean before this
document was created. This review changes documentation only.
**Scope:** Current repository implementation, supplied project/security documentation, current
unit tests, the isolated local Supabase runtime evidence in
[RED_TEAM_RUNTIME_REPORT.md](./RED_TEAM_RUNTIME_REPORT.md), and the SSDLC text pasted in Prompt 36.

This is an internal, evidence-based review of a hackathon MVP. It is not an independent
penetration test, legal opinion, production certification, or a claim that the application is
secure. “TRUE” means supported by current code or the stated test evidence; it does not imply
independent assurance. “FALSE” means the statement overstates or misdescribes the current build.
“NOT BUILT” means the described control, integration, or verification is absent.

## Review summary

The strongest runtime evidence is from an isolated local Supabase/Postgres stack with synthetic
users and data. Authenticated RLS SELECT/INSERT/UPDATE/DELETE boundaries, confirmed-phone
consent linking, database state transitions, concurrency limits, and repayment invariants were
exercised there. Local app requests also confirmed login/role redirects, response headers, and
lender API behavior. The stack was stopped after testing; its isolated database volume was
retained. No hosted Supabase project was contacted.

The SSDLC needs material corrections before being reused: customer accounts use email/password,
not verified-phone authentication; HTTPS/Vercel deployment and Stitch are not verified or built;
cash-sale authenticity and lender-sharing consent are not enforced as claimed; and several
security tests were unit/database-trigger tests rather than live app-flow attacks.

## Security checks

| Check | How tested | Result | Fix / follow-up |
|---|---|---|---|
| Dependency audit | `npm audit --audit-level=moderate` on 2026-10-24; JSON summary inspected without dumping package data. | **PASS:** 0 info, 0 low, 0 moderate, 0 high, 0 critical; 0 advisories; 31 production dependencies reported by npm. No dependency was flagged by this audit. This is a point-in-time registry audit, not proof a package is vulnerability-free. | Re-run on dependency changes and before release; maintain/update dependencies. |
| Secret-like literals in tracked implementation and README | Heuristic scan of tracked `app/`, `lib/`, `supabase/`, `tests/`, `proxy.ts`, and `README.md`; output was restricted to paths/categories, never matched values. Environment references, test placeholders and schema declarations were not treated as secrets. | **No likely hard-coded credential literals or common private-key/token patterns found by this scan.** A heuristic scan can miss unknown encodings or formats and is not proof of absence. | Keep service-role and lender keys server-side. Add a dedicated secret scanner to CI before deployment. |
| Environment files in Git | Checked `git ls-files` and `git log --all` for `.env` files; checked ignore rules. Did not open or print `.env.local`. | **PASS with scope note:** no `.env` file is tracked or present in the inspected Git history; `.env.local` exists locally and is ignored. `.env.redteam.local` is also ignored. `.env.example` is absent despite a stale mention in `docs/HANDOFF.md`. | Keep local env files ignored; review/rotate credentials if any were ever shared elsewhere. Correct the stale `.env.example` documentation reference separately. |
| RLS tenant and customer reads | `tests/redteam/localSupabase.test.ts` used authenticated sessions against local Supabase with positive and negative controls. | **PASS locally:** owners could read their own shop; cross-shop data and another customer's same-shop sales were not visible. | Keep RLS enabled and repeat these tests after policy/schema changes. Hosted policies were not tested. |
| RLS writes and before/after state | Authenticated PostgREST attempts for foreign-shop customer insert, direct sale insert, foreign customer update, foreign shop delete, and sale delete; checked resulting rows through the local service-role observer. | **PASS locally:** unauthorized writes were rejected or affected zero rows; database state remained unchanged. | Keep privileged mutations in validated server actions; rerun against every policy change. |
| Profile phone mutation | Authenticated profile update attempt, then privileged before/after read in local DB. | **PASS locally:** client could not change the profile phone. | Continue deriving linking identity from Supabase Auth's confirmed phone, not editable profile data. |
| Customer consent/linking | Local authenticated consent RPC tests for matching confirmed phone, mismatched phone, absent phone and missing consent. | **PASS after fix:** valid matching account linked; negative cases failed and row state was checked. The test exposed Auth's no-plus phone representation; the validator and RPC now normalize it. | Keep the regression cases in `tests/redteam/localSupabase.test.ts` and `tests/security.test.ts`. This proves the local Auth format only. |
| PIN hashing and lockout | Reviewed `lib/pin.ts`, server actions and unit tests in `tests/pin.test.ts`; the runtime red-team run did not submit repeated PIN attempts through the app action. | **IMPLEMENTED / PARTIALLY VERIFIED:** bcrypt hashing and five-failure/15-minute lockout logic exist; helper tests pass. Persistent lockout behavior through the authenticated action was not runtime-tested. | Add a gated local integration test that makes repeated wrong attempts and verifies persisted lockout state and successful recovery after expiry. |
| QR expiration and replay | Unit tests for token tampering/expiry/used state; local DB trigger test attempted expired redemption and raced two state transitions, then read sale state. | **PASS for helper/database invariants:** expired transition was rejected and valid concurrent transitions yielded at most one state change. The UI/server-action QR request flow was not attacked end-to-end. | Add an authenticated route/action-level regression if the payment flow changes. |
| Sale total and tab-limit invariants | Attempted a direct sale-total mutation in local DB; raced two 8,000-cent approvals against a 10,000-cent limit; unit/security tests cover client total rejection. | **PASS locally:** total remained unchanged and only one concurrent approval succeeded; approved exposure stayed within limit. This did not simulate a malicious owner fabricating a cash sale. | Preserve server-computed totals and DB triggers; separately assess authorized-owner fraud controls. |
| Repayment bounds, replay and due-time calculation | Local DB tests raced over-limit partial repayments, completed the remaining balance, replayed after settlement, and supplied forged `paid_at`/`on_time`; read final DB state. | **PASS locally:** excess/replay failed, full settlement marked the sale repaid, and database-owned time/timeliness values prevailed. | Keep repayment trigger tests; test the UI/server-action flow separately if changed. |
| Lender authentication and data minimization | Local API request without key; synthetic shop/customer request with a local placeholder API key; checked status and response field names. | **PASS locally:** missing key returned 401; valid key returned only `limitCents`, `level`, `reasons`, `demo`, without name/phone/history fields. The endpoint does **not** currently enforce per-customer consent to lender sharing. | Do not share the endpoint beyond the demo until customer-consent authorization and key lifecycle/rotation are designed and tested. |
| Security response headers | Inspected responses from local protected-route redirects and lender API. | **OBSERVED:** CSP with `frame-ancestors 'none'`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, and `Permissions-Policy: camera=(self)`. **Not observed:** HSTS. No hosted Vercel response was checked. | Verify deployment TLS/HTTPS and add/confirm HSTS at the deployment edge before making an HTTPS-only claim. CSP permits `'unsafe-inline'` for scripts/styles; evaluate a nonce/hash approach before production. |
| Injection, XSS and error leakage | Unit/security tests for SQL/script-looking text, HTML escaping, strict extra-field rejection, generic error output and lender 401; no live browser payload or database injection campaign. | **PARTIALLY TESTED:** unit-level handling passed; exploit resistance in a live data-backed form was not established. | Describe these as unit tests, not live penetration tests; add harmless route-level probes in the isolated lab. |
| Full unit suite and lint | `npm test` and `npm run lint` on 2026-10-24. | **PASS:** 57 tests passed; 7 opt-in local integration tests skipped without explicit local variables. Lint had 0 errors and one existing warning in `lib/lenderData.ts:124` (`now` unused). | Address the warning in its own scoped change; run the gated suite only with an explicitly verified loopback environment. |
| Build/typecheck | Recorded in the latest runtime report: `npx tsc --noEmit` and production build passed with explicitly supplied loopback Supabase settings. | **PASS** as reported on 2026-10-24. | Repeat before release, with production deployment settings reviewed separately. |
| Production hosting / HTTPS | No Vercel deployment or hosted response was part of this assessment; local app probes used HTTP on loopback. | **NOT VERIFIED.** | Verify the actual deployed hostname, TLS redirect, certificate, cookies and headers before claiming “HTTPS only” or “hosted on Vercel.” |
| Real payment / SMS / legal assessment | Inspected MVP scope and app flows; no external payment provider, SMS provider or legal review was used. | **NOT BUILT / NOT VERIFIED:** payments are simulated; Stitch and SMS/USSD are roadmap; no legal advice or POPIA compliance opinion was assessed. | Keep these as roadmap/legal follow-up, not implemented controls or compliance claims. |

### Dependency and secret-scan detail

- `npm audit --audit-level=moderate`: **0 vulnerabilities and 0 advisories** at review time; npm
  did not flag any dependency. No individual dependency is listed as vulnerable by this run.
- The scan intentionally did not read `.env.local`. Its existence and ignore status were checked
  without exposing values. No `.env` path appeared in Git's tracked-file list or commit history.
- The source scan is heuristic and should not be represented as a formal secret-scanner result.
  It found environment-variable references and example/test placeholders, not a confirmed live
  credential. No secret values are included in this report.
- The checked local runtime exposed the Supabase API and Postgres ports on all host interfaces
  while Docker was running. The stack was stopped afterward and the ports were confirmed closed.
  Keep Docker Desktop/firewall exposure in mind when restarting the lab; these checks did not test
  remote access.

## SSDLC text: sentence-by-sentence fact check

The pasted Sonke page navigation, dashboard counters and team metadata are not security claims and
are omitted. The review below covers every substantive sentence and bullet in the submitted
“Security (SSDLC)” text. For every FALSE or NOT BUILT item, the last column gives replacement
wording to paste into Sonke. TRUE rows also give wording that preserves the evidence boundary.

### Security Requirements (Risk Assessment)

| Submitted sentence/claim | Status | Exact replacement wording |
|---|---|---|
| “Main risks: someone taking over a shop or customer account, fake or tampered sales, customers' phone numbers and purchase history leaking, and abuse of the tab (fake customers, repeated PIN guessing).” | TRUE as a list of risks considered; it is not evidence that each risk is fully mitigated. | “Main risks considered are account/session takeover, forged or tampered sales, cross-shop/customer data exposure, fake customer records, and repeated PIN guessing. Controls and remaining test gaps are listed below.” |
| “What must be protected: phone numbers, names, sales and repayment history, tab balances, and PINs.” | TRUE. These data categories exist in the app/schema. | “The app stores and protects customer phone numbers and names, sale/repayment history, tab balances, and PIN hashes.” |
| “Every account is tied to a verified phone number.” | FALSE. Shop-owner and smartphone-customer accounts authenticate with email + password. Only the separate consent-linking path checks a Supabase-confirmed phone; phone-only customers are shop-managed records. | “Shop owners and smartphone customers sign in with email and password. A smartphone customer's account can be linked to a shop record only when Supabase Auth has a confirmed matching phone number and the customer gives consent; phone-only customers are shop-managed records.” |
| “PINs are stored hashed and never in plain text.” | TRUE in implementation; bcrypt is used server-side. | “Four-digit phone-only customer PINs are bcrypt-hashed server-side; the app stores the hash rather than the plaintext PIN.” |
| “A shop can only see its own customers and sales.” | TRUE for the tested local database RLS paths; do not imply hosted-policy verification. | “Local Supabase tests confirmed that authenticated shop owners could not read another shop's customers or sales; hosted RLS has not been tested.” |
| “The customer must consent before being linked to a shop (POPIA).” | FALSE as a blanket guarantee. Smartphone profile linking requires the authenticated customer to consent, but creating a phone-only shop record relies on the shop owner attesting that the customer consented. A timestamp is recorded; this is not legal validation of POPIA compliance. | “For smartphone customers, profile linking requires the authenticated customer to give consent and records a timestamp. For phone-only customers, the shop owner attests that consent was obtained before adding the record. This implementation has not been reviewed as a legal determination of POPIA compliance.” |
| “We only collect the data the credit limit needs.” | FALSE / not demonstrated. The schema also stores identity/contact, account, transaction, repayment and consent information; no data-protection impact or necessity review was performed. | “The MVP stores account/profile details, shop customer phone/name, consent state, PIN hash/lockout state, and sale/repayment history to support its flows and buying-power calculation. We have not completed a legal data-minimization review.” |
| “No card details are stored.” | TRUE for this MVP's simulated-payment flow. | “Payments in the MVP are simulated; the app does not collect or store card numbers or security codes.” |
| “Payments are simulated in the demo, and the real version will use a payment provider such as Stitch so card data never touches our system.” | TRUE that payment is simulated; NOT BUILT for Stitch. “Never touches” is a future architecture goal, not a verified integration. | “MVP payments are simulated and no card details are collected. Stitch is a proposed future integration and has not been built or assessed.” |

### Threat Modelling & Design Review

| Submitted sentence/claim | Status | Exact replacement wording |
|---|---|---|
| “Threats we looked at: guessing a customer's PIN, reusing or editing a sale QR code, one shop reading another shop's data, a shopkeeper adding fake sales to push up a customer's limit, and stolen sessions.” | TRUE as a stated threat list; no independent threat-model review was performed. | “Threats considered include PIN guessing, QR tampering/replay, cross-shop reads, owner-entered fake sales, and stolen sessions. The model is an internal MVP review, not an independent assessment.” |
| “Each sale QR code has a locked total and a short expiry and works once.” | TRUE in the database/action design and local trigger/helper tests; not verified through a full browser payment flow. | “Sale totals are server-computed and immutable; QR tokens have a five-minute expiry and one-use state enforced by the database. Local helper/trigger tests passed; a full browser payment attack was not run.” |
| “PIN entry is limited to a few tries before it locks.” | TRUE in implementation: five failures trigger a 15-minute lock. Persisted action-level lockout was not exercised end-to-end in the red-team run. | “The app implements a five-failure, 15-minute PIN lockout. Unit tests cover the lockout helper; persisted lockout through the authenticated action still needs an end-to-end test.” |
| “Database rules (Supabase row level security) stop users reading other shops' or customers' rows.” | TRUE for tested local Supabase policies and cases. | “Local authenticated Supabase tests confirmed RLS isolation for cross-shop and cross-customer reads; the hosted project was not contacted.” |
| “Cash sales count for less in the buying-power score because they are easier to fake.” | FALSE as an evidence claim. Cash sales do receive lower scoring weight, but “easier to fake” is an unvalidated design assumption, and an authorized owner can still enter cash sales. | “Cash-entered sales receive lower scoring weight as an anti-fraud design assumption. The app does not independently verify that an owner-entered cash sale occurred.” |
| “The shopkeeper approves every tab, so the app is not the lender.” | TRUE for the product flow and current build: tab requests require owner approval. | “Every tab request requires an explicit shop-owner approval; tapUP does not make or fund the credit decision.” |

### Development (Secure coding practices)

| Submitted sentence/claim | Status | Exact replacement wording |
|---|---|---|
| “Next.js and TypeScript with typed inputs.” | TRUE. | “The MVP uses Next.js and TypeScript; server actions and API inputs are validated with Zod schemas.” |
| “All inputs checked on the server, not only in the browser.” | TRUE for exposed action/API input paths reviewed, but “all” is broader than an exhaustive formal audit. | “Server actions and the lender API validate submitted inputs on the server with Zod; browser validation is not treated as the security boundary.” |
| “Database access through Supabase with row level security on every table.” | TRUE for the five application tables in the local schema; RLS enabled and exercised locally. | “The five application tables have Supabase RLS enabled. Local authenticated tests exercised SELECT, INSERT, UPDATE and DELETE boundaries; hosted RLS remains unverified.” |
| “PINs hashed, never logged or returned by the API.” | TRUE by reviewed implementation and column grants; the integration tests also confirmed client-visible access is restricted. | “PINs are bcrypt-hashed server-side; PIN hashes are not returned to browser clients, and client grants exclude the hash column.” |
| “Secrets and keys kept in environment variables, never in the code or repo.” | TRUE for the reviewed implementation/repository scan with limits: secret-bearing values were not inspected; `.env.local` exists locally but is ignored, and no `.env` was tracked or found in history. | “Server keys are read from environment variables and are not hard-coded in the reviewed application source. `.env.local` is ignored and was not inspected; no `.env` file was found in Git tracking or history. A heuristic scan is not proof that no secret exists.” |
| “HTTPS only (Vercel).” | NOT BUILT / NOT VERIFIED in this review. Local tests used HTTP loopback; no deployment or Vercel TLS response was inspected. | “The app is intended for HTTPS deployment, but this review tested only local HTTP. Vercel deployment, HTTPS redirects, TLS and production headers have not been verified.” |
| “Rate limiting on login and PIN attempts.” | TRUE in current code, with an important limit: it is in-memory and process-local, not shared across production instances. | “Login and PIN attempts are rate-limited in the demo using an in-memory IP/route limiter. Production requires a shared atomic store and deployment-level validation.” |
| “Minimal data collected, with a clear consent step when a customer links to a shop.” | FALSE as written because data necessity/legal minimality is unassessed and the phone-only flow relies on owner attestation; the smartphone linking flow requires authenticated-customer consent. | “For smartphone customers, profile linking requires the authenticated customer to give consent and records a timestamp. For phone-only records, the shop owner attests that consent was obtained. The MVP stores account, customer, PIN-state, sale and repayment fields; data minimization and POPIA compliance have not received legal review.” |

### Security Testing

| Submitted sentence/claim | Status | Exact replacement wording |
|---|---|---|
| “Run npm audit and keep dependencies updated.” | TRUE that audit was run; ongoing updates are not verified. | “`npm audit --audit-level=moderate` reported 0 vulnerabilities on 2026-10-24. This is a point-in-time result; dependencies must be re-audited and maintained.” |
| “Manual tests that one shop cannot read another shop's customers or sales.” | TRUE. Actual authenticated local RLS tests ran with positive/negative controls. | “Authenticated tests against isolated local Supabase confirmed that one shop could not read another shop's customer or sale rows; hosted RLS was not tested.” |
| “Test PIN lockout after repeated wrong tries.” | TRUE only as a unit/helper test; persisted lockout through the server action was not runtime-tested. | “Unit tests verify the five-attempt PIN lockout helper. Repeated wrong attempts and persisted lockout through the authenticated app action remain to be tested.” |
| “Test that a used or expired sale QR code is rejected.” | TRUE for unit and local database-trigger/helper checks; not a full UI/server-action attack. | “Unit and isolated local database tests confirmed used/expired QR states are rejected; a full browser payment-flow attack was not run.” |
| “Test that a customer cannot approve a tab above their limit.” | FALSE wording about the actor: customers request tabs; owners approve them. The DB limit/race was tested locally. | “Test that a customer cannot request a tab above available buying power and that concurrent owner approvals cannot exceed the limit. Local DB/action unit tests passed; a browser-submitted end-to-end flow was not run.” |
| “Try common web attacks on the forms (injection, script injection) before submitting.” | NOT BUILT as a live attack campaign. Unit tests cover literal SQL/script-looking strings and HTML escaping only. | “Unit tests cover SQL/script-looking text handling and HTML escaping. Live browser injection/XSS testing against a data-backed form has not been performed.” |
| “Review the demo for leftover secrets or test data.” | FALSE if this implies a complete repository/deployment review. This review performed a limited heuristic source scan and Git `.env` history check; local synthetic test rows were cleaned up. | “A heuristic scan found no likely hard-coded credential literals in the reviewed tracked source, and no `.env` file was tracked or found in Git history. Synthetic local test rows were removed. This was not a complete secret/data scan of deployment systems.” |

### Assessment & Secure Integration

| Submitted sentence/claim | Status | Exact replacement wording |
|---|---|---|
| “For the hackathon the app runs with simulated payments and demo data only, with no real money or real customer data.” | TRUE that payments are simulated and supplied seed data is demo; FALSE/unverified that every possible deployment contains no real customer data. | “The MVP simulates payments and the supplied seed records are demo data. This review used synthetic local records only. Do not enter real customer data; the deployed environment and its data have not been audited here.” |
| “Before going live we will integrate a licensed payment provider (Stitch) so card and wallet data stay with them.” | NOT BUILT. No Stitch or licensed provider integration exists in the MVP. | “Stitch is a proposed pre-launch integration. It is not implemented; the current payment flow is simulated and collects no card details.” |
| “Get legal advice on credit and POPIA rules.” | NOT BUILT / not verified; no legal advice was part of this assessment. | “Before launch, obtain legal advice on National Credit Act obligations, POPIA and customer consent. No legal review has yet been completed.” |
| “The lender API will use authenticated keys, return only a limit decision and never raw customer data, and only be shared where the customer has given consent.” | FALSE as a complete current-state claim. The demo endpoint authenticates an API key and returns aggregate limit/level/reasons without identity/history, but it does not enforce customer consent for lender sharing and is not a real lender integration. | “The demo lender endpoint requires a server-side API key and returns only `limitCents`, `level`, `reasons` and a demo flag, not names, phone numbers or raw history. It does not yet enforce customer consent for lender sharing and must not be treated as a production lender API.” |
| “SMS or USSD approval for customers without smartphones is planned but not built.” | TRUE. | “SMS/USSD customer approval is planned and is not built; the current phone-only approval path uses a PIN on the shopkeeper's device.” |
| “We have not had an independent security review yet.” | TRUE as of this review. This internal code/runtime review is not independent. | “We have not had an independent third-party security review.” |

## Evidence references and remaining gaps

- Architecture and action intent: [ARCHITECTURE.md](./ARCHITECTURE.md); implementation paths include
  `lib/actions/auth.ts`, `lib/actions/customers.ts`, `lib/actions/sales.ts`,
  `lib/actions/tabs.ts`, `lib/pin.ts`, `lib/rateLimit.ts`, and `proxy.ts`.
- Database controls: [schema.sql](../supabase/schema.sql) and
  [rls.sql](../supabase/rls.sql).
- Unit/security coverage: `tests/security.test.ts`, `tests/pin.test.ts`, `tests/qr.test.ts`,
  `tests/lenderApi.test.ts`, `tests/validation.test.ts`, and
  `tests/redteam/localSupabase.test.ts`.
- Runtime setup, exact tested outcomes and test limitations:
  [RED_TEAM_RUNTIME_REPORT.md](./RED_TEAM_RUNTIME_REPORT.md).
- Not verified: hosted Supabase RLS, Vercel deployment/TLS, real SMS, external lender/provider
  integrations, legal compliance, production secret stores, persisted PIN lockout through a live
  action, malicious-owner fake-sale prevention, and full browser-level injection/XSS.

The pasted Sonke page also contains non-security dashboard/navigation text. That content was not
treated as part of the SSDLC claims.
