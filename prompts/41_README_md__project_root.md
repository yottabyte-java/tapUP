# Prompt 41: README.md (project root)
Agent: 6 Release  |  Read first: everything
Paste first: 00_PROJECT_CONTEXT.md

## Prompt (copy everything in the box)
```text
Write the project README: what tapUP is (3 lines), live URL, demo logins (shop owner and customer), what is SIMULATED (payments, SMS), how to run locally,
tech stack, honest limitations, link to docs. No secrets. Keep it under one screen.

Rules: follow 00_PROJECT_CONTEXT.md. Comment WHY in code. Stay inside this file's scope; put other-agent notes in docs/HANDOFF.md.
When done, explain this file to me in 5 lines and tell me how to justify it if a judge asks.
```

## You should see
A stranger can run it locally from the README alone.

## After it finishes
1. Run it, test it, read the diff. `git commit -m "<this file>"`.
2. If something is unclear, ask it: "Explain this file to me in 5 lines and how I justify it to a judge."
3. Paste its summary to Claude (chat) for review before the next prompt.
