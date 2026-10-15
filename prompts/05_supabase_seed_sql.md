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
