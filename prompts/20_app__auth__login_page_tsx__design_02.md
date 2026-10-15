# Prompt 20: app/(auth)/login/page.tsx (design 02)
Agent: 4 Frontend  |  Read first: docs/DESIGN_SPEC.md, lib/supabase/client.ts
Paste first: 00_PROJECT_CONTEXT.md + docs/DESIGN_SPEC.md + images in docs/design/

## Prompt (copy everything in the box)
```text
Build login with email + password via Supabase Auth. Show clear errors (wrong password, unknown email) without revealing which part was wrong.
Hide 'Forgot your password?'. Redirect by role after login. Loading and error states.

Rules: follow 00_PROJECT_CONTEXT.md. Comment WHY in code. Stay inside this file's scope; put other-agent notes in docs/HANDOFF.md.
When done, explain this file to me in 5 lines and tell me how to justify it if a judge asks.
```

## You should see
A seeded judge account can log in and lands on the right screen.

## After it finishes
1. Run it, test it, read the diff. `git commit -m "<this file>"`.
2. If something is unclear, ask it: "Explain this file to me in 5 lines and how I justify it to a judge."
3. Paste its summary to Claude (chat) for review before the next prompt.
