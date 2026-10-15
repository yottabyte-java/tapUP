# Prompt 44: docs/DECK.md
Agent: 6 Release  |  Read first: everything
Paste first: 00_PROJECT_CONTEXT.md

## Prompt (copy everything in the box)
```text
Write content for 10 slides, each with a title, 3-4 bullets and the screenshot to take: 1 title and one-liner; 2 problem and evidence (survey of 7 + FinScope via OECD + BFA, with sources);
3 solution and features; 4 live demo link and judge logins; 5 user journey story; 6 intelligence (scoring and forecast); 7 architecture and security;
8 business model and pricing in rands (mark estimates); 9 roadmap (Stitch payments, USSD/SMS, cross-shop credit, lender pilots); 10 team and ask.
Use ONLY claims in section 2 of 00_PROJECT_CONTEXT.md.

Rules: follow 00_PROJECT_CONTEXT.md. Comment WHY in code. Stay inside this file's scope; put other-agent notes in docs/HANDOFF.md.
When done, explain this file to me in 5 lines and tell me how to justify it if a judge asks.
```

## You should see
Every claim traces back to the context file; the demo login and live URL are on slide 4.

## After it finishes
1. Run it, test it, read the diff. `git commit -m "<this file>"`.
2. If something is unclear, ask it: "Explain this file to me in 5 lines and how I justify it to a judge."
3. Paste its summary to Claude (chat) for review before the next prompt.
