# Prompt 30: app/me/page.tsx, components/LimitMeter.tsx, components/WhyLimit.tsx (design 10)
Agent: 4 Frontend  |  Read first: lib/buyingPower.ts, lib/forecast.ts
Paste first: 00_PROJECT_CONTEXT.md + docs/DESIGN_SPEC.md + images in docs/design/

## Prompt (copy everything in the box)
```text
Build the customer Buying Power screen: ring gauge with current limit and level, next-level card with progress, 'Why this limit?' reasons from explainLimit(),
and the forecast card from likelyToNeedTab() ('You may need a tab around month end'). All numbers come from the backend; hide the forecast card when likely=false.

Rules: follow 00_PROJECT_CONTEXT.md. Comment WHY in code. Stay inside this file's scope; put other-agent notes in docs/HANDOFF.md.
When done, explain this file to me in 5 lines and tell me how to justify it if a judge asks.
```

## You should see
Seeded customers show different limits and different reasons.

## After it finishes
1. Run it, test it, read the diff. `git commit -m "<this file>"`.
2. If something is unclear, ask it: "Explain this file to me in 5 lines and how I justify it to a judge."
3. Paste its summary to Claude (chat) for review before the next prompt.
