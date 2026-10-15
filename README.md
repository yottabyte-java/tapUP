# tapUP agent pack (read me first)

Six AI "agents" = six prompt files. You paste ONE at a time into Claude Code (or any AI coding
tool), review what it did, commit, then move to the next. Nothing here is code that runs by
itself; these are instructions that make the AI build the app in a controlled order.

## The order (do not skip, do not reorder)
| # | File | Output | Time (rough) |
|---|------|--------|--------------|
| 1 | agents/01_ARCHITECT.md | docs/ARCHITECTURE.md (plan, no code) | 1 h |
| 2 | agents/02_DATABASE.md | supabase/schema.sql, rls.sql, seed.sql | 2 h |
| 3 | agents/03_SCORING.md | lib/ logic + tests + lender API route | 3 h |
| 4 | agents/04_FRONTEND.md | 4 screens wired to the database | 8-10 h |
| 5 | agents/05_SECURITY.md | fixes + docs/SECURITY_REVIEW.md | 2 h |
| 6 | agents/06_RELEASE.md | live URL, README, demo script, deck text | 3 h |

## Prompts per file
prompts/INDEX.md lists 45 ready-to-paste prompts, one per file to build (00 to 44). Use them instead of the
bigger agent files when you want to go one file at a time. prompts/ALL_PROMPTS.md has them all in one document.
The agent files in agents/ stay as the overview of each role.

## Designs
Put docs/DESIGN_SPEC.md and docs/design/*.png in the repo. Agent 4 reads the spec and looks at the images.
The images are mock-ups; numbers come from the backend. The few rule choices are already decided at the bottom of DESIGN_SPEC.md.

## Every session, do this
1. Open the AI tool in the repo root.
2. Paste 00_PROJECT_CONTEXT.md first. Then paste the agent file.
3. Let it work. Read its summary and the diff. Run what it tells you to run.
4. `git commit` with the agent name. Then paste its summary to me (Claude chat) for review.
5. Only then start the next agent.

## Why six and not one
One big prompt drifts. Small roles with locked decisions keep your idea intact, keep the
security work separate from feature work, and give you a checkpoint after each step.

## Known gaps I want you to see now
- The SSDLC you submitted says accounts are tied to a verified phone number. The MVP uses
  email + password for demo accounts (phone OTP costs SMS money and time). Agent 5 will
  list the exact SSDLC lines to edit on Sonke so the form stays honest.
- Payments are SIMULATED. Say so in the deck and video. Stitch is roadmap.
- The buying-power rules are a starting point I invented. We tune them together.
- Survey evidence is a 7-person pilot. Never describe it as more.
- Open question for organisers: how much pre-hackathon building is allowed. If it is not
  allowed, run agents 1 and 2 (planning and SQL files only, no app code) before 23 Oct and
  everything else from Friday.

## Rough calendar (today is 14 Oct)
- 14-22 Oct: agents 1-3 if allowed, more survey replies, join #needteam if you want help
- 23 Oct (Fri): agent 4 starts. Post your workspace on socials (prizes)
- 24 Oct (Sat): agent 4 finishes, agent 5. War Rooms on day 2
- 25 Oct (Sun): agent 6, deploy, record the video. Hackathon ends 17:00, no mentors after
- 26 Oct (Mon): upload early; hard deadline 23:59
