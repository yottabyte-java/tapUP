# Prompt 35: tests/security.test.ts
Agent: 5 Security  |  Read first: everything
Paste first: 00_PROJECT_CONTEXT.md

## Prompt (copy everything in the box)
```text
Write security checks (vitest or a documented script): cross-shop read (IDOR), customer reading another customer's sales, PIN lockout, QR reuse and expiry,
tab above limit rejected on the server, client-supplied total ignored, SQL/script injection strings in text fields, extra fields rejected,
lender API without key returns 401, error messages do not leak stack traces or table names.

Rules: follow 00_PROJECT_CONTEXT.md. Comment WHY in code. Stay inside this file's scope; put other-agent notes in docs/HANDOFF.md.
When done, explain this file to me in 5 lines and tell me how to justify it if a judge asks.
```

## You should see
All checks pass or each failure is listed with a fix.

## After it finishes
1. Run it, test it, read the diff. `git commit -m "<this file>"`.
2. If something is unclear, ask it: "Explain this file to me in 5 lines and how I justify it to a judge."
3. Paste its summary to Claude (chat) for review before the next prompt.
