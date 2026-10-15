# ALL PROMPTS in one file (same content as prompts/NN_*.md)

# Prompt 00: (setup) project scaffold
Agent: Setup  |  Read first: README.md
Paste first: 00_PROJECT_CONTEXT.md

## Prompt (copy everything in the box)
```text
Create the Next.js project in this repo root.
- Run create-next-app with TypeScript, Tailwind, App Router, ESLint, src dir OFF, import alias @/*.
- Install: @supabase/supabase-js @supabase/ssr zod bcryptjs qrcode.react html5-qrcode ; dev: vitest @types/bcryptjs.
- Add DM Sans via next/font in app/layout.tsx and set Tailwind theme colours: bg #111A1E, card #1B2A30, teal #2DD4A0, amber #F5B83D.
- Create empty folders from docs/FILE_STRUCTURE.md. Add .gitignore entries for .env.local.
- Add npm scripts: "test": "vitest run".
Explain each dependency in one line and why we need it. Do not build any feature yet.

Rules: follow 00_PROJECT_CONTEXT.md. Comment WHY in code. Stay inside this file's scope; put other-agent notes in docs/HANDOFF.md.
When done, explain this file to me in 5 lines and tell me how to justify it if a judge asks.
```

## You should see
npm run dev opens a page on localhost:3000. npm test runs (no tests yet is fine). .env.local is NOT tracked by git.

## After it finishes
1. Run it, test it, read the diff. `git commit -m "<this file>"`.
2. If something is unclear, ask it: "Explain this file to me in 5 lines and how I justify it to a judge."
3. Paste its summary to Claude (chat) for review before the next prompt.

---

# Prompt 01: docs/ARCHITECTURE.md
Agent: 1 Architect  |  Read first: docs/FILE_STRUCTURE.md
Paste first: 00_PROJECT_CONTEXT.md

## Prompt (copy everything in the box)
```text
Write docs/ARCHITECTURE.md. Design only, no app code.
Include: (1) the folder structure, confirm or fix docs/FILE_STRUCTURE.md; (2) every page, server action
and API route with who may call it (shop owner, customer, lender key); (3) step-by-step sequences with
the tables touched for: sale via shop QR, tab via phone+PIN, cash sale, repaying a tab; (4) a Mermaid
data-flow diagram; (5) env var NAMES; (6) top 8 risks with one-line mitigations; (7) what can go wrong in
the live demo with a fallback each; (8) the build order for agent 4 so a working slice exists early.
Then explain the diagram to me in plain words and tell me how to justify the design if a judge asks.

Rules: follow 00_PROJECT_CONTEXT.md. Comment WHY in code. Stay inside this file's scope; put other-agent notes in docs/HANDOFF.md.
When done, explain this file to me in 5 lines and tell me how to justify it if a judge asks.
```

## You should see
You can read it in 10 minutes and nothing contradicts 00_PROJECT_CONTEXT.md.

## After it finishes
1. Run it, test it, read the diff. `git commit -m "<this file>"`.
2. If something is unclear, ask it: "Explain this file to me in 5 lines and how I justify it to a judge."
3. Paste its summary to Claude (chat) for review before the next prompt.

---

# Prompt 02: docs/HANDOFF.md
Agent: 1 Architect  |  Read first: docs/ARCHITECTURE.md
Paste first: 00_PROJECT_CONTEXT.md

## Prompt (copy everything in the box)
```text
Create docs/HANDOFF.md with five headings: For Database, For Scoring, For Frontend, For Security, For Release.
Move anything you noticed that belongs to another agent under the right heading. Do not solve it yourself.
Add one line at the top: every agent appends here instead of editing another agent's files.

Rules: follow 00_PROJECT_CONTEXT.md. Comment WHY in code. Stay inside this file's scope; put other-agent notes in docs/HANDOFF.md.
When done, explain this file to me in 5 lines and tell me how to justify it if a judge asks.
```

## You should see
File exists with five headings and at least the open questions you noticed.

## After it finishes
1. Run it, test it, read the diff. `git commit -m "<this file>"`.
2. If something is unclear, ask it: "Explain this file to me in 5 lines and how I justify it to a judge."
3. Paste its summary to Claude (chat) for review before the next prompt.

---

# Prompt 03: supabase/schema.sql
Agent: 2 Database  |  Read first: docs/ARCHITECTURE.md
Paste first: 00_PROJECT_CONTEXT.md

## Prompt (copy everything in the box)
```text
Write supabase/schema.sql for Postgres. snake_case, uuid primary keys (gen_random_uuid()), created_at on every table.
Tables:
- profiles: id (= auth.users.id), role ('shop_owner'|'customer'), full_name, phone
- shops: id, owner_id -> profiles, name
- shop_customers: id, shop_id, customer_profile_id (nullable), customer_phone, display_name,
  status ('active'|'blocked'), consent_at (required before any tab), pin_hash (nullable),
  failed_pin_attempts int default 0, locked_until, credit_limit_cents int default 0; UNIQUE (shop_id, customer_phone)
- sales: id, shop_id, shop_customer_id (nullable), items jsonb, total_cents int CHECK (>0),
  method ('tab'|'demo_card'|'cash'|'pending'), status ('pending'|'approved'|'paid'|'repaid'|'expired'|'cancelled'),
  qr_token_hash, expires_at, used_at, approved_at, due_at
- repayments: id, sale_id, amount_cents CHECK (>0), paid_at, on_time boolean
Add foreign keys with sensible ON DELETE, CHECK constraints, and indexes for: ledger by shop, customer history by shop_customer, token lookup by hash.
Comment every table with WHY it exists. Money is always integer cents.

Rules: follow 00_PROJECT_CONTEXT.md. Comment WHY in code. Stay inside this file's scope; put other-agent notes in docs/HANDOFF.md.
When done, explain this file to me in 5 lines and tell me how to justify it if a judge asks.
```

## You should see
Runs without errors in the Supabase SQL editor on a fresh project. Tables appear in Table Editor.

## After it finishes
1. Run it, test it, read the diff. `git commit -m "<this file>"`.
2. If something is unclear, ask it: "Explain this file to me in 5 lines and how I justify it to a judge."
3. Paste its summary to Claude (chat) for review before the next prompt.

---

# Prompt 04: supabase/rls.sql
Agent: 2 Database  |  Read first: supabase/schema.sql
Paste first: 00_PROJECT_CONTEXT.md

## Prompt (copy everything in the box)
```text
Write supabase/rls.sql. Enable row level security on EVERY table.
Policies: a shop owner reads/writes only rows for shops they own; a customer reads only their own shop_customers and sales rows;
pin_hash, qr_token_hash, failed_pin_attempts and locked_until must NOT be readable from the client at all
(use a safe view or column privileges and explain the choice in a comment).
The lender API and PIN checks use the service role on the server only. Comment each policy with the attack it prevents.
Then explain to me in plain words what RLS is and why it is safer than checking permissions only in app code.

Rules: follow 00_PROJECT_CONTEXT.md. Comment WHY in code. Stay inside this file's scope; put other-agent notes in docs/HANDOFF.md.
When done, explain this file to me in 5 lines and tell me how to justify it if a judge asks.
```

