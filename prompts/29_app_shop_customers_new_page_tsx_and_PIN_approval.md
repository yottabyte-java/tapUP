# Prompt 29: app/shop/customers/new/page.tsx and PIN approval (designs 12, 13)
Agent: 4 Frontend  |  Read first: lib/actions/customers.ts, docs/DESIGN_SPEC.md
Paste first: 00_PROJECT_CONTEXT.md + docs/DESIGN_SPEC.md + images in docs/design/

## Prompt (copy everything in the box)
```text
Build 'Add New Customer': full name, phone, POPIA consent checkbox with the exact text from the design, 'Next' disabled until ticked, then the customer sets a 4-digit PIN on this phone.
Also build the PIN approval screen (design 13): four dots, numeric keypad, backspace, used when charging a tab to a phone-only customer. Show lockout messages clearly. Never show or log the PIN.

Rules: follow 00_PROJECT_CONTEXT.md. Comment WHY in code. Stay inside this file's scope; put other-agent notes in docs/HANDOFF.md.
When done, explain this file to me in 5 lines and tell me how to justify it if a judge asks.
```

## You should see
Add Thabo-like customer, set a PIN, then approve a tab with the PIN; a wrong PIN shows an error.

## After it finishes
1. Run it, test it, read the diff. `git commit -m "<this file>"`.
2. If something is unclear, ask it: "Explain this file to me in 5 lines and how I justify it to a judge."
3. Paste its summary to Claude (chat) for review before the next prompt.
