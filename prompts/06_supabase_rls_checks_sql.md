# Prompt 06: supabase/rls-checks.sql
Agent: 2 Database  |  Read first: supabase/rls.sql, supabase/seed.sql
Paste first: 00_PROJECT_CONTEXT.md

## Prompt (copy everything in the box)
```text
Write supabase/rls-checks.sql with 3 queries I can run as different users proving: (1) shop A cannot read shop B's customers or sales;
(2) one customer cannot read another customer's sales; (3) pin_hash is not readable by the client role.
For each, say what output means PASS and what means FAIL.

Rules: follow 00_PROJECT_CONTEXT.md. Comment WHY in code. Stay inside this file's scope; put other-agent notes in docs/HANDOFF.md.
When done, explain this file to me in 5 lines and tell me how to justify it if a judge asks.
```

## You should see
All three queries show PASS when I run them as the described users.

## After it finishes
1. Run it, test it, read the diff. `git commit -m "<this file>"`.
2. If something is unclear, ask it: "Explain this file to me in 5 lines and how I justify it to a judge."
3. Paste its summary to Claude (chat) for review before the next prompt.
