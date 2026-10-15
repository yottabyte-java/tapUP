# Prompt 40: (deployment) Supabase + Vercel steps
Agent: 6 Release  |  Read first: README.md
Paste first: 00_PROJECT_CONTEXT.md

## Prompt (copy everything in the box)
```text
Give me exact numbered steps: create the Supabase project, run schema.sql, rls.sql, seed.sql, create the two judge auth users (shop owner and customer) and link them,
copy env vars into Vercel (service role key marked server-only), deploy, set Supabase Auth redirect URLs to the Vercel domain, then verify with /api/health.
Tell me which plan to use (free for the hackathon) and what each key is for. Stop and ask if any step needs something I may not have.

Rules: follow 00_PROJECT_CONTEXT.md. Comment WHY in code. Stay inside this file's scope; put other-agent notes in docs/HANDOFF.md.
When done, explain this file to me in 5 lines and tell me how to justify it if a judge asks.
```

## You should see
The live URL loads; a judge login works from a private window.

## After it finishes
1. Run it, test it, read the diff. `git commit -m "<this file>"`.
2. If something is unclear, ask it: "Explain this file to me in 5 lines and how I justify it to a judge."
3. Paste its summary to Claude (chat) for review before the next prompt.
