-- WHY: This is the relational source of truth for shop-scoped sales, consent, and tab history.

-- WHY: A profile gives each authenticated user one server-enforced application role.
CREATE TABLE public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users (id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('shop_owner', 'customer')),
  full_name text NOT NULL CHECK (length(trim(full_name)) BETWEEN 1 AND 120),
  phone text CHECK (phone IS NULL OR length(phone) BETWEEN 7 AND 20),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.profiles IS
  'WHY: Stores the minimum role and account details associated with each Supabase Auth user.';

-- WHY: A shop is the ownership boundary for its customers, sales, and buying-power limits.
CREATE TABLE public.shops (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  name text NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 120),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.shops IS
  'WHY: Establishes the shop ownership boundary used to isolate customers, sales, and limits.';

-- WHY: This join stores consent and a separate buying-power record for each shop/customer pair.
CREATE TABLE public.shop_customers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id uuid NOT NULL REFERENCES public.shops (id) ON DELETE CASCADE,
  customer_profile_id uuid REFERENCES public.profiles (id) ON DELETE SET NULL,
  customer_phone text NOT NULL CHECK (length(customer_phone) BETWEEN 7 AND 20),
  display_name text NOT NULL CHECK (length(trim(display_name)) BETWEEN 1 AND 120),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'blocked')),
  consent_at timestamptz,
  owner_confirmed_at timestamptz,
  pin_hash text,
  failed_pin_attempts integer NOT NULL DEFAULT 0
    CHECK (failed_pin_attempts BETWEEN 0 AND 5),
  locked_until timestamptz,
  credit_limit_cents integer NOT NULL DEFAULT 0
    CHECK (
      credit_limit_cents BETWEEN 0 AND 30000
      AND credit_limit_cents % 5000 = 0
    ),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT shop_customers_shop_phone_unique UNIQUE (shop_id, customer_phone),
  CONSTRAINT shop_customers_shop_id_id_unique UNIQUE (shop_id, id),
  CONSTRAINT shop_customers_shop_profile_unique UNIQUE (shop_id, customer_profile_id),
  CONSTRAINT shop_customers_link_requires_consent
    CHECK (customer_profile_id IS NULL OR consent_at IS NOT NULL),
  CONSTRAINT shop_customers_lock_requires_five_attempts
    CHECK (locked_until IS NULL OR failed_pin_attempts = 5)
);
COMMENT ON TABLE public.shop_customers IS
  'WHY: Stores shop-specific customer consent, PIN state, and buying power without cross-shop scoring.';

-- WHY: A sale captures its price and one-use QR state before a customer chooses how to pay.
CREATE TABLE public.sales (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id uuid NOT NULL REFERENCES public.shops (id) ON DELETE CASCADE,
  shop_customer_id uuid,
  items jsonb NOT NULL CHECK (jsonb_typeof(items) = 'array'),
  total_cents integer NOT NULL CHECK (total_cents > 0),
  method text NOT NULL DEFAULT 'pending'
    CHECK (method IN ('tab', 'demo_card', 'cash', 'pending')),
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN (
      'pending',
      'tab_requested',
      'approved',
      'paid',
      'repaid',
      'expired',
      'cancelled'
    )),
  paid_now_cents integer NOT NULL DEFAULT 0 CHECK (paid_now_cents >= 0),
  tab_cents integer NOT NULL DEFAULT 0 CHECK (tab_cents >= 0),
  paid_now_method text CHECK (paid_now_method IN ('demo_card', 'cash')),
  paid_now_confirmed_at timestamptz,
  qr_token_hash text UNIQUE,
  expires_at timestamptz,
  used_at timestamptz,
  approved_at timestamptz,
  due_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT sales_shop_customer_same_shop
    FOREIGN KEY (shop_id, shop_customer_id)
    REFERENCES public.shop_customers (shop_id, id)
    ON DELETE RESTRICT,
  CONSTRAINT sales_tender_not_over_total
    CHECK (paid_now_cents::bigint + tab_cents::bigint <= total_cents),
  CONSTRAINT sales_paid_now_method_matches_amount
    CHECK (
      (paid_now_cents = 0 AND paid_now_method IS NULL)
      OR (paid_now_cents > 0 AND paid_now_method IS NOT NULL)
    ),
  CONSTRAINT sales_confirmation_requires_tender
    CHECK (paid_now_confirmed_at IS NULL OR paid_now_cents > 0),
  CONSTRAINT sales_token_requires_expiry
    CHECK ((qr_token_hash IS NULL) = (expires_at IS NULL)),
  CONSTRAINT sales_token_expires_within_five_minutes
    CHECK (
      qr_token_hash IS NULL
      OR (
        expires_at > created_at
        AND expires_at <= created_at + interval '5 minutes'
      )
    ),
  CONSTRAINT sales_approval_timestamp_matches_status
    CHECK ((status IN ('approved', 'repaid')) = (approved_at IS NOT NULL)),
  CONSTRAINT sales_due_timestamp_matches_status
    CHECK ((status IN ('approved', 'repaid')) = (due_at IS NOT NULL)),
  CONSTRAINT sales_requested_tab_has_full_tender_split
    CHECK (
      status <> 'tab_requested'
      OR (
        method = 'tab'
        AND shop_customer_id IS NOT NULL
        AND tab_cents > 0
        AND paid_now_cents::bigint + tab_cents::bigint = total_cents
        AND used_at IS NOT NULL
      )
    ),
  CONSTRAINT sales_approved_tab_has_full_tender_split
    CHECK (
      status NOT IN ('approved', 'repaid')
      OR (
        method = 'tab'
        AND shop_customer_id IS NOT NULL
        AND tab_cents > 0
        AND paid_now_cents::bigint + tab_cents::bigint = total_cents
        AND approved_at IS NOT NULL
        AND due_at IS NOT NULL
        AND (paid_now_cents = 0 OR paid_now_confirmed_at IS NOT NULL)
      )
    ),
  CONSTRAINT sales_paid_is_fully_tendered
    CHECK (
      status <> 'paid'
      OR (
        method IN ('demo_card', 'cash')
        AND tab_cents = 0
        AND paid_now_cents = total_cents
        AND paid_now_method = method
        AND paid_now_confirmed_at IS NOT NULL
        AND used_at IS NOT NULL
      )
    ),
  CONSTRAINT sales_pending_tender_is_unapproved
    CHECK (
      status <> 'pending'
      OR (
        (method = 'pending' AND paid_now_cents = 0 AND tab_cents = 0
          AND paid_now_method IS NULL)
        OR (method = 'cash' AND paid_now_cents = total_cents AND tab_cents = 0
          AND paid_now_method = 'cash' AND paid_now_confirmed_at IS NULL
          AND used_at IS NOT NULL)
      )
    )
);
COMMENT ON TABLE public.sales IS
  'WHY: Records immutable sale totals, one-use QR state, split tender, and the tab approval lifecycle.';

