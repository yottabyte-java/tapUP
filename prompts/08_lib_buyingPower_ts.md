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
