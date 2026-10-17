# Prompt 13: tests/buyingPower.test.ts and tests/forecast.test.ts
Agent: 3 Scoring  |  Read first: lib/buyingPower.ts, lib/forecast.ts
Paste first: 00_PROJECT_CONTEXT.md

## Prompt (copy everything in the box)
```text
Write vitest tests covering: brand-new customer; cash-only customer (weighted at 50%); weekly shopper with all tabs repaid on time;
one late repayment lowers the score; two late repayments cap level at 1; limit never above R300; R50-step boundaries;
forecast with clear month-end pattern; forecast with no history. Use readable test names.

Also add tests using the seed histories: Thabo (frequent, always on time) must score higher than Nomsa (one late), who must score higher than Sipho (overdue unpaid tab); the new customer must be R0. Add a test that the same customer's score rises after their first on-time repayment.

Rules: follow 00_PROJECT_CONTEXT.md. Comment WHY in code. Stay inside this file's scope; put other-agent notes in docs/HANDOFF.md.
When done, explain this file to me in 5 lines and tell me how to justify it if a judge asks.
```

## You should see
npm test passes. Failing tests tell you which rule is wrong.

## After it finishes
1. Run it, test it, read the diff. `git commit -m "<this file>"`.
2. If something is unclear, ask it: "Explain this file to me in 5 lines and how I justify it to a judge."
3. Paste its summary to Claude (chat) for review before the next prompt.
