-- WHY: Recheck QR expiry only after the sale and customer rows are locked, closing lock-wait expiry races.
CREATE OR REPLACE FUNCTION public.enforce_sale_state_transition()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  customer_record public.shop_customers%ROWTYPE;
  outstanding_cents bigint;
  cash_received_at timestamptz;
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.status <> 'pending'
      OR NEW.method <> 'pending'
      OR NEW.paid_now_cents <> 0
      OR NEW.tab_cents <> 0
      OR NEW.paid_now_method IS NOT NULL
      OR NEW.paid_now_confirmed_at IS NOT NULL
      OR NEW.used_at IS NOT NULL
      OR NEW.approved_at IS NOT NULL
      OR NEW.due_at IS NOT NULL
    THEN
      RAISE EXCEPTION 'A new sale must begin in the pending state';
    END IF;

    RETURN NEW;
  END IF;

  IF NEW.shop_id IS DISTINCT FROM OLD.shop_id
    OR NEW.items IS DISTINCT FROM OLD.items
    OR NEW.total_cents IS DISTINCT FROM OLD.total_cents
    OR NEW.qr_token_hash IS DISTINCT FROM OLD.qr_token_hash
    OR NEW.expires_at IS DISTINCT FROM OLD.expires_at
  THEN
    RAISE EXCEPTION 'Sale identity, items, total, and QR expiry are immutable';
  END IF;

  IF OLD.used_at IS NOT NULL AND NEW.used_at IS DISTINCT FROM OLD.used_at THEN
    RAISE EXCEPTION 'A sale QR can only be used once';
  END IF;

  IF OLD.status = 'pending'
    AND OLD.method = 'pending'
    AND NEW.method = 'cash'
    AND NEW.used_at IS NULL
  THEN
    NEW.used_at := now();
  END IF;

  IF OLD.status <> 'pending'
    AND NEW.shop_customer_id IS DISTINCT FROM OLD.shop_customer_id
  THEN
    RAISE EXCEPTION 'A customer cannot be changed after a sale request';
  END IF;

  IF OLD.status = NEW.status THEN
    IF NEW.paid_now_cents IS DISTINCT FROM OLD.paid_now_cents
      OR NEW.tab_cents IS DISTINCT FROM OLD.tab_cents
      OR NEW.paid_now_method IS DISTINCT FROM OLD.paid_now_method
      OR NEW.method IS DISTINCT FROM OLD.method
      OR NEW.used_at IS DISTINCT FROM OLD.used_at
      OR NEW.approved_at IS DISTINCT FROM OLD.approved_at
      OR NEW.due_at IS DISTINCT FROM OLD.due_at
      OR NEW.paid_now_confirmed_at IS DISTINCT FROM OLD.paid_now_confirmed_at
    THEN
      IF NOT (
        OLD.status = 'pending'
        AND OLD.method = 'pending'
        AND NEW.method = 'cash'
        AND NEW.status = 'pending'
        AND NEW.paid_now_cents = NEW.total_cents
        AND NEW.tab_cents = 0
        AND NEW.paid_now_method = 'cash'
        AND OLD.used_at IS NULL
        AND NEW.used_at IS NOT NULL
        AND NEW.paid_now_confirmed_at IS NULL
      ) AND NOT (
        OLD.status = 'tab_requested'
        AND OLD.paid_now_cents > 0
        AND OLD.paid_now_confirmed_at IS NULL
        AND NEW.paid_now_cents = OLD.paid_now_cents
        AND NEW.tab_cents = OLD.tab_cents
        AND NEW.paid_now_method = OLD.paid_now_method
        AND NEW.method = OLD.method
        AND NEW.used_at = OLD.used_at
        AND NEW.approved_at = OLD.approved_at
        AND NEW.due_at = OLD.due_at
        AND NEW.paid_now_confirmed_at IS NOT NULL
      ) THEN
        RAISE EXCEPTION 'Tender can only be selected once while a sale is pending';
      END IF;
    END IF;
  ELSE
    IF NOT (
      (OLD.status = 'pending' AND NEW.status IN (
        'tab_requested', 'paid', 'expired', 'cancelled'
      ))
      OR (OLD.status = 'tab_requested' AND NEW.status IN (
        'approved', 'expired', 'cancelled'
      ))
      OR (OLD.status = 'approved' AND NEW.status = 'repaid')
    ) THEN
      RAISE EXCEPTION 'Invalid sale status transition: % to %', OLD.status, NEW.status;
    END IF;

    IF OLD.status = 'tab_requested'
      AND (
        NEW.method IS DISTINCT FROM OLD.method
        OR NEW.paid_now_cents IS DISTINCT FROM OLD.paid_now_cents
        OR NEW.tab_cents IS DISTINCT FROM OLD.tab_cents
        OR NEW.paid_now_method IS DISTINCT FROM OLD.paid_now_method
        OR NEW.shop_customer_id IS DISTINCT FROM OLD.shop_customer_id
      )
    THEN
      RAISE EXCEPTION 'A tab request cannot be changed during approval';
    END IF;

    IF OLD.status = 'approved'
      AND (
        NEW.method IS DISTINCT FROM OLD.method
        OR NEW.paid_now_cents IS DISTINCT FROM OLD.paid_now_cents
        OR NEW.tab_cents IS DISTINCT FROM OLD.tab_cents
        OR NEW.paid_now_method IS DISTINCT FROM OLD.paid_now_method
        OR NEW.paid_now_confirmed_at IS DISTINCT FROM OLD.paid_now_confirmed_at
        OR NEW.shop_customer_id IS DISTINCT FROM OLD.shop_customer_id
        OR NEW.approved_at IS DISTINCT FROM OLD.approved_at
        OR NEW.due_at IS DISTINCT FROM OLD.due_at
      )
    THEN
      RAISE EXCEPTION 'An approved tab cannot be altered when it is settled';
    END IF;

    IF NEW.status IN ('expired', 'cancelled')
      AND (
        NEW.method IS DISTINCT FROM OLD.method
        OR NEW.paid_now_cents IS DISTINCT FROM OLD.paid_now_cents
        OR NEW.tab_cents IS DISTINCT FROM OLD.tab_cents
        OR NEW.paid_now_method IS DISTINCT FROM OLD.paid_now_method
        OR NEW.paid_now_confirmed_at IS DISTINCT FROM OLD.paid_now_confirmed_at
        OR NEW.shop_customer_id IS DISTINCT FROM OLD.shop_customer_id
      )
    THEN
      RAISE EXCEPTION 'An expired or cancelled sale cannot change its tender';
    END IF;

    IF NEW.status IN ('tab_requested', 'approved', 'paid') AND NEW.used_at IS NULL THEN
      NEW.used_at := now();
    END IF;

  END IF;

  IF NEW.status IN ('tab_requested', 'approved', 'repaid')
    AND NEW.shop_customer_id IS DISTINCT FROM OLD.shop_customer_id
  THEN
    IF NEW.shop_customer_id IS NULL THEN
      RAISE EXCEPTION 'A tab requires a linked shop customer';
    END IF;
  END IF;

  IF NEW.status IN ('tab_requested', 'approved') THEN
    SELECT *
      INTO customer_record
      FROM public.shop_customers AS sc
      WHERE sc.id = NEW.shop_customer_id
        AND sc.shop_id = NEW.shop_id
      FOR UPDATE;

    IF NOT FOUND
      OR customer_record.status <> 'active'
      OR customer_record.consent_at IS NULL
    THEN
      RAISE EXCEPTION 'An active customer with recorded consent is required for a tab';
    END IF;

    IF NEW.status = 'approved' THEN
      IF NEW.paid_now_cents > 0 AND NEW.paid_now_confirmed_at IS NULL THEN
        RAISE EXCEPTION 'The immediate payment must be confirmed before tab approval';
      END IF;

      IF customer_record.customer_profile_id IS NOT NULL
        AND customer_record.owner_confirmed_at IS NULL
      THEN
        RAISE EXCEPTION 'The shop owner must confirm the linked customer before approval';
      END IF;

      IF customer_record.customer_profile_id IS NULL
        AND customer_record.pin_hash IS NULL
      THEN
        RAISE EXCEPTION 'A PIN must be set before approving a phone-only customer';
      END IF;

      SELECT COALESCE(
        sum(s.tab_cents - COALESCE(r.repaid_cents, 0)),
        0
      )
        INTO outstanding_cents
        FROM public.sales AS s
        LEFT JOIN (
          SELECT sale_id, sum(amount_cents) AS repaid_cents
          FROM public.repayments
          GROUP BY sale_id
        ) AS r ON r.sale_id = s.id
        WHERE s.shop_id = NEW.shop_id
          AND s.shop_customer_id = NEW.shop_customer_id
          AND s.status = 'approved'
          AND s.id <> NEW.id;

      IF NEW.tab_cents > greatest(
        0,
        customer_record.credit_limit_cents::bigint - outstanding_cents
      ) THEN
        RAISE EXCEPTION 'Tab exceeds the available buying-power limit';
      END IF;
    END IF;
  END IF;

  -- WHY: Check QR expiry after acquiring the sale and customer locks so a request queued before
  -- expiry cannot consume the QR or settle a sale after its five-minute window has ended.
  IF OLD.qr_token_hash IS NOT NULL
    AND OLD.used_at IS NULL
    AND (
      NEW.status IN ('tab_requested', 'approved', 'paid')
      OR (
        OLD.status = 'pending'
        AND OLD.method = 'pending'
        AND NEW.method = 'cash'
      )
    )
  THEN
    IF NEW.shop_customer_id IS NOT NULL THEN
      PERFORM sc.id
      FROM public.shop_customers AS sc
      WHERE sc.id = NEW.shop_customer_id
        AND sc.shop_id = NEW.shop_id
      FOR KEY SHARE;
    END IF;

    IF OLD.expires_at <= pg_catalog.clock_timestamp() THEN
      RAISE EXCEPTION 'Sale QR has expired' USING ERRCODE = 'P0001';
    END IF;
  END IF;

  -- WHY: UPDATE has locked the sale, and split tender has now locked its customer.
  -- Transaction/app timestamps can predate those waits; decide using the live DB clock.
  IF OLD.paid_now_confirmed_at IS NULL
    AND NEW.paid_now_confirmed_at IS NOT NULL
    AND NEW.paid_now_method = 'cash'
  THEN
    -- WHY: A full cash sale may attach a customer. Its FK check can wait after this
    -- BEFORE trigger, so acquire that reference lock before the authoritative clock check.
    IF NEW.status = 'paid' AND NEW.shop_customer_id IS NOT NULL THEN
      PERFORM id FROM public.shop_customers
        WHERE id = NEW.shop_customer_id AND shop_id = NEW.shop_id
        FOR KEY SHARE;
    END IF;
    cash_received_at := pg_catalog.clock_timestamp();
    IF OLD.expires_at IS NOT NULL AND OLD.expires_at <= cash_received_at THEN
      RAISE EXCEPTION 'Cash request has expired' USING ERRCODE = 'P0001';
    END IF;
    -- WHY: The ledger records the authoritative receipt time, not the pre-lock app time.
    NEW.paid_now_confirmed_at := cash_received_at;
  END IF;

  RETURN NEW;
END;
$$;
