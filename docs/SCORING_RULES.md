# Buying-power contract

This records the existing `lib/buyingPower.ts` behavior. `approve_tab_atomic` mirrors it
under a customer row lock; the database remains authoritative for approval. The fix adds
its missing R50 floor for customers with multiple completed purchases and low scores.

- Scope: one shop/customer, rolling 30 days ending at the calculation time, inclusive.
  Completed purchases are `approved`, `paid`, or `repaid`; frequency uses distinct UTC dates.
- Cash spend is halved and rounded down per sale/portion. For split tabs, the tab portion
  and simulated-card portion count fully. A cash-only day contributes half a day; a day
  with any non-cash purchase contributes one day.
- Frequency points: 0 days → 0; 0.5 → 5; 1–3 → 10; 3.5–7 → 20;
  7.5–14 → 30; above 14 → 40.
- Weekly spend is weighted 30-day spend × 7 / 30, rounded to the nearest cent (half up).
  Below R100 → 0 points; R100–249.99 → 10; R250–499.99 → 20; R500+ → 30.
- Repayment points: 15 with no settled tabs having a repayment in the window. Otherwise,
  round 30 × the fraction of those settled tabs whose in-window repayments are all on time.
  Deduct 5 points for each late repayment event in the window, including installments.
- Clamp the score to 0–100. With exactly one completed purchase in the window, cap it at 19.

| Minimum score | Band limit |
|---|---|
| 0 | R0 |
| 10 | R50 |
| 20 | R100 |
| 35 | R150 |
| 50 | R200 |
| 65 | R250 |
| 80 | R300 |

Apply these overrides in order:

1. No completed purchases in the window: R0. Exactly one: R50.
2. Multiple completed purchases: at least R50, even if late penalties put the score below 10.
3. Two or more late repayment events in the window: cap at R50.
4. Any approved, overdue, unpaid tab (including older tabs): R0.

Limits stay in R50 increments and never exceed R300. Approval subtracts all outstanding
approved tab balances from that limit; a displayed limit is not an approval or available balance.

## Customer forecast

The `/me` forecast is a deterministic estimate, not an AI score or credit decision. It sums
completed purchase totals in the rolling 28-day window and divides by four, rounding to the
nearest cent. The screen shows the estimate only after at least one completed purchase appears
in each of the four rolling seven-day age bands. Pending, cancelled and expired requests are
excluded. The month-end tab insight uses completed tab purchases in the rolling 30-day window
and flags a prior tab during the last five or first three UTC calendar days of a month. Otherwise
it reports a possible tab need only when forecast spend is at least 150% of the observed weekly
cash average. These rules describe recorded behavior; they do not guarantee future spending or
repayment.

## Verification and deployment

`npm test` includes receipt, owner action, and low-score regression tests. To run real SQL parity
and approval tests in a task-owned PostgreSQL 17 container, set `DOCKER_HOST` to its Unix socket
and `TAPUP_TEST_POSTGRES_CONTAINER` to its name, then run
`npx vitest run tests/buyingPowerParity.test.ts`. Each run creates a new database and rolls back
its synthetic cases. It installs the real schema/RLS with an Auth stub; it does not test
PostgREST, GoTrue, OTP delivery, or a live Supabase installation.

For an existing installation apply
`supabase/migrations/202610250001_align_buying_power_floor.sql` through the normal deployment
process. It replaces the existing RPC body and preserves its service-role-only execution.
New installations use `supabase/schema.sql`. No tables or customer data are reset.

Daily takings use `paid_now_confirmed_at` and repayment `paid_at` in Africa/Johannesburg,
regardless of the sale's later status. Tab rejection uses the existing cancellation transition
and preserves confirmed receipts. Refund/reversal records are not supported by the current model;
rejecting a tab does not represent a refund.