## You should see
Run it after schema.sql with no errors. Table Editor shows RLS enabled on all tables.

## After it finishes
1. Run it, test it, read the diff. `git commit -m "<this file>"`.
2. If something is unclear, ask it: "Explain this file to me in 5 lines and how I justify it to a judge."
3. Paste its summary to Claude (chat) for review before the next prompt.

---

# Prompt 05: supabase/seed.sql
Agent: 2 Database  |  Read first: supabase/schema.sql, supabase/rls.sql
Paste first: 00_PROJECT_CONTEXT.md

## Prompt (copy everything in the box)
```text
Write supabase/seed.sql for demo data.
- Shop "Mama's Spaza (demo)" owned by a judge shop-owner account (I create the auth users in the dashboard; map by email placeholders and tell me which emails to create).
- Customers: Thabo M. (frequent, always repays on time), Nomsa K. (weekly, ONE late repayment), Sipho D. (occasional, one overdue tab), New Customer (no history).
- 30 days of realistic sales with a mix of cash, tab and demo_card, with repayments and on_time flags.
- Everything labelled demo. No real phone numbers; use clearly fake ones.
Make the script re-runnable (clean demo rows first).

Rules: follow 00_PROJECT_CONTEXT.md. Comment WHY in code. Stay inside this file's scope; put other-agent notes in docs/HANDOFF.md.
When done, explain this file to me in 5 lines and tell me how to justify it if a judge asks.
```

## You should see
After running it, the shop has 4 customers and about 30 days of history. The new customer has none.

## After it finishes
1. Run it, test it, read the diff. `git commit -m "<this file>"`.
2. If something is unclear, ask it: "Explain this file to me in 5 lines and how I justify it to a judge."
3. Paste its summary to Claude (chat) for review before the next prompt.

---

# Prompt 06: supabase/rls-checks.sql
Agent: 2 Database  |  Read first: supabase/rls.sql, supabase/seed.sql
Paste first: 00_PROJECT_CONTEXT.md

## Prompt (copy everything in the box)
```text
Write supabase/rls-checks.sql with 3 queries I can run as different users proving: (1) shop A cannot read shop B's customers or sales;
(2) one customer cannot read another customer's sales; (3) pin_hash is not readable by the client role.
For each, say what output means PASS and what means FAIL.

Rules: follow 00_PROJECT_CONTEXT.md. Comment WHY in code. Stay inside this file's scope; put other-agent notes in docs/HANDOFF.md.
When done, explain this file to me in 5 lines and tell me how to justify it if a judge asks.
```

## You should see
All three queries show PASS when I run them as the described users.

## After it finishes
1. Run it, test it, read the diff. `git commit -m "<this file>"`.
2. If something is unclear, ask it: "Explain this file to me in 5 lines and how I justify it to a judge."
3. Paste its summary to Claude (chat) for review before the next prompt.

---

# Prompt 07: lib/money.ts
Agent: 3 Scoring  |  Read first: docs/ARCHITECTURE.md
Paste first: 00_PROJECT_CONTEXT.md

## Prompt (copy everything in the box)
```text
Write lib/money.ts: toCents(rand: number|string), formatRand(cents) -> "R1,248.50", addCents/subCents,
clampCents(min,max). Money is integer cents only; never float math. Throw on NaN or negative where it makes no sense.
Comment why floats are dangerous for money.

Rules: follow 00_PROJECT_CONTEXT.md. Comment WHY in code. Stay inside this file's scope; put other-agent notes in docs/HANDOFF.md.
When done, explain this file to me in 5 lines and tell me how to justify it if a judge asks.
```

## You should see
formatRand(10570) gives R105.70. toCents('34.90') gives 3490.

## After it finishes
1. Run it, test it, read the diff. `git commit -m "<this file>"`.
2. If something is unclear, ask it: "Explain this file to me in 5 lines and how I justify it to a judge."
3. Paste its summary to Claude (chat) for review before the next prompt.

---

# Prompt 08: lib/buyingPower.ts
Agent: 3 Scoring  |  Read first: supabase/schema.sql, lib/money.ts
Paste first: 00_PROJECT_CONTEXT.md

## Prompt (copy everything in the box)
```text
Write lib/buyingPower.ts (pure functions, no database).
Export calculateBuyingPower(history, now) -> { limitCents, level, score, pointsToNextLevel, nextLimitCents, reasons[] }.
history = ONE customer's sales and repayments at ONE shop, last 30 days.
Starter rules (I will tune them):
- Frequency 0-40 pts from distinct purchase days in the last 30 days
- Spend 0-30 pts from average weekly spend
- Repayment 0-30 pts from share of tabs repaid on time; no tabs yet = neutral 15
- Cash counts at 50% weight (easier to fake)
- A late repayment removes points; 2+ late repayments in 30 days cap the level at 1
Limit steps of R50: score 0-9 R0; 10-19 R50; 20-34 R100; 35-49 R150; 50-64 R200; 65-79 R250; 80+ R300 (MVP cap R300).
A brand-new customer is R0 until their first completed purchase, then R50.
Export explainLimit(result) -> plain-English strings, e.g. "14 purchases in 30 days", "3 of 3 tabs repaid on time".
Comment every rule with WHY so I can defend it to a judge. Then explain the scoring to me in 5 lines.

Rules: follow 00_PROJECT_CONTEXT.md. Comment WHY in code. Stay inside this file's scope; put other-agent notes in docs/HANDOFF.md.
When done, explain this file to me in 5 lines and tell me how to justify it if a judge asks.
```

## You should see
Unit tests (next prompt) pass, and you can explain each rule in one sentence.

## After it finishes
1. Run it, test it, read the diff. `git commit -m "<this file>"`.
2. If something is unclear, ask it: "Explain this file to me in 5 lines and how I justify it to a judge."
3. Paste its summary to Claude (chat) for review before the next prompt.

---

# Prompt 09: lib/forecast.ts
Agent: 3 Scoring  |  Read first: lib/buyingPower.ts
Paste first: 00_PROJECT_CONTEXT.md

## Prompt (copy everything in the box)
```text
Write lib/forecast.ts (pure functions).
forecastNextWeekSpend(history) -> cents, simple moving average of the last 4 weeks.
likelyToNeedTab(history) -> { likely: boolean, reason: string } true when the customer historically buys on tab near month end
(last 5 days / first 3 days of the month) or when forecast spend is clearly above their usual cash pattern.
Keep it simple and explainable; no machine learning. This is the 'app that thinks and predicts' for the Intelligence criterion.
Return a friendly reason like "You often need a tab around month end".

Rules: follow 00_PROJECT_CONTEXT.md. Comment WHY in code. Stay inside this file's scope; put other-agent notes in docs/HANDOFF.md.
When done, explain this file to me in 5 lines and tell me how to justify it if a judge asks.
```

