# Prompt 19: app/page.tsx (splash, design 01)
Agent: 4 Frontend  |  Read first: docs/DESIGN_SPEC.md
Paste first: 00_PROJECT_CONTEXT.md + docs/DESIGN_SPEC.md + images in docs/design/

## Prompt (copy everything in the box)
```text
Build design 01 at '/'. Logged out: logo, tagline "The spaza tab, but with a record.", illustration (simple SVG), "Get started" and "I already have an account".
Logged in: redirect shop owners to /shop/sell and customers to /me.

Rules: follow 00_PROJECT_CONTEXT.md. Comment WHY in code. Stay inside this file's scope; put other-agent notes in docs/HANDOFF.md.
When done, explain this file to me in 5 lines and tell me how to justify it if a judge asks.
```

## You should see
Matches design 01. Redirects work for both roles.

## After it finishes
1. Run it, test it, read the diff. `git commit -m "<this file>"`.
2. If something is unclear, ask it: "Explain this file to me in 5 lines and how I justify it to a judge."
3. Paste its summary to Claude (chat) for review before the next prompt.
