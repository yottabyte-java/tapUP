-- Run each numbered block separately after replacing every <...> value with a real UUID.
-- WHY: The checks set the authenticated role and JWT claims so Supabase RLS is evaluated as
-- the selected user instead of the SQL editor's privileged postgres role.

-- 1. Shop A must not read Shop B's customers or sales.
-- Setup: Replace <SHOP_B_UUID> and <SHOP_A_OWNER_PROFILE_UUID>; both shops need at least one
-- customer and sale. Baseline counts are captured before switching to the authenticated role.
-- PASS: both visible counts are 0.
-- FAIL: either visible count is greater than 0, or the fixture rows do not exist.
BEGIN;
SELECT set_config(
  'tapup.rls_check.shop_b_customers',
  (SELECT count(*)::text FROM public.shop_customers
   WHERE shop_id = '<SHOP_B_UUID>'::uuid),
  true
);
SELECT set_config(
  'tapup.rls_check.shop_b_sales',
  (SELECT count(*)::text FROM public.sales
   WHERE shop_id = '<SHOP_B_UUID>'::uuid),
  true
);
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '<SHOP_A_OWNER_PROFILE_UUID>', true);
SELECT set_config(
  'request.jwt.claims',
  json_build_object(
    'sub', '<SHOP_A_OWNER_PROFILE_UUID>',
    'role', 'authenticated'
  )::text,
  true
);

WITH visible_rows AS (
  SELECT
    (SELECT count(*)
       FROM public.shop_customers
       WHERE shop_id = '<SHOP_B_UUID>'::uuid) AS customers_visible,
    (SELECT count(*)
       FROM public.sales
       WHERE shop_id = '<SHOP_B_UUID>'::uuid) AS sales_visible
)
SELECT
  customers_visible,
  sales_visible,
  CASE
    WHEN current_setting('tapup.rls_check.shop_b_customers')::integer = 0
      OR current_setting('tapup.rls_check.shop_b_sales')::integer = 0
      THEN 'FAIL: Shop B test fixtures are missing'
    WHEN customers_visible = 0 AND sales_visible = 0 THEN 'PASS'
    ELSE 'FAIL: Shop A can read Shop B data'
  END AS result
FROM visible_rows;
ROLLBACK;

-- 2. A customer must not read another customer's sales in the same shop.
-- Setup: Link the logged-in test customer to <OWN_CUSTOMER_ROW_UUID> with the consent RPC,
-- and ensure <OTHER_CUSTOMER_ROW_UUID> has at least one sale in that same shop.
-- PASS: own_sales_visible is greater than 0 and other_sales_visible is 0.
-- FAIL: own_sales_visible is 0 (fixture/link missing) or other_sales_visible is greater than 0.
BEGIN;
SELECT set_config(
  'tapup.rls_check.other_customer_sales',
  (SELECT count(*)::text FROM public.sales
   WHERE shop_customer_id = '<OTHER_CUSTOMER_ROW_UUID>'::uuid),
  true
);
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '<CUSTOMER_PROFILE_UUID>', true);
SELECT set_config(
  'request.jwt.claims',
  json_build_object(
    'sub', '<CUSTOMER_PROFILE_UUID>',
    'role', 'authenticated'
  )::text,
  true
);

WITH visible_rows AS (
  SELECT
    (SELECT count(*)
       FROM public.sales
       WHERE shop_customer_id = '<OWN_CUSTOMER_ROW_UUID>'::uuid) AS own_sales_visible,
    (SELECT count(*)
       FROM public.sales
       WHERE shop_customer_id = '<OTHER_CUSTOMER_ROW_UUID>'::uuid) AS other_sales_visible
)
SELECT
  own_sales_visible,
  other_sales_visible,
  CASE
    WHEN current_setting('tapup.rls_check.other_customer_sales')::integer = 0
      THEN 'FAIL: other-customer sale fixture is missing'
    WHEN own_sales_visible > 0 AND other_sales_visible = 0 THEN 'PASS'
    WHEN own_sales_visible = 0 THEN 'FAIL: own-customer fixture is missing or not linked'
    ELSE 'FAIL: customer can read another customer''s sales'
  END AS result
FROM visible_rows;
ROLLBACK;

-- 3. The authenticated client role must not have SELECT permission on pin_hash.
-- Run as an authenticated shop owner or customer; this checks the column grant directly without
-- attempting a query that should abort with permission denied.
-- PASS: can_read_pin_hash is false.
-- FAIL: can_read_pin_hash is true.
BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '<AUTHENTICATED_PROFILE_UUID>', true);
SELECT set_config(
  'request.jwt.claims',
  json_build_object(
    'sub', '<AUTHENTICATED_PROFILE_UUID>',
    'role', 'authenticated'
  )::text,
  true
);

SELECT
  has_column_privilege(
    current_user,
    'public.shop_customers',
    'pin_hash',
    'SELECT'
  ) AS can_read_pin_hash,
  CASE
    WHEN has_column_privilege(
      current_user,
      'public.shop_customers',
      'pin_hash',
      'SELECT'
    ) THEN 'FAIL: authenticated role can read pin_hash'
    ELSE 'PASS'
  END AS result;
ROLLBACK;
