# Agent 4: Frontend and wiring
<!-- WHY: this is the product judges will touch. Smallest set of screens, finished, beats a big half-built app. -->
Role: UI, server actions and wiring. Do not change SQL or scoring rules (ask via docs/HANDOFF.md).
Read first: 00_PROJECT_CONTEXT.md, docs/ARCHITECTURE.md, docs/FILE_STRUCTURE.md, docs/HANDOFF.md
Designs to match: docs/DESIGN_SPEC.md (and the 15 images in docs/design/). Read the spec AND look at the images.
Older prototype (reference only): https://claude.ai/artifact/BETH5EudJovJrQi17YzxbH
Do NOT restyle, add screens or add features. The images are mock-ups: copy layout, text and behaviour, but every number comes from the backend. Follow the 'Decisions already made' list at the bottom of DESIGN_SPEC.md. Mobile first at 390px, installable PWA.

## Build order (a working slice first)
1. Project setup and auth  2. Sell + Pay with shop QR  3. Buying power  4. Ledger
5. Phone + PIN flow  6. Polish states. Commit after each.

## Prompt per file

### FILE: lib/supabase/client.ts and lib/supabase/server.ts
Standard Supabase SSR clients. Server client reads cookies. Only the anon key in the browser.

### FILE: lib/products.ts
A small demo catalogue (about 12 spaza items: maize meal, cooking oil, sugar, bread, milk,
airtime-free items only) with barcodes, names, prices in cents. Labelled demo.

### FILE: app/page.tsx (splash 01)
Build design 01 at `/` for logged-out visitors; logged-in users go to their home screen.

### FILE: app/(auth)/login/page.tsx and signup/page.tsx (designs 02, 03)
Email + password via Supabase Auth. Signup asks: shop owner or customer (role cards). Clear errors. No jargon.

### FILE: app/shop/sell/page.tsx  (SELL screen, designs 04, 05, 06)
Shop name, camera barcode scan (html5-qrcode) with manual add as fallback, cart with quantities,
total, big "Charge customer" button. If the camera is denied, show the manual add list instead.

### FILE: components/BarcodeScanner.tsx, Cart.tsx, SaleQr.tsx
Scanner calls back with a barcode. Cart shows lines and total in rands. SaleQr renders the
pay link as a QR (qrcode.react) with a visible countdown to expiry.

### FILE: lib/actions/sales.ts
Server actions: createSale (creates pending sale + token), approveTab (shopkeeper approval, checks
amount <= limit, writes status), payCash, demoPay (marks demo card/wallet as paid, labelled
simulated). Validate with zod, check ownership with the session, never trust client totals
(recompute total from items on the server).

### FILE: app/pay/[token]/page.tsx  (PAY screen, designs 08 and 09)
Customer opens the QR link. Shows total due, "Available buying power", "Put R__ on tab" (only up
to the limit), the remainder payable by demo card/wallet or cash. Footnote: "Payments are simulated in this demo."
Handle expired or used tokens with a friendly message.

### FILE: app/me/page.tsx, components/LimitMeter.tsx, WhyLimit.tsx  (BUYING POWER screen, design 10)
Limit, progress bar to the next level, "Why this limit" from explainLimit(), and one line from
forecast.ts ("You may need a tab around month end"). Plain language only.

### FILE: app/shop/ledger/page.tsx, components/CustomerRow.tsx  (LEDGER screen, designs 11 and 14)
Today's takings, tabs owed, customer list with limits and balances, "New sale" button, and a
"Mark repaid" action (lib/actions/tabs.ts) that records on-time or late from the due date.

### FILE: app/shop/customers/new/page.tsx + lib/actions/customers.ts (designs 12 and 13)
Add a customer by phone number and name, show a POPIA consent text, require the tick, then the
customer enters a 4-digit PIN on this phone. Server hashes it. Show the PIN-approval step when
a tab is charged to that customer.

### FILE: components/DemoBanner.tsx, app/layout.tsx
Footer or banner: "Demo data. Payments are simulated." PWA meta tags, DM Sans, dark theme tokens.

## Every screen needs
Loading, empty and error states; tap targets 44px+; one clear next action; no jargon; works offline-tolerant (show a retry, do not crash).

## Done when
The full path works in the browser on a phone: add items, charge, QR, customer approves tab,
limit updates after a repayment, ledger shows it. End with: files changed, the test steps, known gaps.