## You should see
Tests pass, including a customer with a clear month-end pattern and a customer with no history (likely=false).

## After it finishes
1. Run it, test it, read the diff. `git commit -m "<this file>"`.
2. If something is unclear, ask it: "Explain this file to me in 5 lines and how I justify it to a judge."
3. Paste its summary to Claude (chat) for review before the next prompt.

---

# Prompt 10: lib/pin.ts
Agent: 3 Scoring  |  Read first: supabase/schema.sql
Paste first: 00_PROJECT_CONTEXT.md

## Prompt (copy everything in the box)
```text
Write lib/pin.ts using bcryptjs (pure JS, deploys on Vercel without native build problems; mention that reason in a comment).
hashPin(pin), verifyPin(pin, hash), plus lockout helpers: after 5 wrong tries lock 15 minutes (isLocked, registerFailure, reset).
PIN must be exactly 4 digits. Never log or return a PIN or hash. Constant-time compare via bcrypt.

Rules: follow 00_PROJECT_CONTEXT.md. Comment WHY in code. Stay inside this file's scope; put other-agent notes in docs/HANDOFF.md.
When done, explain this file to me in 5 lines and tell me how to justify it if a judge asks.
```

## You should see
Tests: correct PIN passes, wrong fails, 5 failures locks, lock expires after 15 minutes.

## After it finishes
1. Run it, test it, read the diff. `git commit -m "<this file>"`.
2. If something is unclear, ask it: "Explain this file to me in 5 lines and how I justify it to a judge."
3. Paste its summary to Claude (chat) for review before the next prompt.

---

# Prompt 11: lib/qr.ts
Agent: 3 Scoring  |  Read first: supabase/schema.sql
Paste first: 00_PROJECT_CONTEXT.md

## Prompt (copy everything in the box)
```text
Write lib/qr.ts. createSaleToken() -> { token, tokenHash, expiresAt } with a random 128-bit token (crypto.randomBytes), expiry 5 minutes.
verifySaleToken(token, storedHash, expiresAt, usedAt, now) -> 'ok' | 'expired' | 'used' | 'invalid'. Store only the hash.
Use constant-time comparison. Comment why we never store the raw token.

Rules: follow 00_PROJECT_CONTEXT.md. Comment WHY in code. Stay inside this file's scope; put other-agent notes in docs/HANDOFF.md.
When done, explain this file to me in 5 lines and tell me how to justify it if a judge asks.
```

## You should see
Tests: ok, expired after 5 minutes, used twice rejected, tampered token invalid.

## After it finishes
1. Run it, test it, read the diff. `git commit -m "<this file>"`.
2. If something is unclear, ask it: "Explain this file to me in 5 lines and how I justify it to a judge."
3. Paste its summary to Claude (chat) for review before the next prompt.

---

# Prompt 12: lib/validation.ts
Agent: 3 Scoring  |  Read first: lib/money.ts
Paste first: 00_PROJECT_CONTEXT.md

## Prompt (copy everything in the box)
```text
Write lib/validation.ts with zod schemas (all .strict() so extra fields are rejected):
createSale (items with productId, qty 1-99), approveTab, payCash, demoPay, addCustomer (name 2-60 chars, SA phone format, consent must be literally true),
setPin (4 digits), repayTab, lenderQuery (shop uuid, customer uuid).
Totals are never accepted from the client; comment why (the server recomputes them).

Rules: follow 00_PROJECT_CONTEXT.md. Comment WHY in code. Stay inside this file's scope; put other-agent notes in docs/HANDOFF.md.
When done, explain this file to me in 5 lines and tell me how to justify it if a judge asks.
```

## You should see
Bad inputs (extra fields, negative qty, consent=false) are rejected in tests.

## After it finishes
1. Run it, test it, read the diff. `git commit -m "<this file>"`.
2. If something is unclear, ask it: "Explain this file to me in 5 lines and how I justify it to a judge."
3. Paste its summary to Claude (chat) for review before the next prompt.

---

# Prompt 13: tests/buyingPower.test.ts and tests/forecast.test.ts
Agent: 3 Scoring  |  Read first: lib/buyingPower.ts, lib/forecast.ts
Paste first: 00_PROJECT_CONTEXT.md

## Prompt (copy everything in the box)
```text
Write vitest tests covering: brand-new customer; cash-only customer (weighted at 50%); weekly shopper with all tabs repaid on time;
one late repayment lowers the score; two late repayments cap level at 1; limit never above R300; R50-step boundaries;
forecast with clear month-end pattern; forecast with no history. Use readable test names.

Rules: follow 00_PROJECT_CONTEXT.md. Comment WHY in code. Stay inside this file's scope; put other-agent notes in docs/HANDOFF.md.
When done, explain this file to me in 5 lines and tell me how to justify it if a judge asks.
```

## You should see
npm test passes. Failing tests tell you which rule is wrong.

## After it finishes
1. Run it, test it, read the diff. `git commit -m "<this file>"`.
2. If something is unclear, ask it: "Explain this file to me in 5 lines and how I justify it to a judge."
3. Paste its summary to Claude (chat) for review before the next prompt.

---

# Prompt 14: tests/qr.test.ts and tests/pin.test.ts
Agent: 3 Scoring  |  Read first: lib/qr.ts, lib/pin.ts
Paste first: 00_PROJECT_CONTEXT.md

## Prompt (copy everything in the box)
```text
Write vitest tests: sale token ok / expired at 5 minutes / reused / tampered; PIN correct / wrong / lock after 5 failures / unlock after 15 minutes.

Rules: follow 00_PROJECT_CONTEXT.md. Comment WHY in code. Stay inside this file's scope; put other-agent notes in docs/HANDOFF.md.
When done, explain this file to me in 5 lines and tell me how to justify it if a judge asks.
```

## You should see
npm test passes.

## After it finishes
1. Run it, test it, read the diff. `git commit -m "<this file>"`.
2. If something is unclear, ask it: "Explain this file to me in 5 lines and how I justify it to a judge."
3. Paste its summary to Claude (chat) for review before the next prompt.

---

# Prompt 15: app/api/v1/buying-power/route.ts
Agent: 3 Scoring  |  Read first: lib/buyingPower.ts, lib/validation.ts
Paste first: 00_PROJECT_CONTEXT.md

