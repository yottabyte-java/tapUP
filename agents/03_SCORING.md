# Agent 3: Core logic and scoring (the "Intelligence" criterion)
<!-- WHY pure functions: no database, easy to test, easy to explain to judges, easy to retune. -->
Role: TypeScript logic, tests and ONE API route. No UI, no SQL changes.
Read first: 00_PROJECT_CONTEXT.md, docs/ARCHITECTURE.md, supabase/schema.sql, docs/HANDOFF.md

## Prompt per file

### FILE: lib/money.ts
Integer-cents helpers: toCents(rand), formatRand(cents) -> "R171.90", add/sub safe functions.
Never use floating point for money. Comment why.

### FILE: lib/buyingPower.ts
Export calculateBuyingPower(history, now) -> { limitCents, level, score, reasons[] }.
history = the customer's sales and repayments at ONE shop for the last 30 days.
Starter rules (I will tune them):
- Frequency: 0-40 points from the number of purchase days in the last 30 days.
- Spend: 0-30 points from average weekly spend.
- Repayment: 0-30 points from the share of tabs repaid on time. No tabs yet = neutral 15.
- Cash purchases count at 50% weight (easier to fake than digital).
- A late repayment removes points; two or more late repayments in 30 days cap the level at 1.
Limit tiers in R50 steps (see DESIGN_SPEC conflicts; confirm with me): 0-9 -> R0; 10-19 -> R50; 20-34 -> R100; 35-49 -> R150; 50-64 -> R200; 65-79 -> R250; 80+ -> R300.
MVP cap R300. Levels 0-6. Also return pointsToNextLevel and nextLimitCents.
Export explainLimit(result) -> array of plain-English strings, e.g. "14 purchases in 30 days",
"R512 average weekly spend", "3 of 3 tabs repaid on time". No jargon.
Comment every rule with WHY (so I can defend it to a judge).

### FILE: lib/forecast.ts
Export forecastNextWeekSpend(history) using a simple moving average of the last 4 weeks, and
likelyToNeedTab(history, forecast) -> boolean + reason string (true when forecast spend is above
the customer's usual cash pattern or when they usually buy near month end). Keep it simple and
explainable. No machine learning. This is the "app that thinks and predicts" feature.

### FILE: lib/pin.ts
hashPin(pin), verifyPin(pin, hash) using argon2 or bcrypt (tell me which and why).
Lockout helpers: after 5 wrong tries lock for 15 minutes. Never log or return a PIN or hash.

### FILE: lib/qr.ts
createSaleToken() -> { token, hash, expiresAt } (random, 128-bit, expires in 5 minutes (matches design 07));
verifySaleToken(token, storedHash, expiresAt, usedAt). Single use. Store only the hash.

### FILE: lib/validation.ts
zod schemas for: createSale, approveTab, payCash, addCustomer (phone format, name length, PIN
4 digits, consent boolean must be true), repayTab, and the lender API query. Reject extra fields.

### FILE: app/api/v1/buying-power/route.ts
GET with header x-api-key (compare in constant time against LENDER_API_KEY from env) and query
?shop=...&customer=... Returns ONLY { limitCents, level, reasons } and a "demo": true flag.
No names, phones or sales. 401 on bad key, 400 on bad input, 429 after too many calls. Comment why.

### FILES: tests/buyingPower.test.ts, forecast.test.ts, qr.test.ts (vitest)
Cases: brand-new customer; cash-only customer; weekly shopper with all tabs repaid on time;
one late repayment; two late repayments cap; limit never exceeds R300; expired QR rejected;
reused QR rejected; wrong PIN lockout after 5 tries.

## Done when
All tests pass, and I can read each rule and explain it in one sentence.
End with: files created, how I run the tests, the exact rule numbers you want me to confirm.
