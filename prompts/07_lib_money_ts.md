# Prompt 07: lib/money.ts
Agent: 3 Scoring  |  Read first: docs/ARCHITECTURE.md
Paste first: 00_PROJECT_CONTEXT.md

## Prompt (copy everything in the box)
```text
Write lib/money.ts: toCents(rand: number|string), formatRand(cents) -> "R1,248.50", addCents/subCents,
clampCents(min,max). Money is integer cents only; never float math. Throw on NaN or negative where it makes no sense.
Comment why floats are dangerous for money.

Rules: follow 00_PROJECT_CONTEXT.md. Comment WHY in code. Stay inside this file's scope; put other-agent notes in docs/HANDOFF.md.
When done, explain this file to me in 5 lines and tell me how to justify it if a judge asks.
```

## You should see
formatRand(10570) gives R105.70. toCents('34.90') gives 3490.

## After it finishes
1. Run it, test it, read the diff. `git commit -m "<this file>"`.
2. If something is unclear, ask it: "Explain this file to me in 5 lines and how I justify it to a judge."
3. Paste its summary to Claude (chat) for review before the next prompt.