## Prompt (copy everything in the box)
```text
Write the lender API demo route. GET with header x-api-key compared in constant time with LENDER_API_KEY from env.
Query: ?shop=<uuid>&customer=<uuid>. Use the service-role client on the server only to load history, then call calculateBuyingPower.
Return ONLY { limitCents, level, reasons, demo: true }. No names, phones or sales data.
401 for a bad key, 400 for bad input, 429 after too many calls (use lib/rateLimit.ts once agent 5 adds it; for now leave a TODO comment).
Add a comment block explaining this is how a lender would buy our data (the revenue model).

Rules: follow 00_PROJECT_CONTEXT.md. Comment WHY in code. Stay inside this file's scope; put other-agent notes in docs/HANDOFF.md.
When done, explain this file to me in 5 lines and tell me how to justify it if a judge asks.
```

## You should see
curl without the key gives 401; with the key and a demo customer gives limit, level and reasons only.

## After it finishes
1. Run it, test it, read the diff. `git commit -m "<this file>"`.
2. If something is unclear, ask it: "Explain this file to me in 5 lines and how I justify it to a judge."
3. Paste its summary to Claude (chat) for review before the next prompt.

---

# Prompt 16: lib/supabase/client.ts and lib/supabase/server.ts
Agent: 4 Frontend  |  Read first: docs/ARCHITECTURE.md
Paste first: 00_PROJECT_CONTEXT.md

## Prompt (copy everything in the box)
```text
Write standard @supabase/ssr clients: browser client using only the anon key; server client reading cookies; a server-only admin client using the service role key
(import 'server-only' so it can never reach the browser). Comment which one is used where.

Rules: follow 00_PROJECT_CONTEXT.md. Comment WHY in code. Stay inside this file's scope; put other-agent notes in docs/HANDOFF.md.
When done, explain this file to me in 5 lines and tell me how to justify it if a judge asks.
```

## You should see
Importing the admin client in a client component fails the build (that is the safety check).

## After it finishes
1. Run it, test it, read the diff. `git commit -m "<this file>"`.
2. If something is unclear, ask it: "Explain this file to me in 5 lines and how I justify it to a judge."
3. Paste its summary to Claude (chat) for review before the next prompt.

---

# Prompt 17: lib/products.ts
Agent: 4 Frontend  |  Read first: docs/DESIGN_SPEC.md
Paste first: 00_PROJECT_CONTEXT.md + docs/DESIGN_SPEC.md + images in docs/design/

## Prompt (copy everything in the box)
```text
Write lib/products.ts: a demo catalogue of about 12 spaza items (maize meal 2.5kg R34.90, cooking oil 1L R42.90, sugar 2kg R27.90, bread, milk, rice, tea, salt, etc.)
with id, name, barcode, priceCents, image path. Label it demo. Add getProductByBarcode().

Rules: follow 00_PROJECT_CONTEXT.md. Comment WHY in code. Stay inside this file's scope; put other-agent notes in docs/HANDOFF.md.
When done, explain this file to me in 5 lines and tell me how to justify it if a judge asks.
```

## You should see
Scanning barcode 6009877543210 (from the design) resolves to a product; unknown barcodes return undefined.

## After it finishes
1. Run it, test it, read the diff. `git commit -m "<this file>"`.
2. If something is unclear, ask it: "Explain this file to me in 5 lines and how I justify it to a judge."
3. Paste its summary to Claude (chat) for review before the next prompt.

---

# Prompt 18: app/layout.tsx and components/DemoBanner.tsx
Agent: 4 Frontend  |  Read first: docs/DESIGN_SPEC.md
Paste first: 00_PROJECT_CONTEXT.md + docs/DESIGN_SPEC.md + images in docs/design/

## Prompt (copy everything in the box)
```text
Build the root layout: DM Sans, dark theme tokens, 390px mobile-first container, PWA meta tags (theme colour #111A1E, viewport).
DemoBanner shows "Demo data. Payments are simulated." at the bottom of main screens.

Rules: follow 00_PROJECT_CONTEXT.md. Comment WHY in code. Stay inside this file's scope; put other-agent notes in docs/HANDOFF.md.
When done, explain this file to me in 5 lines and tell me how to justify it if a judge asks.
```

## You should see
Every page has the dark theme and the banner; text is readable on a phone.

## After it finishes
1. Run it, test it, read the diff. `git commit -m "<this file>"`.
2. If something is unclear, ask it: "Explain this file to me in 5 lines and how I justify it to a judge."
3. Paste its summary to Claude (chat) for review before the next prompt.

---

# Prompt 19: app/page.tsx (splash, design 01)
Agent: 4 Frontend  |  Read first: docs/DESIGN_SPEC.md
Paste first: 00_PROJECT_CONTEXT.md + docs/DESIGN_SPEC.md + images in docs/design/

## Prompt (copy everything in the box)
```text
Build design 01 at '/'. Logged out: logo, tagline "The spaza tab, but with a record.", illustration (simple SVG), "Get started" and "I already have an account".
Logged in: redirect shop owners to /shop/sell and customers to /me.

Rules: follow 00_PROJECT_CONTEXT.md. Comment WHY in code. Stay inside this file's scope; put other-agent notes in docs/HANDOFF.md.
When done, explain this file to me in 5 lines and tell me how to justify it if a judge asks.
```

## You should see
Matches design 01. Redirects work for both roles.

## After it finishes
1. Run it, test it, read the diff. `git commit -m "<this file>"`.
2. If something is unclear, ask it: "Explain this file to me in 5 lines and how I justify it to a judge."
3. Paste its summary to Claude (chat) for review before the next prompt.

---

# Prompt 20: app/(auth)/login/page.tsx (design 02)
Agent: 4 Frontend  |  Read first: docs/DESIGN_SPEC.md, lib/supabase/client.ts
Paste first: 00_PROJECT_CONTEXT.md + docs/DESIGN_SPEC.md + images in docs/design/

## Prompt (copy everything in the box)
```text
Build login with email + password via Supabase Auth. Show clear errors (wrong password, unknown email) without revealing which part was wrong.
Hide 'Forgot your password?'. Redirect by role after login. Loading and error states.

Rules: follow 00_PROJECT_CONTEXT.md. Comment WHY in code. Stay inside this file's scope; put other-agent notes in docs/HANDOFF.md.
When done, explain this file to me in 5 lines and tell me how to justify it if a judge asks.
```

## You should see
A seeded judge account can log in and lands on the right screen.

## After it finishes
1. Run it, test it, read the diff. `git commit -m "<this file>"`.
2. If something is unclear, ask it: "Explain this file to me in 5 lines and how I justify it to a judge."
3. Paste its summary to Claude (chat) for review before the next prompt.

---

# Prompt 21: app/(auth)/signup/page.tsx (design 03)
Agent: 4 Frontend  |  Read first: docs/DESIGN_SPEC.md
Paste first: 00_PROJECT_CONTEXT.md + docs/DESIGN_SPEC.md + images in docs/design/

## Prompt (copy everything in the box)
```text
Build signup: role cards (shop owner or customer), then name + email + password. On success create the profile row with the chosen role.
A shop owner also creates their shop (name). Password minimum length 8. Never trust the role from the client without writing it server-side.

Rules: follow 00_PROJECT_CONTEXT.md. Comment WHY in code. Stay inside this file's scope; put other-agent notes in docs/HANDOFF.md.
When done, explain this file to me in 5 lines and tell me how to justify it if a judge asks.
```

