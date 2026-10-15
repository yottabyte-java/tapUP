# Prompt 33: middleware.ts
Agent: 5 Security  |  Read first: docs/ARCHITECTURE.md
Paste first: 00_PROJECT_CONTEXT.md

## Prompt (copy everything in the box)
```text
Write middleware.ts: require login for /shop/*, /me and /pay/*; shop pages require role shop_owner; /me requires customer.
Add security headers: Content-Security-Policy (allow self, Supabase URL, camera via Permissions-Policy), X-Content-Type-Options nosniff, Referrer-Policy, Permissions-Policy (camera=(self)), frame-ancestors none.
Explain each header in a comment.

Rules: follow 00_PROJECT_CONTEXT.md. Comment WHY in code. Stay inside this file's scope; put other-agent notes in docs/HANDOFF.md.
When done, explain this file to me in 5 lines and tell me how to justify it if a judge asks.
```

## You should see
Visiting /shop/ledger logged out redirects to login; securityheaders-style check shows the headers.

## After it finishes
1. Run it, test it, read the diff. `git commit -m "<this file>"`.
2. If something is unclear, ask it: "Explain this file to me in 5 lines and how I justify it to a judge."
3. Paste its summary to Claude (chat) for review before the next prompt.
