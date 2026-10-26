# tapUP

**The spaza tab, but with a record.**

tapUP turns a spaza shop owner's phone into a digital till for recording sales, managing customer tabs, and tracking repayments. Customers build a shop-specific transaction and repayment history that helps inform their buying power.

Our goal is to support financial inclusion by making everyday spaza transactions easier to track.

## Try the live demo

**Live app:** https://tap-pk53x8bqi-yottabytes.vercel.app/

**Alternative deployment:** https://tap-up-beryl.vercel.app/

**GitHub repository:** https://github.com/yottabyte-java/tapUP

### Demo accounts

Use the demo accounts below to explore tapUP. Replace these placeholders with working credentials before sharing the README.

### Demo accounts

| Role | Login |
|---|---|
| Shop owner | `owner.demo@tapup.example.com` |
| Customer | `customer.demo@tapup.example.com` |
| Demo password | `TapUP-Demo-2026!` |

**Demo access:** These are demo-only credentials. The accounts must be created and configured in Supabase Auth before they can be used to sign in. Do not use these credentials for real accounts.

If demo accounts are not available, use the application's signup flow to create an account.

## How to explore tapUP

### 1. Shop owner

Explore the shop-owner experience to see how a spaza shop can manage everyday transactions digitally.

- Record sales from a mobile-friendly interface.
- Manage customers and their tabs.
- Track outstanding balances and repayments.
- View transaction activity.

### 2. Customer

Explore the customer experience to see how everyday purchases can contribute to a transaction history.

- View your shop-related activity.
- Track tab balances and repayments.
- See buying power informed by recorded behaviour.

*The exact features available depend on the account and the current demo data.*

## What problem are we solving?

Many spaza transactions happen informally, making it difficult for shop owners to keep consistent records of customer tabs and repayments. Customers may also lack a clear record of their repayment behaviour at an individual shop.

tapUP explores a simple digital alternative: record transactions, track repayment behaviour, and use that history to inform customer buying power.

## Features

- **Digital till:** Record shop sales using a phone.
- **Customer tabs:** Track purchases made on credit and outstanding balances.
- **Repayment tracking:** Record repayments and build transaction history.
- **Buying power:** Display buying power informed by recorded behaviour.
- **Mobile-friendly experience:** Support shop owners and customers through a digital workflow.

## What's simulated?

- **Payments:** Simulated. No real money is transferred.
- **SMS:** Simulated. Live SMS delivery is not guaranteed.
- **Buying power:** Uses preliminary prototype rules. It is not a formal credit score or lending decision.

## Technology stack

- Next.js and React
- TypeScript
- Supabase and PostgreSQL
- SQL schema and row-level security
- Vitest and Playwright
- Vercel

## Run locally

### Requirements

- Node.js
- npm
- A Supabase project configured for development

Clone the repository and install dependencies:

```bash
git clone https://github.com/yottabyte-java/tapUP.git
cd tapUP
npm install
```

Copy `.env.example` to `.env.local` and configure the required environment variables for your own Supabase project.

Start the development server:

```bash
npm run dev
```

Open http://localhost:3000.

For available test commands, see `package.json`.

## Limitations

tapUP is a hackathon MVP, not a production banking or lending platform. Buying-power rules require further validation before being used for real credit decisions. Initial user research was a seven-person pilot and should not be treated as representative market research. Payments and SMS are simulated.

## Project documentation

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
