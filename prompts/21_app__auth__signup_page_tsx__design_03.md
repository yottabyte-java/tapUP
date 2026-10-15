# Prompt 21: app/(auth)/signup/page.tsx (design 03)
Agent: 4 Frontend  |  Read first: docs/DESIGN_SPEC.md
Paste first: 00_PROJECT_CONTEXT.md + docs/DESIGN_SPEC.md + images in docs/design/

## Prompt (copy everything in the box)
```text
Build signup: role cards (shop owner or customer), then name + email + password. On success create the profile row with the chosen role.
A shop owner also creates their shop (name). Password minimum length 8. Never trust the role from the client without writing it server-side.

Rules: follow 00_PROJECT_CONTEXT.md. Comment WHY in code. Stay inside this file's scope; put other-agent notes in docs/HANDOFF.md.
When done, explain this file to me in 5 lines and tell me how to justify it if a judge asks.
```

## You should see
New accounts are created with the right role; the shop is created for owners.

## After it finishes
1. Run it, test it, read the diff. `git commit -m "<this file>"`.
2. If something is unclear, ask it: "Explain this file to me in 5 lines and how I justify it to a judge."
3. Paste its summary to Claude (chat) for review before the next prompt.
