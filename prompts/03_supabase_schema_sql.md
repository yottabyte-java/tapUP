# Prompt 03: supabase/schema.sql
Agent: 2 Database  |  Read first: docs/ARCHITECTURE.md
Paste first: 00_PROJECT_CONTEXT.md

## Prompt (copy everything in the box)
```text
Write supabase/schema.sql for Postgres. snake_case, uuid primary keys (gen_random_uuid()), created_at on every table.
Tables:
- profiles: id (= auth.users.id), role ('shop_owner'|'customer'), full_name, phone
- shops: id, owner_id -> profiles, name
- shop_customers: id, shop_id, customer_profile_id (nullable), customer_phone, display_name,
  status ('active'|'blocked'), consent_at (required before any tab), pin_hash (nullable),
  failed_pin_attempts int default 0, locked_until, credit_limit_cents int default 0; UNIQUE (shop_id, customer_phone)
- sales: id, shop_id, shop_customer_id (nullable), items jsonb, total_cents int CHECK (>0),
  method ('tab'|'demo_card'|'cash'|'pending'), status ('pending'|'approved'|'paid'|'repaid'|'expired'|'cancelled'),
  qr_token_hash, expires_at, used_at, approved_at, due_at
- repayments: id, sale_id, amount_cents CHECK (>0), paid_at, on_time boolean
Add foreign keys with sensible ON DELETE, CHECK constraints, and indexes for: ledger by shop, customer history by shop_customer, token lookup by hash.
Comment every table with WHY it exists. Money is always integer cents.

Rules: follow 00_PROJECT_CONTEXT.md. Comment WHY in code. Stay inside this file's scope; put other-agent notes in docs/HANDOFF.md.
When done, explain this file to me in 5 lines and tell me how to justify it if a judge asks.
```

## You should see
Runs without errors in the Supabase SQL editor on a fresh project. Tables appear in Table Editor.

## After it finishes
1. Run it, test it, read the diff. `git commit -m "<this file>"`.
2. If something is unclear, ask it: "Explain this file to me in 5 lines and how I justify it to a judge."
3. Paste its summary to Claude (chat) for review before the next prompt.
