# Agent 2: Database
<!-- WHY: the data model and the access rules ARE most of the security. Get them right once. -->
Role: SQL only. Do not touch app code.
Read first: 00_PROJECT_CONTEXT.md, docs/ARCHITECTURE.md, docs/HANDOFF.md

## Prompt per file

### FILE: supabase/schema.sql
Create these tables (Postgres, snake_case, uuid primary keys, created_at on all):
- profiles: id (= auth.users.id), role ('shop_owner' | 'customer'), full_name, phone
- shops: id, owner_id -> profiles, name
- shop_customers: id, shop_id, customer_profile_id (nullable, for smartphone customers),
  customer_phone (unique per shop), display_name, status ('active'|'blocked'),
  consent_at (timestamp, REQUIRED before any tab), pin_hash (nullable), failed_pin_attempts,
  locked_until, credit_limit_cents default 0
- sales: id, shop_id, shop_customer_id (nullable until linked), items jsonb, total_cents (> 0),
  method ('tab'|'demo_card'|'cash'|'pending'), status ('pending'|'approved'|'paid'|'repaid'|'expired'|'cancelled'),
  qr_token_hash, expires_at, approved_at, due_at
- repayments: id, sale_id, amount_cents, paid_at, on_time boolean
Add CHECK constraints, foreign keys with ON DELETE rules, and indexes for the ledger queries.
Comment every table with WHY it exists.

### FILE: supabase/rls.sql
Enable RLS on every table. Policies:
- Shop owner can read/write only rows for shops they own.
- Customer can read only their own shop_customers and sales rows.
- pin_hash, qr_token_hash, failed_pin_attempts and locked_until must NOT be readable from the
  client at all (use a secure view or column privileges; explain your choice in a comment).
- The lender API will use the service role on the server only; never expose that key to the client.
Comment each policy with the attack it prevents.

### FILE: supabase/seed.sql
- 1 demo shop "Demo Spaza", 2 judge accounts documented as placeholders (shop owner + customer);
  I will create the auth users in the Supabase dashboard, so the file maps them by email.
- 4 demo customers (Thabo M., Nomsa K., Sipho D., one brand new with no history).
- 30 days of realistic sales: Thabo frequent and always repays on time, Nomsa weekly with one
  LATE repayment, Sipho occasional, new customer none. Mix of cash and tab and demo_card.
- Everything labelled demo in names or a flag.

### FILE: tests/rls-checks.sql (optional, in supabase/)
Write 3 queries I can run as different users proving: shop A cannot read shop B's customers,
a customer cannot read another customer's sales, and pin_hash is unreadable.

## Done when
It runs clean on a fresh Supabase project and my 3 checks pass.
End with: files created, how I run them, what you were unsure about.
