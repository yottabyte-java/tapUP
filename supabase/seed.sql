-- WHY: This repeatable seed gives the judge a clearly labelled, shop-scoped demo without real
-- customer phone numbers or changes to any other shop's data.
BEGIN;

DO $seed_demo$
DECLARE
  owner_email constant text := 'judge-owner@example.test';
  demo_shop_id constant uuid := 'd3000000-0000-4000-8000-000000000001';
  thabo_id constant uuid := 'd3000000-0000-4000-8000-000000000011';
  nomsa_id constant uuid := 'd3000000-0000-4000-8000-000000000012';
  sipho_id constant uuid := 'd3000000-0000-4000-8000-000000000013';
  new_customer_id constant uuid := 'd3000000-0000-4000-8000-000000000014';
  demo_pin_hash constant text := '$2b$10$c7.9pRKnnHbm4p8iiLoGWO3VeFWfBKxYX8l6phC0.UTyc1QNhtLue';
  owner_profile_id uuid;
BEGIN
  SELECT u.id
    INTO owner_profile_id
    FROM auth.users AS u
    WHERE lower(u.email) = lower(owner_email);

  IF owner_profile_id IS NULL THEN
    RAISE EXCEPTION
      'Create and confirm the shop-owner Auth user (%) before running this seed',
      owner_email;
  END IF;

  -- WHY: The seed can create the app profile for the dashboard-created Auth user, but never
  -- changes an existing user's chosen role or profile details.
  INSERT INTO public.profiles (id, role, full_name)
    VALUES (owner_profile_id, 'shop_owner', 'Demo Shop Owner')
    ON CONFLICT (id) DO NOTHING;

  IF NOT EXISTS (
    SELECT 1
      FROM public.profiles AS p
      WHERE p.id = owner_profile_id
        AND p.role = 'shop_owner'
  ) THEN
    RAISE EXCEPTION 'Auth user (%) must have the shop_owner profile role', owner_email;
  END IF;

  IF EXISTS (
    SELECT 1
      FROM public.shops AS s
      WHERE s.id = demo_shop_id
        AND s.owner_id <> owner_profile_id
  ) THEN
    RAISE EXCEPTION 'The reserved demo shop id belongs to a different owner';
  END IF;

  -- WHY: Remove only rows belonging to this fixed demo shop. Explicit child-first deletion
  -- avoids the sales-to-shop_customers RESTRICT foreign key blocking a shop-level cascade.
  DELETE FROM public.repayments AS r
    USING public.sales AS s
    WHERE r.sale_id = s.id
      AND s.shop_id = demo_shop_id;
  DELETE FROM public.sales
    WHERE shop_id = demo_shop_id;
  DELETE FROM public.shop_customers
    WHERE shop_id = demo_shop_id;
  DELETE FROM public.shops
    WHERE id = demo_shop_id;

  INSERT INTO public.shops (id, owner_id, name, created_at)
    VALUES (demo_shop_id, owner_profile_id, 'Mama''s Spaza (demo)', now());

  -- WHY: The records are phone-only demo customers with obviously fake numbers. Their demo PIN
  -- (2468) is stored as a bcrypt hash because the approval trigger requires a PIN hash.
  INSERT INTO public.shop_customers (
    id,
    shop_id,
    customer_phone,
    display_name,
    status,
    consent_at,
    pin_hash,
    credit_limit_cents,
    created_at
  )
  VALUES
    (thabo_id, demo_shop_id, '0000000001', 'Thabo M.', 'active',
      now() - interval '31 days', demo_pin_hash, 20000, now() - interval '31 days'),
    (nomsa_id, demo_shop_id, '0000000002', 'Nomsa K.', 'active',
      now() - interval '31 days', demo_pin_hash, 15000, now() - interval '31 days'),
    (sipho_id, demo_shop_id, '0000000003', 'Sipho D.', 'active',
      now() - interval '31 days', demo_pin_hash, 10000, now() - interval '31 days'),
    (new_customer_id, demo_shop_id, '0000000004', 'New Customer', 'active',
      now() - interval '31 days', NULL, 0, now() - interval '31 days');
END;
$seed_demo$;

-- WHY: The fixed demo rows are kept inline so reruns use the same sale IDs without any
-- session-scoped temp table that can disappear between statements or connections.

-- WHY: Each sale starts pending because the schema trigger requires normal state transitions;
-- the single basket item is explicitly demo-labelled and reconciles exactly to integer cents.
INSERT INTO public.sales (
  id,
  shop_id,
  shop_customer_id,
  items,
  total_cents,
  created_at
)
SELECT
  md5('tapup-demo-sale-' || d.sale_no)::uuid,
  'd3000000-0000-4000-8000-000000000001'::uuid,
  CASE d.customer_key
    WHEN 'thabo' THEN 'd3000000-0000-4000-8000-000000000011'::uuid
    WHEN 'nomsa' THEN 'd3000000-0000-4000-8000-000000000012'::uuid
    WHEN 'sipho' THEN 'd3000000-0000-4000-8000-000000000013'::uuid
  END,
  jsonb_build_array(jsonb_build_object(
    'productId', 'demo-grocery-basket',
    'name', 'Demo grocery basket',
    'unitPriceCents', d.total_cents,
    'qty', 1
  )),
  d.total_cents,
  date_trunc('minute', now()) - d.days_ago * interval '1 day'
