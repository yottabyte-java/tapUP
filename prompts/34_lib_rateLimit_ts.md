# Prompt 34: lib/rateLimit.ts
Agent: 5 Security  |  Read first: app/api/v1/buying-power/route.ts
Paste first: 00_PROJECT_CONTEXT.md

## Prompt (copy everything in the box)
```text
Write lib/rateLimit.ts: a small in-memory limiter (fixed window) keyed by IP+route for login, PIN attempts and the lender API.
Comment clearly that in-memory is for the demo and production needs a shared store (for example Upstash Redis). Wire it into those three places.

Rules: follow 00_PROJECT_CONTEXT.md. Comment WHY in code. Stay inside this file's scope; put other-agent notes in docs/HANDOFF.md.
When done, explain this file to me in 5 lines and tell me how to justify it if a judge asks.
```

## You should see
Hammering the lender endpoint returns 429 after the limit.

## After it finishes
1. Run it, test it, read the diff. `git commit -m "<this file>"`.
2. If something is unclear, ask it: "Explain this file to me in 5 lines and how I justify it to a judge."
3. Paste its summary to Claude (chat) for review before the next prompt.
