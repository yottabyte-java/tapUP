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
Load history with the service-role client only on the server. Return the demo flag "demo": true. If the customer or shop is not found, return 404 with a generic message and do not say which one was missing. Add a test for the 401, 400 and 404 cases that does not need a live database (mock the data layer).

Rules: follow 00_PROJECT_CONTEXT.md. Comment WHY in code. Stay inside this file's scope; put other-agent notes in docs/HANDOFF.md.
When done, explain this file to me in 5 lines and tell me how to justify it if a judge asks.
```

## You should see
curl without the key gives 401; with the key and a demo customer gives limit, level and reasons only.

## After it finishes
1. Run it, test it, read the diff. `git commit -m "<this file>"`.
2. If something is unclear, ask it: "Explain this file to me in 5 lines and how I justify it to a judge."
3. Paste its summary to Claude (chat) for review before the next prompt.
