# Prompt 42: scripts/smoke-test.md
Agent: 6 Release  |  Read first: everything
Paste first: 00_PROJECT_CONTEXT.md

## Prompt (copy everything in the box)
```text
Write a 10-step manual test of the happy path (login as shop owner, add 3 items, charge, show QR, customer logs in on another device and approves a tab, repay on time, buying power rises, ledger updates, lender API call)
with the expected result per step. Add failure cases: camera denied, expired QR, tab above limit, wrong PIN five times.

Rules: follow 00_PROJECT_CONTEXT.md. Comment WHY in code. Stay inside this file's scope; put other-agent notes in docs/HANDOFF.md.
When done, explain this file to me in 5 lines and tell me how to justify it if a judge asks.
```

## You should see
I run it on my phone and every step passes.

## After it finishes
1. Run it, test it, read the diff. `git commit -m "<this file>"`.
2. If something is unclear, ask it: "Explain this file to me in 5 lines and how I justify it to a judge."
3. Paste its summary to Claude (chat) for review before the next prompt.
