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
