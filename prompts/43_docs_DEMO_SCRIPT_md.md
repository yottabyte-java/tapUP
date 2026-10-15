# Prompt 43: docs/DEMO_SCRIPT.md
Agent: 6 Release  |  Read first: everything
Paste first: 00_PROJECT_CONTEXT.md

## Prompt (copy everything in the box)
```text
Write a 90-second demo video script with a shot list and timings: problem in 10s (founder story, over R1,000 a month at spazas), sell a basket,
customer scans the QR, tab approved, repayment, buying power rises, forecast line, lender API in one shot, business model and ask in the last 10s.
State clearly on screen that payments are simulated. Include the exact words to say and what is on screen for each shot.

Rules: follow 00_PROJECT_CONTEXT.md. Comment WHY in code. Stay inside this file's scope; put other-agent notes in docs/HANDOFF.md.
When done, explain this file to me in 5 lines and tell me how to justify it if a judge asks.
```

## You should see
Reading it aloud takes about 85-90 seconds.

## After it finishes
1. Run it, test it, read the diff. `git commit -m "<this file>"`.
2. If something is unclear, ask it: "Explain this file to me in 5 lines and how I justify it to a judge."
3. Paste its summary to Claude (chat) for review before the next prompt.