FROM (
  VALUES
    ( 1, 29, 'thabo', 'demo_card', 3850, NULL::integer),
    ( 2, 27, 'thabo', 'cash',      2140, NULL::integer),
    ( 3, 26, 'nomsa', 'tab',       6800, 20),
    ( 4, 25, 'thabo', 'tab',       5200,  8),
    ( 5, 23, 'sipho', 'cash',      2480, NULL::integer),
    ( 6, 22, 'thabo', 'demo_card', 2990, NULL::integer),
    ( 7, 20, 'thabo', 'cash',      4850, NULL::integer),
    ( 8, 19, 'nomsa', 'demo_card', 4760, NULL::integer),
    ( 9, 18, 'thabo', 'tab',       3950,  8),
    (10, 17, 'sipho', 'tab',       7840, NULL::integer),
    (11, 15, 'thabo', 'cash',      2480, NULL::integer),
    (12,  7, 'nomsa', 'cash',      3190, NULL::integer),
    (13, 12, 'thabo', 'tab',       4600,  7),
    (14, 10, 'thabo', 'demo_card', 5390, NULL::integer),
    (15,  8, 'thabo', 'cash',      2270, NULL::integer),
    (16, 14, 'nomsa', 'tab',       5600,  5),
    (17,  6, 'thabo', 'tab',       3280,  3),
    (18,  5, 'thabo', 'demo_card', 3990, NULL::integer),
    (19,  3, 'nomsa', 'demo_card', 4550, NULL::integer),
    (20,  0, 'thabo', 'cash',      2670, NULL::integer)
) AS d (
  sale_no,
  days_ago,
  customer_key,
  method,
  total_cents,
  repayment_days_after_sale
);

-- WHY: Completed cash and simulated-card sales pass through the same paid-state invariants as
-- app-created sales; no actual payment or card data is represented.
UPDATE public.sales AS s
  SET method = d.method,
      status = 'paid',
      paid_now_cents = s.total_cents,
      paid_now_method = d.method,
      paid_now_confirmed_at = s.created_at + interval '1 minute',
      used_at = s.created_at + interval '1 minute'
  FROM (
    VALUES
      ( 1, 29, 'thabo', 'demo_card', 3850, NULL::integer),
      ( 2, 27, 'thabo', 'cash',      2140, NULL::integer),
      ( 5, 23, 'sipho', 'cash',      2480, NULL::integer),
      ( 6, 22, 'thabo', 'demo_card', 2990, NULL::integer),
      ( 7, 20, 'thabo', 'cash',      4850, NULL::integer),
      ( 8, 19, 'nomsa', 'demo_card', 4760, NULL::integer),
      (11, 15, 'thabo', 'cash',      2480, NULL::integer),
      (12,  7, 'nomsa', 'cash',      3190, NULL::integer),
      (14, 10, 'thabo', 'demo_card', 5390, NULL::integer),
      (15,  8, 'thabo', 'cash',      2270, NULL::integer),
      (18,  5, 'thabo', 'demo_card', 3990, NULL::integer),
      (19,  3, 'nomsa', 'demo_card', 4550, NULL::integer),
      (20,  0, 'thabo', 'cash',      2670, NULL::integer)
  ) AS d (
    sale_no,
    days_ago,
    customer_key,
    method,
    total_cents,
    repayment_days_after_sale
  )
  WHERE s.id = md5('tapup-demo-sale-' || d.sale_no)::uuid
    AND d.method IN ('demo_card', 'cash');

-- WHY: Tabs follow pending -> tab_requested -> approved so consent, PIN, limits, and tender
-- constraints are exercised instead of bypassed by seed inserts.
UPDATE public.sales AS s
  SET method = 'tab',
      tab_cents = s.total_cents,
      status = 'tab_requested',
      used_at = s.created_at + interval '1 minute'
  FROM (
    VALUES
      ( 3, 26, 'nomsa', 'tab', 6800, 20),
      ( 4, 25, 'thabo', 'tab', 5200,  8),
      ( 9, 18, 'thabo', 'tab', 3950,  8),
      (10, 17, 'sipho', 'tab', 7840, NULL::integer),
      (13, 12, 'thabo', 'tab', 4600,  7),
      (16, 14, 'nomsa', 'tab', 5600,  5),
      (17,  6, 'thabo', 'tab', 3280,  3)
  ) AS d (
    sale_no,
    days_ago,
    customer_key,
    method,
    total_cents,
    repayment_days_after_sale
  )
  WHERE s.id = md5('tapup-demo-sale-' || d.sale_no)::uuid;

