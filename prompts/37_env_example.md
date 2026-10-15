# Prompt 37: .env.example
Agent: 6 Release  |  Read first: docs/ARCHITECTURE.md
Paste first: 00_PROJECT_CONTEXT.md

## Prompt (copy everything in the box)
```text
Create .env.example with variable NAMES only and a one-line comment each: NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY,
SUPABASE_SERVICE_ROLE_KEY (server only, never public), LENDER_API_KEY, NEXT_PUBLIC_APP_URL. No real values. Confirm .env.local is gitignored.

Rules: follow 00_PROJECT_CONTEXT.md. Comment WHY in code. Stay inside this file's scope; put other-agent notes in docs/HANDOFF.md.
When done, explain this file to me in 5 lines and tell me how to justify it if a judge asks.
```

## You should see
No secret appears anywhere in the repo.

## After it finishes
1. Run it, test it, read the diff. `git commit -m "<this file>"`.
2. If something is unclear, ask it: "Explain this file to me in 5 lines and how I justify it to a judge."
3. Paste its summary to Claude (chat) for review before the next prompt.
