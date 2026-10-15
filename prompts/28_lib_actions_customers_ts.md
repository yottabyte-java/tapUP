# Prompt 28: lib/actions/customers.ts
Agent: 4 Frontend  |  Read first: lib/validation.ts, lib/pin.ts
Paste first: 00_PROJECT_CONTEXT.md + docs/DESIGN_SPEC.md + images in docs/design/

## Prompt (copy everything in the box)
```text
Write server actions addCustomer(name, phone, consent) and setCustomerPin(pin). Require consent=true and write consent_at.
Hash the PIN with lib/pin.ts. Only the shop owner of that shop can add customers. Duplicate phone in the same shop returns a friendly error.
Add verifyCustomerPin(shopCustomerId, pin) enforcing the 5-try lockout via the service role (never expose pin_hash to the client).

Rules: follow 00_PROJECT_CONTEXT.md. Comment WHY in code. Stay inside this file's scope; put other-agent notes in docs/HANDOFF.md.
When done, explain this file to me in 5 lines and tell me how to justify it if a judge asks.
```

## You should see
Adding a customer without the consent tick fails on the server; 5 wrong PINs lock the customer.

## After it finishes
1. Run it, test it, read the diff. `git commit -m "<this file>"`.
2. If something is unclear, ask it: "Explain this file to me in 5 lines and how I justify it to a judge."
3. Paste its summary to Claude (chat) for review before the next prompt.
