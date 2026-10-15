# Prompt 39: app/api/health/route.ts
Agent: 6 Release  |  Read first: lib/supabase/server.ts
Paste first: 00_PROJECT_CONTEXT.md

## Prompt (copy everything in the box)
```text
Write a health route returning { ok: true } and verifying the database responds with a cheap query. No data in the response.

Rules: follow 00_PROJECT_CONTEXT.md. Comment WHY in code. Stay inside this file's scope; put other-agent notes in docs/HANDOFF.md.
When done, explain this file to me in 5 lines and tell me how to justify it if a judge asks.
```

## You should see
/api/health returns ok on the deployed site.

## After it finishes
1. Run it, test it, read the diff. `git commit -m "<this file>"`.
2. If something is unclear, ask it: "Explain this file to me in 5 lines and how I justify it to a judge."
3. Paste its summary to Claude (chat) for review before the next prompt.
