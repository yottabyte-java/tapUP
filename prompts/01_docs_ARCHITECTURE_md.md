# Prompt 01: docs/ARCHITECTURE.md
Agent: 1 Architect  |  Read first: docs/FILE_STRUCTURE.md
Paste first: 00_PROJECT_CONTEXT.md

## Prompt (copy everything in the box)
```text
Write docs/ARCHITECTURE.md. Design only, no app code.
Include: (1) the folder structure, confirm or fix docs/FILE_STRUCTURE.md; (2) every page, server action
and API route with who may call it (shop owner, customer, lender key); (3) step-by-step sequences with
the tables touched for: sale via shop QR, tab via phone+PIN, cash sale, repaying a tab; (4) a Mermaid
data-flow diagram; (5) env var NAMES; (6) top 8 risks with one-line mitigations; (7) what can go wrong in
the live demo with a fallback each; (8) the build order for agent 4 so a working slice exists early.
Then explain the diagram to me in plain words and tell me how to justify the design if a judge asks.

Rules: follow 00_PROJECT_CONTEXT.md. Comment WHY in code. Stay inside this file's scope; put other-agent notes in docs/HANDOFF.md.
When done, explain this file to me in 5 lines and tell me how to justify it if a judge asks.
```

## You should see
You can read it in 10 minutes and nothing contradicts 00_PROJECT_CONTEXT.md.

## After it finishes
1. Run it, test it, read the diff. `git commit -m "<this file>"`.
2. If something is unclear, ask it: "Explain this file to me in 5 lines and how I justify it to a judge."
3. Paste its summary to Claude (chat) for review before the next prompt.
