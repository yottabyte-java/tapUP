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
