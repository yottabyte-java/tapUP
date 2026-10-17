# Prompt 14: tests/qr.test.ts and tests/pin.test.ts
Agent: 3 Scoring  |  Read first: lib/qr.ts, lib/pin.ts
Paste first: 00_PROJECT_CONTEXT.md

## Prompt (copy everything in the box)
```text
Write vitest tests: sale token ok / expired at 5 minutes / reused / tampered; PIN correct / wrong / lock after 5 failures / unlock after 15 minutes.

Rules: follow 00_PROJECT_CONTEXT.md. Comment WHY in code. Stay inside this file's scope; put other-agent notes in docs/HANDOFF.md.
When done, explain this file to me in 5 lines and tell me how to justify it if a judge asks.

Also add a PIN test that verifyPin("2468", "$2b$10$c7.9pRKnnHbm4p8iiLoGWO3VeFWfBKxYX8l6phC0.UTyc1QNhtLue") is true, and a validation test that extra fields and client-supplied totals are rejected.
```

## You should see
npm test passes.

## After it finishes
1. Run it, test it, read the diff. `git commit -m "<this file>"`.
2. If something is unclear, ask it: "Explain this file to me in 5 lines and how I justify it to a judge."
3. Paste its summary to Claude (chat) for review before the next prompt.
