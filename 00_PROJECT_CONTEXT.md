# tapUP: project context (paste at the START of every agent session)
<!-- WHY: the AI forgets between sessions. This file is the single source of truth, so every
agent builds the same product and nobody quietly changes the idea. -->

## 1. Mission
tapUP turns a spaza shop owner's phone into a till and a digital tab. The more a customer
buys and repays on time, the higher their "buying power" (a small credit limit) at that shop.
Pitch line: "the spaza tab, but with a record."
Event: FNB App of the Year Hackathon 2026 (Sonke). Team: The Self Taughts (solo founder).
Challenge: Financial inclusion and money confidence. Sector: Finance.
Hackathon 23-25 Oct 2026 (virtual). Submission deadline Mon 26 Oct 2026, 23:59.

## 2. The problem and the evidence we may claim (never claim more than this)
- Spazas give credit on trust, memory or a notebook. Regular customers have no record to show.
- Founder story: spends over R1,000 a month at spazas and still is not recognised for credit.
- Pilot survey, 7 responses (Google Form, Oct 2026): 3 people had ever been given credit and all
  3 shop weekly or more; of the 4 weekly-or-more shoppers, 3 said yes/maybe to credit based on
  how often they shop and repay; 4 of 7 said no (mostly occasional shoppers). Preferred credit
  amounts: R200 x2, R100, R50 x3, R0. Always say "early pilot of 7 people", use counts, no percentages.
- Published figures: FinScope MSME 2024 via OECD: only 8-20% of small businesses are served by
  financial providers. BFA Global: 56% of informal retailers have no bank account (older research).
- Lenders in South Africa must run affordability and creditworthiness checks (National Credit Act),
  so there is demand for alternative data.
- Not proven: that owners lose money lending blind. Describe it as a likely pain point.

## 3. Product: four flows
Screens (match the prototype): Sell, Pay, Buying power, Ledger.
Designs: docs/DESIGN_SPEC.md + 15 images in docs/design/ (these win over the older prototype).
Older prototype: https://claude.ai/artifact/BETH5EudJovJrQi17YzxbH (reference only)
Linking a customer to a sale (the identity problem):
1. Shop QR (MVP primary): the shopkeeper's phone shows a QR per sale (locked total, expiry,
   single use). Customer scans with their own phone, approves: tab, demo card/wallet, or cash.
2. Phone number + 4-digit PIN (MVP, for customers without smartphones): shopkeeper enters the
   customer's number, the customer types their PIN on the shopkeeper's phone to approve a tab.
   PIN is set once, with a POPIA consent step.
3. Cash: shopkeeper logs the sale against the customer's number (counts less in the score).
4. Customer QR (phase 2, roadmap only). SMS/USSD approval: roadmap only.
Rules: the shopkeeper approves EVERY tab (so the app is never the lender). Credit limit is
calculated PER SHOP in the MVP. Cross-shop portability is roadmap.

## 4. Locked decisions (do NOT change without asking me)
- Stack: Next.js (App Router) + TypeScript + Tailwind, installable PWA, Supabase (Postgres, Auth,
  RLS), Vercel hosting. NO Java. Static sites and CMS builds are not allowed by the rules.
- Payments are SIMULATED ("Demo payment" button). Stitch is roadmap, labelled as such.
- Auth for the MVP: Supabase email + password for shop owners and smartphone customers.
  Non-smartphone customers are records managed by the shopkeeper (phone + PIN).
- Money: integer cents (ZAR). Language: English. Mobile first.
- Scoring: transparent rule-based points, NOT machine learning (explainable to judges).
- One lender-API demo route returning only limit, level and reasons. No personal data.

## 5. Out of scope (do NOT build)
Real payments, USSD/SMS, machine learning, cross-shop credit, real lender integration, admin
panels, onboarding wizards, notifications, any screen beyond the four.

## 6. Business model (planned figures; all are estimates unless marked checked)
- Free for spaza owners and customers.
- Lenders and wholesalers pay for the buying-power API: planned about R5 per credit decision plus
  about R2,500 a month platform fee (ASSUMPTIONS, no published benchmark found).
- Later: paid shop tools (about R99 a month), partner lender referral fee.
- Costs (checked Oct 2026): Supabase Pro $25/mo, Vercel Pro $20/mo (about $45, roughly R800),
  SMS about R0.15-R0.30 each. Estimates: domain about R300/yr, legal advice R15,000.
- Hackathon build runs on free plans (R0).

## 7. Judging criteria (each 0-10, equal weight) and what they demand from the BUILD
| Criterion | What judges look for | What this means for us |
|---|---|---|
| Product | complete, polished, works as expected, market need, traction | one flow that works end to end on a live URL with demo logins |
| Creativity | fresh take on an old problem | "digitise the informal tab" with buying power |
| Usability | easy, clear, next step obvious | big buttons, few taps, no jargon |
| Sustainability | can it scale, path to revenue | lender API + pricing slide |
| Impact | big problem, important | evidence slide with sources and survey |
| Presentation | story, relevance | 90-second video, 10 slides |
| Intelligence | can it think, forecast, predict user behaviour from data patterns | buying-power engine + next-week spend forecast + "likely to need a tab" flag |

## 8. Design system
Dark theme: background #111A1E, cards #1B2A30, primary teal #2DD4A0, accent amber #F5B83D.
Font: DM Sans. Phone width 390px. Large tap targets (44px+). Rands shown as R171.90.

## 9. Security baseline (always on; the SSDLC form on Sonke promises these)
RLS on every table; PINs hashed server-side (argon2 or bcrypt), never logged or returned;
secrets only in environment variables; every input validated on the server with zod; rate limits
on login and PIN attempts (lock after 5 tries); sale QR tokens are random, expire and work once;
no card data stored; POPIA consent timestamp when a customer is linked to a shop; collect only
what the limit needs; shops can only see their own customers; HTTPS only.

## 10. Demo data and judge access
Demo shop with 4 demo customers (Thabo M., Nomsa K., Sipho D., plus one new customer) and
30 days of history; one customer has a late repayment. Two judge logins (shop owner and customer).
All demo data is labelled "demo" in the UI footer. Credentials live in README.md, not in code.

## 11. Submission requirements (from Sonke)
PDF deck max 10 slides (features, screenshots, DEMO ACCOUNT, security, user journey, technical
architecture); SSDLC form; Lean Business Canvas; demo video max 90 seconds. Web apps must be
hosted (Vercel is fine). File size limit 15 MB each.

## 12. How every agent must work
1. Read everything in docs/ and this file before acting.
2. Stay inside your role. Things outside it go in docs/HANDOFF.md, not into code.
3. Before adding a dependency, tell me what and why. Prefer fewer dependencies.
4. Comment WHY in code (I am learning from it), not what.
5. Never invent claims or data. Demo data is labelled demo.
6. Keep every file small and readable. No clever tricks.
7. At the end: list files changed, how I verify it, and anything you were unsure about.
8. If a request conflicts with section 4 or 5, stop and ask me.
