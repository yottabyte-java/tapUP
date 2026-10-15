# Prompt 02: docs/HANDOFF.md
Agent: 1 Architect  |  Read first: docs/ARCHITECTURE.md
Paste first: 00_PROJECT_CONTEXT.md

## Prompt (copy everything in the box)
```text
Create docs/HANDOFF.md with five headings: For Database, For Scoring, For Frontend, For Security, For Release.
Move anything you noticed that belongs to another agent under the right heading. Do not solve it yourself.
Add one line at the top: every agent appends here instead of editing another agent's files.

Rules: follow 00_PROJECT_CONTEXT.md. Comment WHY in code. Stay inside this file's scope; put other-agent notes in docs/HANDOFF.md.
When done, explain this file to me in 5 lines and tell me how to justify it if a judge asks.
```

## You should see
File exists with five headings and at least the open questions you noticed.

## After it finishes
1. Run it, test it, read the diff. `git commit -m "<this file>"`.
2. If something is unclear, ask it: "Explain this file to me in 5 lines and how I justify it to a judge."
3. Paste its summary to Claude (chat) for review before the next prompt.
