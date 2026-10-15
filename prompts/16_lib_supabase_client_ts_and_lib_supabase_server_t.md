# Prompt 16: lib/supabase/client.ts and lib/supabase/server.ts
Agent: 4 Frontend  |  Read first: docs/ARCHITECTURE.md
Paste first: 00_PROJECT_CONTEXT.md

## Prompt (copy everything in the box)
```text
Write standard @supabase/ssr clients: browser client using only the anon key; server client reading cookies; a server-only admin client using the service role key
(import 'server-only' so it can never reach the browser). Comment which one is used where.

Rules: follow 00_PROJECT_CONTEXT.md. Comment WHY in code. Stay inside this file's scope; put other-agent notes in docs/HANDOFF.md.
When done, explain this file to me in 5 lines and tell me how to justify it if a judge asks.
```

## You should see
Importing the admin client in a client component fails the build (that is the safety check).

## After it finishes
1. Run it, test it, read the diff. `git commit -m "<this file>"`.
2. If something is unclear, ask it: "Explain this file to me in 5 lines and how I justify it to a judge."
3. Paste its summary to Claude (chat) for review before the next prompt.