## You should see
New accounts are created with the right role; the shop is created for owners.

## After it finishes
1. Run it, test it, read the diff. `git commit -m "<this file>"`.
2. If something is unclear, ask it: "Explain this file to me in 5 lines and how I justify it to a judge."
3. Paste its summary to Claude (chat) for review before the next prompt.

---

# Prompt 22: lib/actions/sales.ts
Agent: 4 Frontend  |  Read first: lib/validation.ts, lib/qr.ts, lib/buyingPower.ts, supabase/schema.sql
Paste first: 00_PROJECT_CONTEXT.md + docs/DESIGN_SPEC.md + images in docs/design/

## Prompt (copy everything in the box)
```text
Write server actions: createSale (recompute total from items on the server using lib/products; create a pending sale with token hash and 5-minute expiry; return the raw token once),
approveTab (checks the logged-in shop owner owns the shop, customer consent exists, amount <= calculated limit, PIN verified for phone customers, then records the tab with due_at),
payCash, demoPay (mark as paid, labelled simulated). Validate every input with zod. Never trust a client-supplied total, limit or shop id; derive them from the session and database.
Comment the security reason for each check.

Rules: follow 00_PROJECT_CONTEXT.md. Comment WHY in code. Stay inside this file's scope; put other-agent notes in docs/HANDOFF.md.
When done, explain this file to me in 5 lines and tell me how to justify it if a judge asks.
```

## You should see
A tab above the limit is rejected server-side even if I edit the request in dev tools.

## After it finishes
1. Run it, test it, read the diff. `git commit -m "<this file>"`.
2. If something is unclear, ask it: "Explain this file to me in 5 lines and how I justify it to a judge."
3. Paste its summary to Claude (chat) for review before the next prompt.

---

# Prompt 23: components/BarcodeScanner.tsx
Agent: 4 Frontend  |  Read first: lib/products.ts, docs/DESIGN_SPEC.md
Paste first: 00_PROJECT_CONTEXT.md + docs/DESIGN_SPEC.md + images in docs/design/

## Prompt (copy everything in the box)
```text
Build the scanner with html5-qrcode (design 05): teal corner frame, torch toggle if supported, text 'Hold steady and keep the barcode in view.'
Calls onScan(barcode). If camera permission is denied or unsupported, show a friendly message and a button to add items manually instead.

Rules: follow 00_PROJECT_CONTEXT.md. Comment WHY in code. Stay inside this file's scope; put other-agent notes in docs/HANDOFF.md.
When done, explain this file to me in 5 lines and tell me how to justify it if a judge asks.
```

## You should see
Works on a real phone over HTTPS; denied camera shows the manual fallback instead of crashing.

## After it finishes
1. Run it, test it, read the diff. `git commit -m "<this file>"`.
2. If something is unclear, ask it: "Explain this file to me in 5 lines and how I justify it to a judge."
3. Paste its summary to Claude (chat) for review before the next prompt.

---

# Prompt 24: components/Cart.tsx
Agent: 4 Frontend  |  Read first: lib/money.ts, docs/DESIGN_SPEC.md
Paste first: 00_PROJECT_CONTEXT.md + docs/DESIGN_SPEC.md + images in docs/design/

## Prompt (copy everything in the box)
```text
Build the cart (design 06): product image, name, price, quantity stepper (min 1, max 99), delete, total, big 'Charge customer' button (44px+).
Keep cart state local; send only productId + qty to the server.

Rules: follow 00_PROJECT_CONTEXT.md. Comment WHY in code. Stay inside this file's scope; put other-agent notes in docs/HANDOFF.md.
When done, explain this file to me in 5 lines and tell me how to justify it if a judge asks.
```

## You should see
Quantity changes update the total instantly; the server later recomputes it anyway.

## After it finishes
1. Run it, test it, read the diff. `git commit -m "<this file>"`.
2. If something is unclear, ask it: "Explain this file to me in 5 lines and how I justify it to a judge."
3. Paste its summary to Claude (chat) for review before the next prompt.

---

# Prompt 25: app/shop/sell/page.tsx (design 04)
Agent: 4 Frontend  |  Read first: components/BarcodeScanner.tsx, components/Cart.tsx, lib/actions/sales.ts
Paste first: 00_PROJECT_CONTEXT.md + docs/DESIGN_SPEC.md + images in docs/design/

## Prompt (copy everything in the box)
```text
Build the Sell screen: shop name and 'Shop Owner', scan card with 'Tap to scan', 'Or add item manually' list, cart, and bottom nav (Home, Sales, Customers, More).
Tabs are role-based: shop owner sees Sell and Ledger only. 'Charge customer' calls createSale then shows the QR screen. Loading, empty and error states.

Rules: follow 00_PROJECT_CONTEXT.md. Comment WHY in code. Stay inside this file's scope; put other-agent notes in docs/HANDOFF.md.
When done, explain this file to me in 5 lines and tell me how to justify it if a judge asks.
```

## You should see
I can scan or manually add 3 items and charge; a QR screen appears.

## After it finishes
1. Run it, test it, read the diff. `git commit -m "<this file>"`.
2. If something is unclear, ask it: "Explain this file to me in 5 lines and how I justify it to a judge."
3. Paste its summary to Claude (chat) for review before the next prompt.

---

# Prompt 26: components/SaleQr.tsx (design 07)
Agent: 4 Frontend  |  Read first: lib/qr.ts
Paste first: 00_PROJECT_CONTEXT.md + docs/DESIGN_SPEC.md + images in docs/design/

## Prompt (copy everything in the box)
```text
Build the QR view: amount, 'Expires in mm:ss' countdown, QR (qrcode.react) of the pay link, short token chip with copy, and the warning
'This link is for one-time use only. It will expire in 5 minutes.' When the countdown hits zero, show 'expired' and a button to create a new sale link.
Never display the full secret token as text.

Rules: follow 00_PROJECT_CONTEXT.md. Comment WHY in code. Stay inside this file's scope; put other-agent notes in docs/HANDOFF.md.
When done, explain this file to me in 5 lines and tell me how to justify it if a judge asks.
```

## You should see
Countdown runs; at 0 the QR is replaced with an expired state.

## After it finishes
1. Run it, test it, read the diff. `git commit -m "<this file>"`.
2. If something is unclear, ask it: "Explain this file to me in 5 lines and how I justify it to a judge."
3. Paste its summary to Claude (chat) for review before the next prompt.

---

# Prompt 27: app/pay/[token]/page.tsx (designs 08, 09)
Agent: 4 Frontend  |  Read first: lib/qr.ts, lib/buyingPower.ts, lib/actions/sales.ts
Paste first: 00_PROJECT_CONTEXT.md + docs/DESIGN_SPEC.md + images in docs/design/

