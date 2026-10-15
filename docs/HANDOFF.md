# Handoff notes

## For Database

- `supabase/schema.sql` records split tender with `tab_cents`, `paid_now_cents`,
  `paid_now_method`, and `paid_now_confirmed_at`; approved/paid portions must sum to
  `total_cents`, and repayments apply only to `tab_cents`.
- Customer profiles use email/password, not verified phone OTP. A phone match alone is not
  identity proof; only allow an authenticated customer to link their own profile, record
  consent, and require owner confirmation before tab approval.
- A smartphone tab request moves from `pending` to `tab_requested`, then owner approval moves
  it to `approved`. A cash choice remains pending until owner confirmation. The schema
  constrains transitions, expiry, tender totals, available limit, consent, and single use;
  frontend actions must still authorize the caller and use conditional writes.
- Keep `pin_hash`, QR token hashes, and lockout fields inaccessible through client reads;
  every application table needs RLS. See `docs/ARCHITECTURE.md`.

## For Scoring

- Follow `docs/DESIGN_SPEC.md`: R50 increments, R300 cap, and a new customer starts at R0
  until their first completed purchase. Treat limits and history per shop.
- Keep an approved tab’s outstanding balance separate from the amount paid at checkout.
  Count one mixed-tender purchase once; cash purchases carry the agreed lower score weight.

## For Frontend

- Show pending tab/cash requests to the owner and require explicit approval/receipt confirmation.
  No tab is automatic; a customer-side “verified PIN” boolean is never trusted.
- Support smartphone customers opening a QR only when signed in and linked to that shop.
  Phone-only customers enter PIN on the owner’s device.
- The first working slice is project setup/auth, then a complete shop-QR sale and Pay path.

## For Security

- Verify the phone-only PIN in the same server-side operation that approves the tab, or bind
  verification to a secure one-use server proof; never trust a client-supplied success flag.
- Enforce split tender, shop ownership, available-limit and single-use QR checks atomically.
  See `docs/ARCHITECTURE.md` for route permissions and demo API boundaries.

## For Release

- Required environment variable names are listed in `docs/ARCHITECTURE.md` and
  `.env.example`; keep secrets server-only and keep `.env.local` ignored.
- Check `/api/health` and both judge logins before presenting. If live services fail, use a
  clearly labelled recording/screenshots rather than presenting a fabricated live success.
