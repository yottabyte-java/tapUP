# Prompt 26: components/SaleQr.tsx (design 07)
Agent: 4 Frontend  |  Read first: lib/qr.ts
Paste first: 00_PROJECT_CONTEXT.md + docs/DESIGN_SPEC.md + images in docs/design/

## Prompt (copy everything in the box)
```text
Build the QR view: amount, 'Expires in mm:ss' countdown, QR (qrcode.react) of the pay link, short token chip with copy, and the warning
'This link is for one-time use only. It will expire in 5 minutes.' When the countdown hits zero, show 'expired' and a button to create a new sale link.
Never display the full secret token as text.

Rules: follow 00_PROJECT_CONTEXT.md. Comment WHY in code. Stay inside this file's scope; put other-agent notes in docs/HANDOFF.md.
When done, explain this file to me in 5 lines and tell me how to justify it if a judge asks.
```

## You should see
Countdown runs; at 0 the QR is replaced with an expired state.

## After it finishes
1. Run it, test it, read the diff. `git commit -m "<this file>"`.
2. If something is unclear, ask it: "Explain this file to me in 5 lines and how I justify it to a judge."
3. Paste its summary to Claude (chat) for review before the next prompt.
