# Prompt 10: lib/pin.ts
Agent: 3 Scoring  |  Read first: supabase/schema.sql
Paste first: 00_PROJECT_CONTEXT.md

## Prompt (copy everything in the box)
```text
Write lib/pin.ts using bcryptjs (pure JS, deploys on Vercel without native build problems; mention that reason in a comment).
hashPin(pin), verifyPin(pin, hash), plus lockout helpers: after 5 wrong tries lock 15 minutes (isLocked, registerFailure, reset).
PIN must be exactly 4 digits. Never log or return a PIN or hash. Constant-time compare via bcrypt.

Rules: follow 00_PROJECT_CONTEXT.md. Comment WHY in code. Stay inside this file's scope; put other-agent notes in docs/HANDOFF.md.
When done, explain this file to me in 5 lines and tell me how to justify it if a judge asks.
```

## You should see
Tests: correct PIN passes, wrong fails, 5 failures locks, lock expires after 15 minutes.

## After it finishes
1. Run it, test it, read the diff. `git commit -m "<this file>"`.
2. If something is unclear, ask it: "Explain this file to me in 5 lines and how I justify it to a judge."
3. Paste its summary to Claude (chat) for review before the next prompt.
