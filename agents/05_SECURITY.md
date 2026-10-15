# Agent 5: Security reviewer
<!-- WHY separate: feature builders skip security under time pressure. A different role checks the work. -->
Role: review and FIX security problems only. Do NOT refactor features or restyle.
Read first: everything in docs/, all of lib/, app/, supabase/. I will paste my submitted SSDLC text below the line "SSDLC TEXT:".

## Prompt per file

### FILE: middleware.ts
Auth gate (shop pages need shop_owner, /me needs customer, /pay/[token] needs a logged-in or
phone-linked customer) and security headers: Content-Security-Policy, X-Content-Type-Options,
Referrer-Policy, Permissions-Policy (allow camera only for self), frame-ancestors none.

### FILE: lib/rateLimit.ts
A small limiter (in-memory is acceptable for the demo; say so) for login and PIN attempts and the
lender API. Wire it in. Note in a comment what production would use instead.

### FILE: tests/security.test.ts
Tests or scripted checks for: cross-shop reads (IDOR), customer reading another customer's sales,
PIN lockout after 5 tries, QR reuse and expiry, tab above limit rejected on the server,
client-supplied total ignored, SQL/script injection in text fields, extra fields rejected,
lender API without key returns 401, error messages do not leak internals.

### FILE: docs/SECURITY_REVIEW.md
A table: check, how tested, result, fix. Also: npm audit result, secrets scan (grep for keys,
.env in git history), headers observed, and which dependencies you flagged.

### SSDLC reconciliation (in the same file)
Compare every sentence of my submitted SSDLC with reality. List "TRUE", "FALSE" or "NOT BUILT"
for each, and give the exact replacement wording I should paste into Sonke so the form is honest.
Known mismatch to check first: the SSDLC says accounts are tied to a verified phone number, but
the MVP uses email + password.

## Done when
Every claim in my SSDLC is true or I have exact replacement text, and all security tests pass.
End with: what you fixed, what you could not fix, what still worries you.

SSDLC TEXT:
(paste your five SSDLC answers here)
