# tapUP

tapUP turns a spaza shop owner's phone into a digital till for recording sales and managing customer tabs.  
Customers build a shop-specific transaction and repayment history that informs their buying power.  
Our goal is to support financial inclusion by making everyday spaza transactions easier to track.

**Live app:** https://tap-up-beryl.vercel.app/  
**Repository:** https://github.com/yottabyte-java/tapUP

## Demo accounts

- **Shop owner:** `[Add verified demo email]`
- **Customer:** `[Add verified demo email]`
- **Password:** Share verified demo credentials securely; never commit real passwords or secrets.

## What's simulated?

- **Payments:** Simulated for the MVP; no real money is transferred. Stitch integration is on the roadmap.
- **SMS:** Simulated/not connected to a live SMS gateway; messages are not guaranteed to be delivered.
- **Buying power:** Uses prototype rules and is not a formal credit score or lending decision.

## Run locally

Requirements: Node.js, npm, and Supabase credentials for your own development environment.

```bash
git clone https://github.com/yottabyte-java/tapUP.git
cd tapUP
npm install
```

Copy `.env.example` to `.env.local`, then fill in the required Supabase values using your own development project. Never commit `.env.local` or production credentials.

```bash
npm run dev
```

Open http://localhost:3000. Check `package.json` for available test and verification scripts.

## Tech stack

- Next.js, React, TypeScript
- Supabase and PostgreSQL
- SQL schema, row-level security and database policies
- Vitest and Playwright for automated testing
- Vercel deployment

## Limitations

tapUP is a hackathon MVP, not a production banking or lending platform. Buying-power rules are preliminary and need validation with more shop owners and customers. The initial survey was a **7-person pilot**, not representative market research. Payment and SMS integrations are not live. Do not use the prototype to make real lending decisions.

## Documentation

- [Project context](00_PROJECT_CONTEXT.md)
- [Agent workflow](AGENTS.md)
- [Agent prompts](agents/)
- [Prompt index](prompts/INDEX.md)
- [Project documentation](docs/)
- [Security review](docs/SECURITY_REVIEW.md)
- [Design specification](docs/DESIGN_SPEC.md)
