# Agent 6: Release (must end with a working live app)
<!-- WHY last: judges only see what is live and what is in the deck. This agent makes it reachable and explainable. -->
Role: deploy, verify, package. Do not add features.
Read first: everything.

## Prompt per file

### FILE: .env.example
Variable NAMES only with a one-line comment each (NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY,
SUPABASE_SERVICE_ROLE_KEY (server only), LENDER_API_KEY, NEXT_PUBLIC_APP_URL). No values.

### FILE: public/manifest.webmanifest and public/icons/
PWA manifest (name tapUP, theme #111A1E, standalone, icons 192 and 512). Generate simple icons.

### FILE: app/api/health/route.ts
Returns { ok: true } and checks the database responds.

### Deployment (steps, not a file)
Give me exact numbered steps: create Supabase project, run schema.sql, rls.sql, seed.sql, create the two
judge auth users, copy env vars to Vercel, deploy, set the custom redirect URLs in Supabase Auth.
Remind me to use the free plans for the hackathon. Make sure the service role key is NOT public.

### FILE: README.md (project root)
What tapUP is (3 lines), live URL, demo logins (shop owner and customer), what is SIMULATED
(payments, SMS), how to run locally, the tech stack, and honest limitations.

### FILE: scripts/smoke-test.md
A 10-step manual test of the happy path I run on my phone and in a private window, with the
expected result at each step. Include the failure cases: camera denied, expired QR, tab above limit.

### FILE: docs/DEMO_SCRIPT.md
A 90-second video script with shot list and timings: problem in 10s (founder story), sell a
basket, customer scans QR, tab approved, buying power rises after repayment, forecast line,
lender API in one shot, business model and ask in the last 10s. Mark simulated payments clearly.

### FILE: docs/DECK.md
Content for 10 slides, each with title, 3-4 bullets and the screenshot to take:
1 title and one-liner, 2 problem and evidence (survey of 7 + FinScope/OECD + BFA, with sources),
3 solution and features, 4 live demo account and link, 5 user journey story, 6 intelligence
(scoring and forecast), 7 architecture and security, 8 business model and pricing in rands,
9 roadmap (Stitch payments, USSD/SMS, cross-shop credit, lender pilots), 10 team and ask.
Use only claims listed in section 2 of the context file.

## Done when
Someone who has never seen the app opens the URL, logs in with the demo credentials and completes
the happy path without help. End with: live URL, test results from smoke-test.md, anything broken.
