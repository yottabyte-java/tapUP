# Prompt 24: components/Cart.tsx
Agent: 4 Frontend  |  Read first: lib/money.ts, docs/DESIGN_SPEC.md
Paste first: 00_PROJECT_CONTEXT.md + docs/DESIGN_SPEC.md + images in docs/design/

## Prompt (copy everything in the box)
```text
Build the cart (design 06): product image, name, price, quantity stepper (min 1, max 99), delete, total, big 'Charge customer' button (44px+).
Keep cart state local; send only productId + qty to the server.

Rules: follow 00_PROJECT_CONTEXT.md. Comment WHY in code. Stay inside this file's scope; put other-agent notes in docs/HANDOFF.md.
When done, explain this file to me in 5 lines and tell me how to justify it if a judge asks.
```

## You should see
Quantity changes update the total instantly; the server later recomputes it anyway.

## After it finishes
1. Run it, test it, read the diff. `git commit -m "<this file>"`.
2. If something is unclear, ask it: "Explain this file to me in 5 lines and how I justify it to a judge."
3. Paste its summary to Claude (chat) for review before the next prompt.
