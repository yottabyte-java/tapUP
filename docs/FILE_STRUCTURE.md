# tapUP target file structure (the Architect agent confirms this; agents 2-6 fill it in)
<!-- WHY: every file has an owner so agents do not overwrite each other. -->

```
tapup/
├─ package.json                       [0] Next.js scripts and dependencies
├─ package-lock.json                  [0] reproducible npm dependency versions
├─ next.config.ts                     [0] Next.js configuration
├─ tsconfig.json                      [0] TypeScript configuration and @/* alias
├─ eslint.config.mjs                  [0] ESLint configuration
├─ vitest.config.mts                  [0] Vitest config (pass with no tests before agent 3)
├─ app/
│  ├─ layout.tsx                      [4] root layout, font, PWA meta, theme
│  ├─ globals.css                     [0] Tailwind theme tokens and global styles
│  ├─ page.tsx                        [4] redirects: shop owner -> /shop/sell, customer -> /me
│  ├─ (auth)/login/page.tsx           [4] email + password login
│  ├─ (auth)/signup/page.tsx          [4] sign up as shop owner or customer
│  ├─ shop/sell/page.tsx              [4] SELL screen: scan, cart, charge
│  ├─ shop/ledger/page.tsx            [4] LEDGER screen: takings, tabs owed, customers
│  ├─ shop/customers/new/page.tsx     [4] add customer by phone + PIN (consent)
│  ├─ pay/[token]/page.tsx            [4] PAY screen: customer opens the sale QR
│  ├─ me/page.tsx                     [4] BUYING POWER screen
│  ├─ api/v1/buying-power/route.ts    [3] lender API demo
│  └─ api/health/route.ts             [6] uptime check
├─ components/
│  ├─ BarcodeScanner.tsx              [4] camera scan with manual fallback
│  ├─ Cart.tsx                        [4] cart list and total
│  ├─ SaleQr.tsx                      [4] QR for a sale token
│  ├─ LimitMeter.tsx                  [4] limit and progress to next level
│  ├─ WhyLimit.tsx                    [4] "why this limit" reasons
│  ├─ CustomerRow.tsx                 [4] ledger row
│  └─ DemoBanner.tsx                  [4] "demo data, simulated payments" footer
├─ lib/
│  ├─ money.ts                        [3] cents helpers, formatRand()
│  ├─ buyingPower.ts                  [3] scoring engine
│  ├─ forecast.ts                     [3] next-week spend forecast
│  ├─ pin.ts                          [3] hash and verify PINs, lockout logic
│  ├─ qr.ts                           [3] sale token create / verify (expiry, single use)
│  ├─ validation.ts                   [3] zod schemas for all inputs
│  ├─ rateLimit.ts                    [5] simple limiter for login/PIN
│  ├─ products.ts                     [4] demo product catalogue with barcodes
│  ├─ supabase/client.ts              [4] browser client
│  ├─ supabase/server.ts              [4] server client (cookies)
│  └─ actions/
│     ├─ auth.ts                      [4] signUp, signIn, signOut
│     ├─ sales.ts                     [4] createSale, requestTab, requestCash, approveTab, payCash, demoPay
│     ├─ tabs.ts                      [4] repayTab
│     └─ customers.ts                 [4] addCustomer, linkWithConsent, setCustomerPin, server-only verifyCustomerPin helper, setCustomerPin, server-only verifyCustomerPin helper
├─ middleware.ts                      [5] auth gate and security headers
├─ public/
│  ├─ manifest.webmanifest            [6] PWA manifest
│  └─ icons/ (192, 512)               [6] app icons
├─ supabase/
│  ├─ schema.sql                      [2] tables, constraints, indexes
│  ├─ rls.sql                         [2] row level security policies
│  └─ seed.sql                        [2] demo shop, customers, history
├─ tests/
│  ├─ buyingPower.test.ts             [3] scoring unit tests
│  ├─ forecast.test.ts                [3] forecast tests
│  ├─ qr.test.ts                      [3] expiry and single-use tests
│  └─ security.test.ts                [5] IDOR, lockout, validation tests
├─ docs/
│  ├─ DESIGN_SPEC.md                  [you] screen-by-screen spec of the 15 designs
│  ├─ design/ (15 PNG images)         [you] the designs
│  ├─ ARCHITECTURE.md                 [1] plan, flows, diagram, risks
│  ├─ HANDOFF.md                      [all] cross-agent notes
│  ├─ SECURITY_REVIEW.md              [5] checks and results
│  ├─ DEMO_SCRIPT.md                  [6] 90-second video script
│  └─ DECK.md                         [6] slide content
├─ scripts/smoke-test.md              [6] 10-step manual test
├─ .env.example                       [6] variable NAMES only
└─ README.md                          [6] run it, demo logins, what is simulated
```
Numbers in brackets = which agent writes the file.
