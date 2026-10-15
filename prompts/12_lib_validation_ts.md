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
