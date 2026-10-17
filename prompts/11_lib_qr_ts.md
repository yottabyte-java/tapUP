# Prompt 11: lib/qr.ts
Agent: 3 Scoring  |  Read first: supabase/schema.sql
Paste first: 00_PROJECT_CONTEXT.md

## Prompt (copy everything in the box)
```text
Write lib/qr.ts. createSaleToken() -> { token, tokenHash, expiresAt } with a random 128-bit token (crypto.randomBytes), expiry 5 minutes.
verifySaleToken(token, storedHash, expiresAt, usedAt, now) -> 'ok' | 'expired' | 'used' | 'invalid'. Store only the hash.
Use constant-time comparison. Comment why we never store the raw token.
The schema has qr_token_hash, expires_at and used_at columns on sales. Hash tokens with SHA-256 (hex) so the server can look a sale up by hash, and compare hashes in constant time. A single-use token means used_at is set the first time it is accepted.

Rules: follow 00_PROJECT_CONTEXT.md. Comment WHY in code. Stay inside this file's scope; put other-agent notes in docs/HANDOFF.md.
When done, explain this file to me in 5 lines and tell me how to justify it if a judge asks.
```

## You should see
Tests: ok, expired after 5 minutes, used twice rejected, tampered token invalid.

## After it finishes
1. Run it, test it, read the diff. `git commit -m "<this file>"`.
2. If something is unclear, ask it: "Explain this file to me in 5 lines and how I justify it to a judge."
3. Paste its summary to Claude (chat) for review before the next prompt.
