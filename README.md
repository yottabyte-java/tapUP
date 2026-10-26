# tapUP

tapUP turns a spaza shop owner's phone into a digital till for recording sales and managing customer tabs.  
Customers build a shop-specific transaction and repayment history that informs their buying power.  
Our goal is to support financial inclusion by making everyday spaza transactions easier to track.

**Live app:** https://tap-up-beryl.vercel.app/  
**GitHub:** https://github.com/yottabyte-java/tapUP

## Demo accounts

| Role | Login |
|---|---|
| Shop owner | `[SHOP_OWNER_DEMO_EMAIL]` |
| Customer | `[CUSTOMER_DEMO_EMAIL]` |
| Demo password | `[DEMO_PASSWORD_OR_ACCESS_INSTRUCTIONS]` |

Replace these placeholders with working demo credentials before sharing the README publicly. Never commit real secrets.

## Features

- Record sales using a mobile-friendly interface.
- Manage customer tabs and outstanding balances.
- Track customer repayments and transaction history.
- Display customer buying power informed by recorded behaviour.
- Support a digital workflow for spaza shop owners and customers.

## What's simulated?

- **Payments:** Simulated; no real money is transferred.
- **SMS:** Simulated; live SMS delivery is not guaranteed.
- **Buying power:** Uses preliminary prototype rules and is not a formal credit score or lending decision.

## Tech stack

- Next.js and React
- TypeScript
- Supabase and PostgreSQL
- SQL database schema and row-level security
- Vitest and Playwright
- Vercel

## Run locally

**Requirements:** Node.js, npm and a Supabase project configured for development.

```bash
git clone https://github.com/yottabyte-java/tapUP.git
cd tapUP
npm install
```

Copy `.env.example` to `.env.local` and fill in the required values for your own Supabase project. Keep `.env.local` and all secrets out of version control.

```bash
npm run dev
```

Open http://localhost:3000.

For available test commands, see `package.json`.

## Limitations

tapUP is a working hackathon MVP, not a production banking or lending platform. Buying-power rules need further validation before being used for real credit decisions. Initial user research was a seven-person pilot and should not be treated as representative market research. Payments and SMS are simulated.

## Documentation

- [Project context](00_PROJECT_CONTEXT.md)
- [Agent workflow](AGENTS.md)
- [Agent prompts](agents/)
- [Prompt index](prompts/INDEX.md)
- [All prompts](prompts/ALL_PROMPTS.md)
- [Project documentation](docs/)
- [Security review](docs/SECURITY_REVIEW.md)
- [Design specification](docs/DESIGN_SPEC.md)
- [Browser regression testing](playwright.config.ts)

---

**Project:** tapUP  
**Team:** The Self Taughts  
**Challenge:** Financial Inclusion and Money Confidence  
**Status:** Hackathon MVP
