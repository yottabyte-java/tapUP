-- Apply to an existing installation without recreating tables or changing grants.
-- WHY: Keep approval consistent with the documented TypeScript R50 floor.
CREATE OR REPLACE FUNCTION public.approve_tab_atomic(
  target_sale_id uuid,
  target_shop_customer_id uuid,
  target_shop_id uuid,
  expected_owner_id uuid,
  verified_pin_hash text,
  pin_was_supplied boolean,
  pin_was_verified boolean
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  sale_record public.sales%ROWTYPE;
  customer_record public.shop_customers%ROWTYPE;
  approval_now timestamptz;
  failure_count integer;
  lockout_until timestamptz;
  completed_count bigint;
  weighted_days bigint;
  weighted_spend bigint;
  weekly_spend bigint;
  late_count bigint;
  settled_tabs bigint;
  on_time_tabs bigint;
  score integer;
  calculated_limit integer;
  outstanding_cents bigint;
  request_tab_cents integer;
  due_time timestamptz;
BEGIN
  IF target_sale_id IS NULL OR target_shop_customer_id IS NULL OR target_shop_id IS NULL
    OR expected_owner_id IS NULL OR pin_was_supplied IS NULL OR pin_was_verified IS NULL
  THEN
    RETURN pg_catalog.jsonb_build_object('ok', false, 'error', 'invalid_input');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.profiles AS p
    WHERE p.id = expected_owner_id AND p.role = 'shop_owner'
  ) OR NOT EXISTS (
    SELECT 1 FROM public.shops AS sh
    WHERE sh.id = target_shop_id AND sh.owner_id = expected_owner_id
  ) THEN
    RETURN pg_catalog.jsonb_build_object('ok', false, 'error', 'forbidden');
  END IF;

  -- WHY: Lock the sale before the customer, matching the existing sale trigger's lock order.
  SELECT s.* INTO sale_record
  FROM public.sales AS s
  WHERE s.id = target_sale_id AND s.shop_id = target_shop_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RETURN pg_catalog.jsonb_build_object('ok', false, 'error', 'sale_or_customer_not_found');
  END IF;
  IF sale_record.status NOT IN ('pending', 'tab_requested') THEN
    RETURN pg_catalog.jsonb_build_object('ok', false, 'error', 'sale_not_approvable');
  END IF;
  IF sale_record.status = 'pending' AND sale_record.used_at IS NOT NULL THEN
    RETURN pg_catalog.jsonb_build_object('ok', false, 'error', 'sale_already_used');
  END IF;
  IF sale_record.status = 'tab_requested' AND sale_record.shop_customer_id <> target_shop_customer_id THEN
    RETURN pg_catalog.jsonb_build_object('ok', false, 'error', 'sale_customer_mismatch');
  END IF;
  IF sale_record.status = 'tab_requested' AND sale_record.used_at IS NULL THEN
    RETURN pg_catalog.jsonb_build_object('ok', false, 'error', 'sale_qr_invalid');
  END IF;

  SELECT sc.* INTO customer_record
  FROM public.shop_customers AS sc
  WHERE sc.id = target_shop_customer_id AND sc.shop_id = target_shop_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RETURN pg_catalog.jsonb_build_object('ok', false, 'error', 'sale_or_customer_not_found');
  END IF;
  -- WHY: Start the validity/scoring window after both rows are locked, not before a lock wait.
  approval_now := pg_catalog.clock_timestamp();
  IF sale_record.expires_at IS NOT NULL AND sale_record.expires_at <= approval_now THEN
    RETURN pg_catalog.jsonb_build_object('ok', false, 'error', 'sale_expired');
  END IF;
  IF customer_record.status <> 'active' OR customer_record.consent_at IS NULL THEN
    RETURN pg_catalog.jsonb_build_object('ok', false, 'error', 'customer_consent_required');
  END IF;

  IF customer_record.customer_profile_id IS NOT NULL THEN
    IF customer_record.owner_confirmed_at IS NULL THEN
      RETURN pg_catalog.jsonb_build_object('ok', false, 'error', 'customer_not_owner_confirmed');
    END IF;
    IF verified_pin_hash IS NOT NULL OR pin_was_supplied OR pin_was_verified THEN
      RETURN pg_catalog.jsonb_build_object('ok', false, 'error', 'unexpected_pin');
    END IF;
  ELSE
    IF customer_record.pin_hash IS NULL THEN
      RETURN pg_catalog.jsonb_build_object('ok', false, 'error', 'pin_required');
    END IF;
    IF NOT pin_was_supplied THEN
      RETURN pg_catalog.jsonb_build_object('ok', false, 'error', 'pin_required');
    END IF;
    IF verified_pin_hash IS DISTINCT FROM customer_record.pin_hash THEN
      RETURN pg_catalog.jsonb_build_object('ok', false, 'error', 'pin_state_changed');
    END IF;
    IF customer_record.locked_until IS NOT NULL AND customer_record.locked_until > approval_now THEN
      RETURN pg_catalog.jsonb_build_object('ok', false, 'error', 'pin_locked');
    END IF;
    IF NOT pin_was_verified THEN
      failure_count := CASE
        WHEN customer_record.locked_until IS NOT NULL THEN 1
        ELSE customer_record.failed_pin_attempts + 1
      END;
      lockout_until := CASE WHEN failure_count >= 5 THEN approval_now + interval '15 minutes' ELSE NULL END;
      UPDATE public.shop_customers AS sc
      SET failed_pin_attempts = LEAST(failure_count, 5),
          locked_until = lockout_until
      WHERE sc.id = customer_record.id AND sc.shop_id = target_shop_id;
      RETURN pg_catalog.jsonb_build_object(
        'ok', false,
        'error', CASE WHEN failure_count >= 5 THEN 'pin_locked' ELSE 'invalid_pin' END
      );
    END IF;
    UPDATE public.shop_customers AS sc
    SET failed_pin_attempts = 0, locked_until = NULL
    WHERE sc.id = customer_record.id AND sc.shop_id = target_shop_id;
  END IF;

  IF sale_record.status = 'tab_requested' AND sale_record.paid_now_cents > 0
    AND sale_record.paid_now_confirmed_at IS NULL
  THEN
    RETURN pg_catalog.jsonb_build_object('ok', false, 'error', 'immediate_payment_unconfirmed');
  END IF;

  -- WHY: This SQL mirrors calculateBuyingPower()'s 30-day UTC days, spend weights, score bands,
  -- repayment events, starter cap, late cap, and overdue suspension.
  WITH completed AS (
    SELECT s.*,
      CASE WHEN s.method = 'cash' THEN pg_catalog.floor(s.total_cents::numeric / 2)::bigint
        WHEN s.method = 'tab' THEN s.tab_cents::bigint + CASE
          WHEN s.paid_now_method = 'cash' THEN pg_catalog.floor(s.paid_now_cents::numeric / 2)::bigint
          ELSE s.paid_now_cents::bigint END
        ELSE s.total_cents::bigint END AS weighted_cents
    FROM public.sales AS s
    WHERE s.shop_id = target_shop_id AND s.shop_customer_id = target_shop_customer_id
      AND s.status IN ('approved', 'paid', 'repaid')
      AND s.created_at >= approval_now - interval '30 days' AND s.created_at <= approval_now
  ), day_weights AS (
    SELECT (c.created_at AT TIME ZONE 'UTC')::date AS purchase_day,
      pg_catalog.max(CASE WHEN c.method = 'cash' THEN 1 ELSE 2 END) AS weight
    FROM completed AS c GROUP BY (c.created_at AT TIME ZONE 'UTC')::date
  ), repayments_30d AS (
    SELECT r.sale_id, r.on_time
    FROM public.repayments AS r
    JOIN public.sales AS s ON s.id = r.sale_id
    WHERE s.shop_id = target_shop_id AND s.shop_customer_id = target_shop_customer_id
      AND r.paid_at >= approval_now - interval '30 days' AND r.paid_at <= approval_now
  ), settled AS (
    SELECT s.id,
      pg_catalog.bool_and(r.on_time) AS on_time
    FROM public.sales AS s
    JOIN repayments_30d AS r ON r.sale_id = s.id
    WHERE s.shop_id = target_shop_id AND s.shop_customer_id = target_shop_customer_id
      AND s.method = 'tab' AND s.status = 'repaid'
    GROUP BY s.id
  ), metrics AS (
    SELECT
      (SELECT pg_catalog.count(*) FROM completed) AS purchase_count,
      (SELECT COALESCE(pg_catalog.sum(weight), 0) FROM day_weights) AS day_halves,
      (SELECT COALESCE(pg_catalog.sum(weighted_cents), 0) FROM completed) AS weighted_total,
      (SELECT pg_catalog.count(*) FROM repayments_30d WHERE NOT on_time) AS late_total,
      (SELECT pg_catalog.count(*) FROM settled) AS settled_total,
      (SELECT pg_catalog.count(*) FROM settled WHERE on_time) AS on_time_total
  )
  SELECT m.purchase_count, m.day_halves, m.weighted_total,
    m.late_total, m.settled_total, m.on_time_total
  INTO completed_count, weighted_days, weighted_spend, late_count, settled_tabs, on_time_tabs
  FROM metrics AS m;

  weekly_spend := pg_catalog.floor(weighted_spend::numeric / 30 * 7 + 0.5)::bigint;
  score := LEAST(100, GREATEST(0,
    CASE WHEN weighted_days = 0 THEN 0 WHEN weighted_days = 1 THEN 5
      WHEN weighted_days <= 6 THEN 10 WHEN weighted_days <= 14 THEN 20
      WHEN weighted_days <= 28 THEN 30 ELSE 40 END
    + CASE WHEN weekly_spend < 10000 THEN 0 WHEN weekly_spend < 25000 THEN 10
      WHEN weekly_spend < 50000 THEN 20 ELSE 30 END
    + CASE WHEN settled_tabs = 0 THEN 15
      ELSE pg_catalog.round(on_time_tabs::numeric * 30 / settled_tabs)::integer END
    - (late_count * 5)::integer
  ));
  IF completed_count = 1 THEN score := LEAST(score, 19); END IF;

  calculated_limit := CASE WHEN score >= 80 THEN 30000 WHEN score >= 65 THEN 25000
    WHEN score >= 50 THEN 20000 WHEN score >= 35 THEN 15000 WHEN score >= 20 THEN 10000
    WHEN score >= 10 THEN 5000 ELSE 0 END;
  IF completed_count = 0 THEN calculated_limit := 0;
  ELSIF completed_count = 1 THEN calculated_limit := 5000;
  ELSE calculated_limit := GREATEST(calculated_limit, 5000);
  END IF;
  -- WHY: Match the TypeScript starter floor even when late penalties reduce the score below 10.
  IF late_count >= 2 THEN calculated_limit := LEAST(calculated_limit, 5000); END IF;

  IF EXISTS (
    SELECT 1 FROM public.sales AS s
    WHERE s.shop_id = target_shop_id AND s.shop_customer_id = target_shop_customer_id
      AND s.method = 'tab' AND s.status = 'approved' AND s.due_at < approval_now
      AND s.tab_cents > COALESCE((
        SELECT pg_catalog.sum(r.amount_cents)::bigint
        FROM public.repayments AS r WHERE r.sale_id = s.id
      ), 0)
  ) THEN calculated_limit := 0; END IF;

  SELECT COALESCE(pg_catalog.sum(s.tab_cents::bigint - COALESCE(r.repaid_cents, 0)), 0)
  INTO outstanding_cents
  FROM public.sales AS s
  LEFT JOIN (
    SELECT r.sale_id, pg_catalog.sum(r.amount_cents)::bigint AS repaid_cents
    FROM public.repayments AS r GROUP BY r.sale_id
  ) AS r ON r.sale_id = s.id
  WHERE s.shop_id = target_shop_id AND s.shop_customer_id = target_shop_customer_id
    AND s.status = 'approved';

  IF sale_record.expires_at IS NOT NULL AND sale_record.expires_at <= pg_catalog.clock_timestamp() THEN
    RETURN pg_catalog.jsonb_build_object('ok', false, 'error', 'sale_expired');
  END IF;

  request_tab_cents := CASE WHEN sale_record.status = 'tab_requested'
    THEN sale_record.tab_cents ELSE sale_record.total_cents END;
  IF request_tab_cents <= 0 OR request_tab_cents::bigint > calculated_limit::bigint - outstanding_cents THEN
    RETURN pg_catalog.jsonb_build_object('ok', false, 'error', 'insufficient_buying_power');
  END IF;

  UPDATE public.shop_customers AS sc
  SET credit_limit_cents = calculated_limit
  WHERE sc.id = target_shop_customer_id AND sc.shop_id = target_shop_id;

  IF sale_record.status = 'pending' THEN
    UPDATE public.sales AS s
    SET shop_customer_id = target_shop_customer_id,
        method = 'tab', paid_now_cents = 0, tab_cents = sale_record.total_cents,
        paid_now_method = NULL, status = 'tab_requested'
    WHERE s.id = target_sale_id AND s.shop_id = target_shop_id AND s.status = 'pending';
    IF NOT FOUND THEN RAISE EXCEPTION 'Tab request transition failed'; END IF;
  END IF;

  due_time := approval_now + interval '14 days';
  UPDATE public.sales AS s
  SET status = 'approved', approved_at = approval_now, due_at = due_time
  WHERE s.id = target_sale_id AND s.shop_id = target_shop_id
    AND s.shop_customer_id = target_shop_customer_id AND s.status = 'tab_requested';
  IF NOT FOUND THEN RAISE EXCEPTION 'Tab approval transition failed'; END IF;

  RETURN pg_catalog.jsonb_build_object(
    'ok', true, 'saleId', target_sale_id, 'dueAt', due_time, 'limitCents', calculated_limit
  );
END;
$$;

REVOKE ALL ON FUNCTION public.approve_tab_atomic(uuid, uuid, uuid, uuid, text, boolean, boolean)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.approve_tab_atomic(uuid, uuid, uuid, uuid, text, boolean, boolean)
  TO service_role;
