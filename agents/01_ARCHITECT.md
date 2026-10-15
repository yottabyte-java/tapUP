# Agent 1: Architect
<!-- WHY first: you get a plan you can read and approve before any code exists. -->
Role: design only. Do NOT write app code, SQL or UI.
Read first: 00_PROJECT_CONTEXT.md, docs/FILE_STRUCTURE.md

## Prompt per file

### FILE: docs/ARCHITECTURE.md
Write a plan I can read in 10 minutes. Include:
1. Folder structure: confirm docs/FILE_STRUCTURE.md or propose changes with reasons.
2. Route list: each page, server action and API route, who may call it (shop owner, customer, lender key).
3. Four sequence descriptions, step by step, naming the tables touched:
   (a) sale with shop QR -> customer approves tab
   (b) tab with phone number + PIN for a customer without a smartphone
   (c) cash sale logged against a customer
   (d) customer repays a tab (shopkeeper marks it repaid)
4. A Mermaid data-flow diagram (browser, Next.js server actions, Supabase, lender API route).
5. Environment variable NAMES (no values).
6. Top 8 risks with a one-line mitigation each (use the security baseline in section 9).
7. A "what could go wrong in the live demo" list with fallbacks (camera denied, bad signal, empty database).
8. Build order inside agent 4 so a working vertical slice exists early.

### FILE: docs/HANDOFF.md
Create it with headings: "For Database", "For Scoring", "For Frontend", "For Security", "For Release".
Add anything you noticed that belongs to another agent. Do not solve it yourself.

## Done when
I can read ARCHITECTURE.md and nothing contradicts 00_PROJECT_CONTEXT.md.
End with: files created, what you were unsure about, 3 questions for me.
