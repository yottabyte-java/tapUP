# Prompt 18: app/layout.tsx and components/DemoBanner.tsx
Agent: 4 Frontend  |  Read first: docs/DESIGN_SPEC.md
Paste first: 00_PROJECT_CONTEXT.md + docs/DESIGN_SPEC.md + images in docs/design/

## Prompt (copy everything in the box)
```text
Build the root layout: DM Sans, dark theme tokens, 390px mobile-first container, PWA meta tags (theme colour #111A1E, viewport).
DemoBanner shows "Demo data. Payments are simulated." at the bottom of main screens.

Rules: follow 00_PROJECT_CONTEXT.md. Comment WHY in code. Stay inside this file's scope; put other-agent notes in docs/HANDOFF.md.
When done, explain this file to me in 5 lines and tell me how to justify it if a judge asks.
```

## You should see
Every page has the dark theme and the banner; text is readable on a phone.

## After it finishes
1. Run it, test it, read the diff. `git commit -m "<this file>"`.
2. If something is unclear, ask it: "Explain this file to me in 5 lines and how I justify it to a judge."
3. Paste its summary to Claude (chat) for review before the next prompt.
