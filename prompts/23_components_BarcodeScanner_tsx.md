# Prompt 23: components/BarcodeScanner.tsx
Agent: 4 Frontend  |  Read first: lib/products.ts, docs/DESIGN_SPEC.md
Paste first: 00_PROJECT_CONTEXT.md + docs/DESIGN_SPEC.md + images in docs/design/

## Prompt (copy everything in the box)
```text
Build the scanner with html5-qrcode (design 05): teal corner frame, torch toggle if supported, text 'Hold steady and keep the barcode in view.'
Calls onScan(barcode). If camera permission is denied or unsupported, show a friendly message and a button to add items manually instead.

Rules: follow 00_PROJECT_CONTEXT.md. Comment WHY in code. Stay inside this file's scope; put other-agent notes in docs/HANDOFF.md.
When done, explain this file to me in 5 lines and tell me how to justify it if a judge asks.
```

## You should see
Works on a real phone over HTTPS; denied camera shows the manual fallback instead of crashing.

## After it finishes
1. Run it, test it, read the diff. `git commit -m "<this file>"`.
2. If something is unclear, ask it: "Explain this file to me in 5 lines and how I justify it to a judge."
3. Paste its summary to Claude (chat) for review before the next prompt.
