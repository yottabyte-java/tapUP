# Prompt 17: lib/products.ts
Agent: 4 Frontend  |  Read first: docs/DESIGN_SPEC.md
Paste first: 00_PROJECT_CONTEXT.md + docs/DESIGN_SPEC.md + images in docs/design/

## Prompt (copy everything in the box)
```text
Write lib/products.ts: a demo catalogue of about 12 spaza items (maize meal 2.5kg R34.90, cooking oil 1L R42.90, sugar 2kg R27.90, bread, milk, rice, tea, salt, etc.)
with id, name, barcode, priceCents, image path. Label it demo. Add getProductByBarcode().

Rules: follow 00_PROJECT_CONTEXT.md. Comment WHY in code. Stay inside this file's scope; put other-agent notes in docs/HANDOFF.md.
When done, explain this file to me in 5 lines and tell me how to justify it if a judge asks.
```

## You should see
Scanning barcode 6009877543210 (from the design) resolves to a product; unknown barcodes return undefined.

## After it finishes
1. Run it, test it, read the diff. `git commit -m "<this file>"`.
2. If something is unclear, ask it: "Explain this file to me in 5 lines and how I justify it to a judge."
3. Paste its summary to Claude (chat) for review before the next prompt.