## Prompt (copy everything in the box)
```text
Build the customer Pay screen. Look up the sale by token hash. Show total due, available buying power with level and next level,
'You can put on tab' = min(total, limit), 'Remainder to pay now' = total - tab, buttons 'Demo card / wallet' and 'Cash', and the footnote 'Payments are simulated in this demo.'
Expired, used and invalid tokens all show the same friendly 'This payment link has expired' screen (design 09), without saying which. Customer must be logged in.

Rules: follow 00_PROJECT_CONTEXT.md. Comment WHY in code. Stay inside this file's scope; put other-agent notes in docs/HANDOFF.md.
When done, explain this file to me in 5 lines and tell me how to justify it if a judge asks.
```

## You should see
Open the QR link on a second phone: amounts are correct, tab is capped at the limit, a reused link shows the expired screen.

## After it finishes
1. Run it, test it, read the diff. `git commit -m "<this file>"`.
2. If something is unclear, ask it: "Explain this file to me in 5 lines and how I justify it to a judge."
3. Paste its summary to Claude (chat) for review before the next prompt.

---

# Prompt 28: lib/actions/customers.ts
Agent: 4 Frontend  |  Read first: lib/validation.ts, lib/pin.ts
Paste first: 00_PROJECT_CONTEXT.md + docs/DESIGN_SPEC.md + images in docs/design/

## Prompt (copy everything in the box)
```text
Write server actions addCustomer(name, phone, consent) and setCustomerPin(pin). Require consent=true and write consent_at.
Hash the PIN with lib/pin.ts. Only the shop owner of that shop can add customers. Duplicate phone in the same shop returns a friendly error.
Add verifyCustomerPin(shopCustomerId, pin) enforcing the 5-try lockout via the service role (never expose pin_hash to the client).

Rules: follow 00_PROJECT_CONTEXT.md. Comment WHY in code. Stay inside this file's scope; put other-agent notes in docs/HANDOFF.md.
When done, explain this file to me in 5 lines and tell me how to justify it if a judge asks.
```

## You should see
Adding a customer without the consent tick fails on the server; 5 wrong PINs lock the customer.

## After it finishes
1. Run it, test it, read the diff. `git commit -m "<this file>"`.
2. If something is unclear, ask it: "Explain this file to me in 5 lines and how I justify it to a judge."
3. Paste its summary to Claude (chat) for review before the next prompt.

---

# Prompt 29: app/shop/customers/new/page.tsx and PIN approval (designs 12, 13)
Agent: 4 Frontend  |  Read first: lib/actions/customers.ts, docs/DESIGN_SPEC.md
Paste first: 00_PROJECT_CONTEXT.md + docs/DESIGN_SPEC.md + images in docs/design/

## Prompt (copy everything in the box)
```text
Build 'Add New Customer': full name, phone, POPIA consent checkbox with the exact text from the design, 'Next' disabled until ticked, then the customer sets a 4-digit PIN on this phone.
Also build the PIN approval screen (design 13): four dots, numeric keypad, backspace, used when charging a tab to a phone-only customer. Show lockout messages clearly. Never show or log the PIN.

Rules: follow 00_PROJECT_CONTEXT.md. Comment WHY in code. Stay inside this file's scope; put other-agent notes in docs/HANDOFF.md.
When done, explain this file to me in 5 lines and tell me how to justify it if a judge asks.
```

## You should see
Add Thabo-like customer, set a PIN, then approve a tab with the PIN; a wrong PIN shows an error.

## After it finishes
1. Run it, test it, read the diff. `git commit -m "<this file>"`.
2. If something is unclear, ask it: "Explain this file to me in 5 lines and how I justify it to a judge."
3. Paste its summary to Claude (chat) for review before the next prompt.

---

# Prompt 30: app/me/page.tsx, components/LimitMeter.tsx, components/WhyLimit.tsx (design 10)
Agent: 4 Frontend  |  Read first: lib/buyingPower.ts, lib/forecast.ts
Paste first: 00_PROJECT_CONTEXT.md + docs/DESIGN_SPEC.md + images in docs/design/

## Prompt (copy everything in the box)
```text
Build the customer Buying Power screen: ring gauge with current limit and level, next-level card with progress, 'Why this limit?' reasons from explainLimit(),
and the forecast card from likelyToNeedTab() ('You may need a tab around month end'). All numbers come from the backend; hide the forecast card when likely=false.

Rules: follow 00_PROJECT_CONTEXT.md. Comment WHY in code. Stay inside this file's scope; put other-agent notes in docs/HANDOFF.md.
When done, explain this file to me in 5 lines and tell me how to justify it if a judge asks.
```

## You should see
Seeded customers show different limits and different reasons.

## After it finishes
1. Run it, test it, read the diff. `git commit -m "<this file>"`.
2. If something is unclear, ask it: "Explain this file to me in 5 lines and how I justify it to a judge."
3. Paste its summary to Claude (chat) for review before the next prompt.

---

# Prompt 31: lib/actions/tabs.ts
Agent: 4 Frontend  |  Read first: supabase/schema.sql, lib/validation.ts
Paste first: 00_PROJECT_CONTEXT.md + docs/DESIGN_SPEC.md + images in docs/design/

## Prompt (copy everything in the box)
```text
Write repayTab(saleId, amountCents): shop owner only, owns the shop, amount > 0 and <= owed. Compare paid_at with due_at to set on_time.
Update sale status to repaid when fully paid. After repaying, return the updated buying power so the UI can show the change.

Rules: follow 00_PROJECT_CONTEXT.md. Comment WHY in code. Stay inside this file's scope; put other-agent notes in docs/HANDOFF.md.
When done, explain this file to me in 5 lines and tell me how to justify it if a judge asks.
```

## You should see
Repaying on time raises the score; repaying late records on_time=false.

## After it finishes
1. Run it, test it, read the diff. `git commit -m "<this file>"`.
2. If something is unclear, ask it: "Explain this file to me in 5 lines and how I justify it to a judge."
3. Paste its summary to Claude (chat) for review before the next prompt.

---

# Prompt 32: app/shop/ledger/page.tsx, components/CustomerRow.tsx (designs 11, 14)
Agent: 4 Frontend  |  Read first: lib/actions/tabs.ts, lib/buyingPower.ts
Paste first: 00_PROJECT_CONTEXT.md + docs/DESIGN_SPEC.md + images in docs/design/

## Prompt (copy everything in the box)
```text
Build the Ledger: today's takings and tabs owed (computed from the database), tabs Customers / Transactions, customer rows with limit and owed
(amber when owed, teal at zero, red with a 'Late' chip when overdue), '+ New sale' button. Row tap opens customer detail with a 'Mark repaid' flow that ends on the
'Payment recorded' screen (design 14) with 'on time' or 'late'.

Rules: follow 00_PROJECT_CONTEXT.md. Comment WHY in code. Stay inside this file's scope; put other-agent notes in docs/HANDOFF.md.
When done, explain this file to me in 5 lines and tell me how to justify it if a judge asks.
```