UPDATE public.sales AS s
  SET status = 'approved',
      approved_at = s.created_at + interval '2 minutes',
      due_at = s.created_at + interval '14 days'
  FROM (
    VALUES
      ( 3, 26, 'nomsa', 'tab', 6800, 20),
      ( 4, 25, 'thabo', 'tab', 5200,  8),
      ( 9, 18, 'thabo', 'tab', 3950,  8),
      (10, 17, 'sipho', 'tab', 7840, NULL::integer),
      (13, 12, 'thabo', 'tab', 4600,  7),
      (16, 14, 'nomsa', 'tab', 5600,  5),
      (17,  6, 'thabo', 'tab', 3280,  3)
  ) AS d (
    sale_no,
    days_ago,
    customer_key,
    method,
    total_cents,
    repayment_days_after_sale
  )
  WHERE s.id = md5('tapup-demo-sale-' || d.sale_no)::uuid;

-- WHY: The repayment trigger still validates each balance and completes each paid tab. The
-- following timestamp update restores historical demo dates because the trigger uses now() for
-- live repayments; it makes Nomsa's one late repayment and Thabo's on-time record realistic.
INSERT INTO public.repayments (sale_id, amount_cents, on_time)
SELECT s.id, s.tab_cents, true
  FROM public.sales AS s
  JOIN (
    VALUES
      ( 3, 26, 'nomsa', 'tab', 6800, 20),
      ( 4, 25, 'thabo', 'tab', 5200,  8),
      ( 9, 18, 'thabo', 'tab', 3950,  8),
      (13, 12, 'thabo', 'tab', 4600,  7),
      (16, 14, 'nomsa', 'tab', 5600,  5),
      (17,  6, 'thabo', 'tab', 3280,  3)
  ) AS d (
    sale_no,
    days_ago,
    customer_key,
    method,
    total_cents,
    repayment_days_after_sale
  )
  ON s.id = md5('tapup-demo-sale-' || d.sale_no)::uuid
  WHERE d.repayment_days_after_sale IS NOT NULL;

UPDATE public.repayments AS r
  SET paid_at = s.created_at
        + d.repayment_days_after_sale * interval '1 day',
      on_time = s.created_at
        + d.repayment_days_after_sale * interval '1 day' <= s.due_at
  FROM public.sales AS s
  JOIN (
    VALUES
      ( 3, 26, 'nomsa', 'tab', 6800, 20),
      ( 4, 25, 'thabo', 'tab', 5200,  8),
      ( 9, 18, 'thabo', 'tab', 3950,  8),
      (13, 12, 'thabo', 'tab', 4600,  7),
      (16, 14, 'nomsa', 'tab', 5600,  5),
      (17,  6, 'thabo', 'tab', 3280,  3)
  ) AS d (
    sale_no,
    days_ago,
    customer_key,
    method,
    total_cents,
    repayment_days_after_sale
  )
  ON s.id = md5('tapup-demo-sale-' || d.sale_no)::uuid
  WHERE r.sale_id = s.id;

-- WHY: These assertions make a broken or incomplete demo seed fail loudly rather than leave
-- judges with misleading customer history.
DO $verify_demo$
DECLARE
  demo_shop_id constant uuid := 'd3000000-0000-4000-8000-000000000001';
  thabo_id constant uuid := 'd3000000-0000-4000-8000-000000000011';
  nomsa_id constant uuid := 'd3000000-0000-4000-8000-000000000012';
  sipho_id constant uuid := 'd3000000-0000-4000-8000-000000000013';
  new_customer_id constant uuid := 'd3000000-0000-4000-8000-000000000014';
BEGIN
  IF (SELECT count(*) FROM public.shop_customers WHERE shop_id = demo_shop_id) <> 4 THEN
    RAISE EXCEPTION 'Demo seed must create exactly four shop customers';
  END IF;

  IF (SELECT count(*) FROM public.sales WHERE shop_id = demo_shop_id) <> 20 THEN
    RAISE EXCEPTION 'Demo seed must create exactly twenty sales';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.sales WHERE shop_customer_id = new_customer_id
  ) THEN
    RAISE EXCEPTION 'The new demo customer must have no sales history';
  END IF;

  IF (
    SELECT count(*)
      FROM public.repayments AS r
      JOIN public.sales AS s ON s.id = r.sale_id
      WHERE s.shop_customer_id = nomsa_id
        AND NOT r.on_time
  ) <> 1 THEN
    RAISE EXCEPTION 'Nomsa must have exactly one late repayment';
  END IF;

  IF EXISTS (
    SELECT 1
      FROM public.repayments AS r
      JOIN public.sales AS s ON s.id = r.sale_id
      WHERE s.shop_customer_id = thabo_id
        AND NOT r.on_time
  ) THEN
    RAISE EXCEPTION 'Thabo''s demo repayments must all be on time';
  END IF;

  IF NOT EXISTS (
    SELECT 1
      FROM public.sales AS s
      WHERE s.shop_customer_id = sipho_id
        AND s.status = 'approved'
        AND s.due_at < now()
        AND NOT EXISTS (
          SELECT 1 FROM public.repayments AS r WHERE r.sale_id = s.id
        )
  ) THEN
    RAISE EXCEPTION 'Sipho must have one overdue unpaid demo tab';
  END IF;
END;
$verify_demo$;

COMMIT;