-- WHY: A repayment is an auditable event so the customer record can reflect on-time behavior.
CREATE TABLE public.repayments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sale_id uuid NOT NULL REFERENCES public.sales (id) ON DELETE CASCADE,
  amount_cents integer NOT NULL CHECK (amount_cents > 0),
  paid_at timestamptz NOT NULL DEFAULT now(),
  on_time boolean NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.repayments IS
  'WHY: Keeps an auditable history of partial and full tab repayments for balances and scoring.';

-- WHY: Ledger pages filter a shop by newest sales and customers by their own transaction history.
CREATE INDEX sales_shop_created_at_idx
  ON public.sales (shop_id, created_at DESC);
CREATE INDEX shops_owner_id_idx
  ON public.shops (owner_id);
CREATE INDEX sales_customer_created_at_idx
  ON public.sales (shop_customer_id, created_at DESC)
  WHERE shop_customer_id IS NOT NULL;
CREATE INDEX sales_status_shop_idx
  ON public.sales (shop_id, status, created_at DESC);
CREATE INDEX repayments_sale_paid_at_idx
  ON public.repayments (sale_id, paid_at DESC);

-- WHY: Updated timestamps make mutable records auditable without trusting browser clocks.
CREATE FUNCTION public.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER profiles_set_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER shops_set_updated_at
  BEFORE UPDATE ON public.shops
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER shop_customers_set_updated_at
  BEFORE UPDATE ON public.shop_customers
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER sales_set_updated_at
  BEFORE UPDATE ON public.sales
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- WHY: A sale must move forward once; this prevents replayed QR requests from reopening it.
CREATE FUNCTION public.enforce_sale_state_transition()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  customer_record public.shop_customers%ROWTYPE;
  outstanding_cents bigint;
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

  IF OLD.qr_token_hash IS NOT NULL
    AND OLD.used_at IS NULL
    AND OLD.expires_at <= now()
    AND (
      NEW.status IN ('tab_requested', 'approved', 'paid')
      OR (
        OLD.status = 'pending'
        AND OLD.method = 'pending'
        AND NEW.method = 'cash'
      )
    )
  THEN
    RAISE EXCEPTION 'Sale QR has expired';
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

  RETURN NEW;
END;
$$;

CREATE TRIGGER sales_enforce_state_transition
  BEFORE INSERT OR UPDATE ON public.sales
  FOR EACH ROW EXECUTE FUNCTION public.enforce_sale_state_transition();

-- WHY: Locking the sale row makes balance validation and full-repayment completion atomic.
CREATE FUNCTION public.validate_and_apply_repayment()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  sale_status text;
  sale_tab_cents integer;
  sale_due_at timestamptz;
  already_repaid bigint;
BEGIN
  SELECT s.status, s.tab_cents, s.due_at
    INTO sale_status, sale_tab_cents, sale_due_at
    FROM public.sales AS s
    WHERE s.id = NEW.sale_id
    FOR UPDATE;

  IF NOT FOUND OR sale_status <> 'approved' OR sale_due_at IS NULL THEN
    RAISE EXCEPTION 'Sale has no outstanding approved tab';
  END IF;

  SELECT COALESCE(sum(r.amount_cents), 0)
    INTO already_repaid
    FROM public.repayments AS r
    WHERE r.sale_id = NEW.sale_id;

  IF already_repaid + NEW.amount_cents > sale_tab_cents THEN
    RAISE EXCEPTION 'Repayment exceeds the outstanding tab balance';
  END IF;

  NEW.paid_at := now();
  NEW.on_time := NEW.paid_at <= sale_due_at;

  IF already_repaid + NEW.amount_cents = sale_tab_cents THEN
    UPDATE public.sales
      SET status = 'repaid'
      WHERE id = NEW.sale_id
        AND status = 'approved';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.validate_and_apply_repayment() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER repayments_validate_and_apply
  BEFORE INSERT ON public.repayments
  FOR EACH ROW EXECUTE FUNCTION public.validate_and_apply_repayment();
