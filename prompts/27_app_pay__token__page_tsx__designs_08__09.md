# Prompt 27: app/pay/[token]/page.tsx (designs 08, 09)
Agent: 4 Frontend  |  Read first: lib/qr.ts, lib/buyingPower.ts, lib/actions/sales.ts
Paste first: 00_PROJECT_CONTEXT.md + docs/DESIGN_SPEC.md + images in docs/design/

## Prompt (copy everything in the box)
```text
Build the customer Pay screen. Look up the sale by token hash. Show total due, available buying power with level and next level,
'You can put on tab' = min(total, limit), 'Remainder to pay now' = total - tab, buttons 'Demo card / wallet' and 'Cash', and the footnote 'Payments are simulated in this demo.'
Expired, used and invalid tokens all show the same friendly 'This payment link has expired' screen (design 09), without saying which. Customer must be logged in.

Rules: follow 00_PROJECT_CONTEXT.md. Comment WHY in code. Stay inside this file's scope; put other-agent notes in docs/HANDOFF.md.
When done, explain this file to me in 5 lines and tell me how to justify it if a judge asks.
```

## You should see
Open the QR link on a second phone: amounts are correct, tab is capped at the limit, a reused link shows the expired screen.

## After it finishes
1. Run it, test it, read the diff. `git commit -m "<this file>"`.
2. If something is unclear, ask it: "Explain this file to me in 5 lines and how I justify it to a judge."
3. Paste its summary to Claude (chat) for review before the next prompt.
