# Prompt 04: supabase/rls.sql
Agent: 2 Database  |  Read first: supabase/schema.sql
Paste first: 00_PROJECT_CONTEXT.md

## Prompt (copy everything in the box)
```text
Write supabase/rls.sql. Enable row level security on EVERY table.
Policies: a shop owner reads/writes only rows for shops they own; a customer reads only their own shop_customers and sales rows;
pin_hash, qr_token_hash, failed_pin_attempts and locked_until must NOT be readable from the client at all
(use a safe view or column privileges and explain the choice in a comment).
The lender API and PIN checks use the service role on the server only. Comment each policy with the attack it prevents.
Then explain to me in plain words what RLS is and why it is safer than checking permissions only in app code.

Rules: follow 00_PROJECT_CONTEXT.md. Comment WHY in code. Stay inside this file's scope; put other-agent notes in docs/HANDOFF.md.
When done, explain this file to me in 5 lines and tell me how to justify it if a judge asks.
```

## You should see
Run it after schema.sql with no errors. Table Editor shows RLS enabled on all tables.

## After it finishes
1. Run it, test it, read the diff. `git commit -m "<this file>"`.
2. If something is unclear, ask it: "Explain this file to me in 5 lines and how I justify it to a judge."
3. Paste its summary to Claude (chat) for review before the next prompt.