## You should see
Numbers match the seed data; marking a tab repaid updates owed and the limit.

## After it finishes
1. Run it, test it, read the diff. `git commit -m "<this file>"`.
2. If something is unclear, ask it: "Explain this file to me in 5 lines and how I justify it to a judge."
3. Paste its summary to Claude (chat) for review before the next prompt.

---

# Prompt 33: middleware.ts
Agent: 5 Security  |  Read first: docs/ARCHITECTURE.md
Paste first: 00_PROJECT_CONTEXT.md

## Prompt (copy everything in the box)
```text
Write middleware.ts: require login for /shop/*, /me and /pay/*; shop pages require role shop_owner; /me requires customer.
Add security headers: Content-Security-Policy (allow self, Supabase URL, camera via Permissions-Policy), X-Content-Type-Options nosniff, Referrer-Policy, Permissions-Policy (camera=(self)), frame-ancestors none.
Explain each header in a comment.

Rules: follow 00_PROJECT_CONTEXT.md. Comment WHY in code. Stay inside this file's scope; put other-agent notes in docs/HANDOFF.md.
When done, explain this file to me in 5 lines and tell me how to justify it if a judge asks.
```

## You should see
Visiting /shop/ledger logged out redirects to login; securityheaders-style check shows the headers.

## After it finishes
1. Run it, test it, read the diff. `git commit -m "<this file>"`.
2. If something is unclear, ask it: "Explain this file to me in 5 lines and how I justify it to a judge."
3. Paste its summary to Claude (chat) for review before the next prompt.

---

# Prompt 34: lib/rateLimit.ts
Agent: 5 Security  |  Read first: app/api/v1/buying-power/route.ts
Paste first: 00_PROJECT_CONTEXT.md

## Prompt (copy everything in the box)
```text
Write lib/rateLimit.ts: a small in-memory limiter (fixed window) keyed by IP+route for login, PIN attempts and the lender API.
Comment clearly that in-memory is for the demo and production needs a shared store (for example Upstash Redis). Wire it into those three places.

Rules: follow 00_PROJECT_CONTEXT.md. Comment WHY in code. Stay inside this file's scope; put other-agent notes in docs/HANDOFF.md.
When done, explain this file to me in 5 lines and tell me how to justify it if a judge asks.
```

## You should see
Hammering the lender endpoint returns 429 after the limit.

## After it finishes
1. Run it, test it, read the diff. `git commit -m "<this file>"`.
2. If something is unclear, ask it: "Explain this file to me in 5 lines and how I justify it to a judge."
3. Paste its summary to Claude (chat) for review before the next prompt.

---

# Prompt 35: tests/security.test.ts
Agent: 5 Security  |  Read first: everything
Paste first: 00_PROJECT_CONTEXT.md

## Prompt (copy everything in the box)
```text
Write security checks (vitest or a documented script): cross-shop read (IDOR), customer reading another customer's sales, PIN lockout, QR reuse and expiry,
tab above limit rejected on the server, client-supplied total ignored, SQL/script injection strings in text fields, extra fields rejected,
lender API without key returns 401, error messages do not leak stack traces or table names.

Rules: follow 00_PROJECT_CONTEXT.md. Comment WHY in code. Stay inside this file's scope; put other-agent notes in docs/HANDOFF.md.
When done, explain this file to me in 5 lines and tell me how to justify it if a judge asks.
```

## You should see
All checks pass or each failure is listed with a fix.

## After it finishes
1. Run it, test it, read the diff. `git commit -m "<this file>"`.
2. If something is unclear, ask it: "Explain this file to me in 5 lines and how I justify it to a judge."
3. Paste its summary to Claude (chat) for review before the next prompt.

---

# Prompt 36: docs/SECURITY_REVIEW.md
Agent: 5 Security  |  Read first: everything + my submitted SSDLC text
Paste first: 00_PROJECT_CONTEXT.md

## Prompt (copy everything in the box)
```text
Write docs/SECURITY_REVIEW.md: a table of check, how tested, result, fix. Include npm audit output summary, a secrets scan (keys in code, .env in git history),
headers observed, and flagged dependencies.
Then compare every sentence of my submitted SSDLC (I will paste it below) with reality: label each TRUE, FALSE or NOT BUILT and give exact replacement wording I should paste into Sonke.
Check first: the SSDLC says accounts use a verified phone number, but the MVP uses email + password.
SSDLC TEXT: (paste it here)

Rules: follow 00_PROJECT_CONTEXT.md. Comment WHY in code. Stay inside this file's scope; put other-agent notes in docs/HANDOFF.md.
When done, explain this file to me in 5 lines and tell me how to justify it if a judge asks.
```

## You should see
I have copy-paste replacement wording for any SSDLC sentence that is not true.

## After it finishes
1. Run it, test it, read the diff. `git commit -m "<this file>"`.
2. If something is unclear, ask it: "Explain this file to me in 5 lines and how I justify it to a judge."
3. Paste its summary to Claude (chat) for review before the next prompt.

---

# Prompt 37: .env.example
Agent: 6 Release  |  Read first: docs/ARCHITECTURE.md
Paste first: 00_PROJECT_CONTEXT.md

## Prompt (copy everything in the box)
```text
Create .env.example with variable NAMES only and a one-line comment each: NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY,
SUPABASE_SERVICE_ROLE_KEY (server only, never public), LENDER_API_KEY, NEXT_PUBLIC_APP_URL. No real values. Confirm .env.local is gitignored.

Rules: follow 00_PROJECT_CONTEXT.md. Comment WHY in code. Stay inside this file's scope; put other-agent notes in docs/HANDOFF.md.
When done, explain this file to me in 5 lines and tell me how to justify it if a judge asks.
```

## You should see
No secret appears anywhere in the repo.

## After it finishes
1. Run it, test it, read the diff. `git commit -m "<this file>"`.
2. If something is unclear, ask it: "Explain this file to me in 5 lines and how I justify it to a judge."
3. Paste its summary to Claude (chat) for review before the next prompt.

---

# Prompt 38: public/manifest.webmanifest and public/icons/
Agent: 6 Release  |  Read first: docs/DESIGN_SPEC.md
Paste first: 00_PROJECT_CONTEXT.md

## Prompt (copy everything in the box)
```text
Create the PWA manifest (name tapUP, short_name tapUP, theme and background #111A1E, display standalone, start_url /, icons 192 and 512).
Generate simple icons from the tapUP wordmark (teal on dark). Link the manifest in the layout.

Rules: follow 00_PROJECT_CONTEXT.md. Comment WHY in code. Stay inside this file's scope; put other-agent notes in docs/HANDOFF.md.
When done, explain this file to me in 5 lines and tell me how to justify it if a judge asks.
```

