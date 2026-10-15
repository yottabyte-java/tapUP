# Prompt 36: docs/SECURITY_REVIEW.md
Agent: 5 Security  |  Read first: everything + my submitted SSDLC text
Paste first: 00_PROJECT_CONTEXT.md

## Prompt (copy everything in the box)
```text
Write docs/SECURITY_REVIEW.md: a table of check, how tested, result, fix. Include npm audit output summary, a secrets scan (keys in code, .env in git history),
headers observed, and flagged dependencies.
Then compare every sentence of my submitted SSDLC (I will paste it below) with reality: label each TRUE, FALSE or NOT BUILT and give exact replacement wording I should paste into Sonke.
Check first: the SSDLC says accounts use a verified phone number, but the MVP uses email + password.
SSDLC TEXT: (paste it here)

Rules: follow 00_PROJECT_CONTEXT.md. Comment WHY in code. Stay inside this file's scope; put other-agent notes in docs/HANDOFF.md.
When done, explain this file to me in 5 lines and tell me how to justify it if a judge asks.
```

## You should see
I have copy-paste replacement wording for any SSDLC sentence that is not true.

## After it finishes
1. Run it, test it, read the diff. `git commit -m "<this file>"`.
2. If something is unclear, ask it: "Explain this file to me in 5 lines and how I justify it to a judge."
3. Paste its summary to Claude (chat) for review before the next prompt.
