# tapUp Runtime Red Team Report

## Environment

- **Application:** Next.js 16.4.1, started locally at `http://127.0.0.1:3100` with dummy Supabase values; the process was stopped after testing.
- **Database:** No local Supabase/Postgres test stack or test database was available. `.env.local` points to a hosted Supabase project; its values were not printed, and no attack requests were sent to it.
- **Commit:** `dda50b2` (working tree had uncommitted changes during this assessment).
- **Base URL:** `http://127.0.0.1:3100` (temporary local test server).

## Executive Result

**SECURE WITH GAPS.** Limited unauthenticated HTTP checks were performed against the running local app. Database-backed and authenticated attacks were not run, so this is not a complete runtime red-team assessment and does not establish that tapUp is secure.

## Runtime Attack Results

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

## Successful Exploits

None confirmed in the limited local HTTP checks. This does not mean the untested attack classes are safe.

## Fixed Exploits

The previously reported phone-linking issue was **not attacked at runtime**. The code fix and static regression test were reviewed separately, but the requested runtime verification requires a disposable test Supabase project with synthetic users and data.

## Remaining Vulnerabilities

No additional exploit was confirmed by this limited runtime exercise. The authenticated and database-backed attack surface remains unverified.

## Runtime Tests Not Possible

The repository had no local Supabase configuration, and Docker showed no Supabase containers. The only configured Supabase URL is hosted. Because its test/staging status could not be established, no authenticated traffic, mutations, RLS queries, or database forensics were sent to it.

Without a disposable test database and synthetic test accounts, the following remain unverified: IDOR, RLS, consent/phone linking, PIN, QR replay, sale tampering, buying-power enforcement, races, replay, mass assignment, stored/reflected XSS, SQL injection, lender data manipulation, and session/role boundaries.

## Database Verification

**Not performed.** There was no local test database, and the hosted Supabase project was not contacted. No database state was created or changed by this assessment.

## Final Verdict

The local app denied unauthenticated access to the tested protected routes and rejected lender requests without a correct API key. Those checks provide limited runtime evidence only. **RLS runtime behavior, authenticated authorization, state-changing operations, and the phone-link fix remain NOT VERIFIED.**

## Validation

- `npm test`: passed, 9 test files / 56 tests.
- `npm run lint`: passed with one existing warning in `lib/lenderData.ts:124` (`now` is defined but never used).
- `npx tsc --noEmit`: passed.
- `npm run build`: passed.
- `npm audit --audit-level=moderate`: passed, zero vulnerabilities reported.
- `git diff --check`: passed.
