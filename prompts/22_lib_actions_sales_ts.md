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