## You should see
Chrome on Android offers 'Install app'.

## After it finishes
1. Run it, test it, read the diff. `git commit -m "<this file>"`.
2. If something is unclear, ask it: "Explain this file to me in 5 lines and how I justify it to a judge."
3. Paste its summary to Claude (chat) for review before the next prompt.

---

# Prompt 39: app/api/health/route.ts
Agent: 6 Release  |  Read first: lib/supabase/server.ts
Paste first: 00_PROJECT_CONTEXT.md

## Prompt (copy everything in the box)
```text
Write a health route returning { ok: true } and verifying the database responds with a cheap query. No data in the response.

Rules: follow 00_PROJECT_CONTEXT.md. Comment WHY in code. Stay inside this file's scope; put other-agent notes in docs/HANDOFF.md.
When done, explain this file to me in 5 lines and tell me how to justify it if a judge asks.
```

## You should see
/api/health returns ok on the deployed site.

## After it finishes
1. Run it, test it, read the diff. `git commit -m "<this file>"`.
2. If something is unclear, ask it: "Explain this file to me in 5 lines and how I justify it to a judge."
3. Paste its summary to Claude (chat) for review before the next prompt.

---

# Prompt 40: (deployment) Supabase + Vercel steps
Agent: 6 Release  |  Read first: README.md
Paste first: 00_PROJECT_CONTEXT.md

## Prompt (copy everything in the box)
```text
Give me exact numbered steps: create the Supabase project, run schema.sql, rls.sql, seed.sql, create the two judge auth users (shop owner and customer) and link them,
copy env vars into Vercel (service role key marked server-only), deploy, set Supabase Auth redirect URLs to the Vercel domain, then verify with /api/health.
Tell me which plan to use (free for the hackathon) and what each key is for. Stop and ask if any step needs something I may not have.

Rules: follow 00_PROJECT_CONTEXT.md. Comment WHY in code. Stay inside this file's scope; put other-agent notes in docs/HANDOFF.md.
When done, explain this file to me in 5 lines and tell me how to justify it if a judge asks.
```

## You should see
The live URL loads; a judge login works from a private window.

## After it finishes
1. Run it, test it, read the diff. `git commit -m "<this file>"`.
2. If something is unclear, ask it: "Explain this file to me in 5 lines and how I justify it to a judge."
3. Paste its summary to Claude (chat) for review before the next prompt.

---

# Prompt 41: README.md (project root)
Agent: 6 Release  |  Read first: everything
Paste first: 00_PROJECT_CONTEXT.md

## Prompt (copy everything in the box)
```text
Write the project README: what tapUP is (3 lines), live URL, demo logins (shop owner and customer), what is SIMULATED (payments, SMS), how to run locally,
tech stack, honest limitations, link to docs. No secrets. Keep it under one screen.

Rules: follow 00_PROJECT_CONTEXT.md. Comment WHY in code. Stay inside this file's scope; put other-agent notes in docs/HANDOFF.md.
When done, explain this file to me in 5 lines and tell me how to justify it if a judge asks.
```

## You should see
A stranger can run it locally from the README alone.

## After it finishes
1. Run it, test it, read the diff. `git commit -m "<this file>"`.
2. If something is unclear, ask it: "Explain this file to me in 5 lines and how I justify it to a judge."
3. Paste its summary to Claude (chat) for review before the next prompt.

---

# Prompt 42: scripts/smoke-test.md
Agent: 6 Release  |  Read first: everything
Paste first: 00_PROJECT_CONTEXT.md

## Prompt (copy everything in the box)
```text
Write a 10-step manual test of the happy path (login as shop owner, add 3 items, charge, show QR, customer logs in on another device and approves a tab, repay on time, buying power rises, ledger updates, lender API call)
with the expected result per step. Add failure cases: camera denied, expired QR, tab above limit, wrong PIN five times.

Rules: follow 00_PROJECT_CONTEXT.md. Comment WHY in code. Stay inside this file's scope; put other-agent notes in docs/HANDOFF.md.
When done, explain this file to me in 5 lines and tell me how to justify it if a judge asks.
```

## You should see
I run it on my phone and every step passes.

## After it finishes
1. Run it, test it, read the diff. `git commit -m "<this file>"`.
2. If something is unclear, ask it: "Explain this file to me in 5 lines and how I justify it to a judge."
3. Paste its summary to Claude (chat) for review before the next prompt.

---

# Prompt 43: docs/DEMO_SCRIPT.md
Agent: 6 Release  |  Read first: everything
Paste first: 00_PROJECT_CONTEXT.md

## Prompt (copy everything in the box)
```text
Write a 90-second demo video script with a shot list and timings: problem in 10s (founder story, over R1,000 a month at spazas), sell a basket,
customer scans the QR, tab approved, repayment, buying power rises, forecast line, lender API in one shot, business model and ask in the last 10s.
State clearly on screen that payments are simulated. Include the exact words to say and what is on screen for each shot.

Rules: follow 00_PROJECT_CONTEXT.md. Comment WHY in code. Stay inside this file's scope; put other-agent notes in docs/HANDOFF.md.
When done, explain this file to me in 5 lines and tell me how to justify it if a judge asks.
```

## You should see
Reading it aloud takes about 85-90 seconds.

## After it finishes
1. Run it, test it, read the diff. `git commit -m "<this file>"`.
2. If something is unclear, ask it: "Explain this file to me in 5 lines and how I justify it to a judge."
3. Paste its summary to Claude (chat) for review before the next prompt.

---

# Prompt 44: docs/DECK.md
Agent: 6 Release  |  Read first: everything
Paste first: 00_PROJECT_CONTEXT.md

## Prompt (copy everything in the box)
```text
Write content for 10 slides, each with a title, 3-4 bullets and the screenshot to take: 1 title and one-liner; 2 problem and evidence (survey of 7 + FinScope via OECD + BFA, with sources);
3 solution and features; 4 live demo link and judge logins; 5 user journey story; 6 intelligence (scoring and forecast); 7 architecture and security;
8 business model and pricing in rands (mark estimates); 9 roadmap (Stitch payments, USSD/SMS, cross-shop credit, lender pilots); 10 team and ask.
Use ONLY claims in section 2 of 00_PROJECT_CONTEXT.md.

Rules: follow 00_PROJECT_CONTEXT.md. Comment WHY in code. Stay inside this file's scope; put other-agent notes in docs/HANDOFF.md.
When done, explain this file to me in 5 lines and tell me how to justify it if a judge asks.
```

## You should see
Every claim traces back to the context file; the demo login and live URL are on slide 4.

## After it finishes
1. Run it, test it, read the diff. `git commit -m "<this file>"`.
2. If something is unclear, ask it: "Explain this file to me in 5 lines and how I justify it to a judge."
3. Paste its summary to Claude (chat) for review before the next prompt.

---
