# Prompt 31: lib/actions/tabs.ts
Agent: 4 Frontend  |  Read first: supabase/schema.sql, lib/validation.ts
Paste first: 00_PROJECT_CONTEXT.md + docs/DESIGN_SPEC.md + images in docs/design/

## Prompt (copy everything in the box)
```text
Write repayTab(saleId, amountCents): shop owner only, owns the shop, amount > 0 and <= owed. Compare paid_at with due_at to set on_time.
Update sale status to repaid when fully paid. After repaying, return the updated buying power so the UI can show the change.

Rules: follow 00_PROJECT_CONTEXT.md. Comment WHY in code. Stay inside this file's scope; put other-agent notes in docs/HANDOFF.md.
When done, explain this file to me in 5 lines and tell me how to justify it if a judge asks.
```

## You should see
Repaying on time raises the score; repaying late records on_time=false.

## After it finishes
1. Run it, test it, read the diff. `git commit -m "<this file>"`.
2. If something is unclear, ask it: "Explain this file to me in 5 lines and how I justify it to a judge."
3. Paste its summary to Claude (chat) for review before the next prompt.
