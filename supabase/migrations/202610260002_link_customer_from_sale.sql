-- WHY: Let OTP-confirmed smartphone customers form a consented shop relationship from a live purchase QR.
CREATE OR REPLACE FUNCTION public.link_shop_customer_from_sale_with_consent(
  target_token_hash text,
  consent_given boolean
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  caller_id uuid := auth.uid();
  caller_phone text;
  caller_name text;
  sale_record public.sales%ROWTYPE;
  customer_record public.shop_customers%ROWTYPE;
  linked_customer_id uuid;
BEGIN
  IF caller_id IS NULL OR consent_given IS DISTINCT FROM true
    OR target_token_hash IS NULL OR target_token_hash !~ '^[0-9a-f]{64}$'
  THEN
    RAISE EXCEPTION 'A signed-in customer, live purchase QR, and consent are required';
  END IF;

  -- WHY: Only Auth's OTP-confirmed phone can establish the relationship; profile phone text is editable.
  SELECT CASE
      WHEN u.phone ~ '^27[0-9]{9}$' THEN '+' || u.phone
      WHEN u.phone ~ '^0[0-9]{9}$' THEN '+27' || pg_catalog.substr(u.phone, 2)
      ELSE u.phone
    END,
    p.full_name
    INTO caller_phone, caller_name
    FROM auth.users AS u
    JOIN public.profiles AS p ON p.id = u.id
    WHERE u.id = caller_id
      AND u.phone_confirmed_at IS NOT NULL
      AND p.role = 'customer';

  IF NOT FOUND OR caller_phone IS NULL OR caller_phone !~ '^[+]27[0-9]{9}$' THEN
    RAISE EXCEPTION 'A confirmed South African phone is required';
  END IF;

  -- WHY: Locking the unexpired sale serializes concurrent link attempts with payment choices.
  SELECT s.* INTO sale_record
    FROM public.sales AS s
    WHERE s.qr_token_hash = target_token_hash
      AND s.status = 'pending'
      AND s.method = 'pending'
      AND s.used_at IS NULL
      AND s.expires_at > pg_catalog.clock_timestamp()
    FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'No active purchase QR is available';
  END IF;
  IF sale_record.shop_customer_id IS NOT NULL THEN
    SELECT sc.* INTO customer_record
      FROM public.shop_customers AS sc
      WHERE sc.id = sale_record.shop_customer_id
        AND sc.shop_id = sale_record.shop_id
        AND sc.customer_profile_id = caller_id
      FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'No active purchase QR is available';
    END IF;
  END IF;

  SELECT sc.* INTO customer_record
    FROM public.shop_customers AS sc
    WHERE sc.shop_id = sale_record.shop_id AND sc.customer_profile_id = caller_id
    FOR UPDATE;
  IF FOUND THEN
    IF customer_record.customer_phone <> caller_phone OR customer_record.status <> 'active' THEN
      RAISE EXCEPTION 'No matching active customer relationship is available';
    END IF;
    UPDATE public.shop_customers AS sc
      SET consent_at = pg_catalog.now()
      WHERE sc.id = customer_record.id;
    linked_customer_id := customer_record.id;
  ELSE
    SELECT sc.* INTO customer_record
      FROM public.shop_customers AS sc
      WHERE sc.shop_id = sale_record.shop_id AND sc.customer_phone = caller_phone
      FOR UPDATE;
    IF FOUND THEN
      -- WHY: Phone OTP proves number control; an owner attestation prevents recycled numbers claiming a manual record.
      IF customer_record.status <> 'active'
        OR customer_record.customer_profile_id IS NOT NULL
        OR customer_record.owner_confirmed_at IS NULL
      THEN
        RAISE EXCEPTION 'No matching active customer relationship is available';
      END IF;
      UPDATE public.shop_customers AS sc
        SET customer_profile_id = caller_id,
            consent_at = pg_catalog.now()
        WHERE sc.id = customer_record.id
        RETURNING sc.id INTO linked_customer_id;
    ELSE
      BEGIN
        INSERT INTO public.shop_customers (
          shop_id, customer_profile_id, customer_phone, display_name, status, consent_at
        ) VALUES (
          sale_record.shop_id, caller_id, caller_phone, caller_name, 'active', pg_catalog.now()
        )
        RETURNING id INTO linked_customer_id;
      EXCEPTION WHEN unique_violation THEN
        -- WHY: Two live QR links for one customer/shop may race; only reuse the exact identity just created.
        SELECT sc.* INTO customer_record
          FROM public.shop_customers AS sc
          WHERE sc.shop_id = sale_record.shop_id
            AND (sc.customer_profile_id = caller_id OR sc.customer_phone = caller_phone)
          ORDER BY sc.id
          LIMIT 1
          FOR UPDATE;
        IF NOT FOUND
          OR customer_record.customer_profile_id IS DISTINCT FROM caller_id
          OR customer_record.customer_phone <> caller_phone
          OR customer_record.status <> 'active'
        THEN
          RAISE EXCEPTION 'No matching active customer relationship is available';
        END IF;
        UPDATE public.shop_customers AS sc
          SET consent_at = pg_catalog.now()
          WHERE sc.id = customer_record.id
          RETURNING sc.id INTO linked_customer_id;
      END;
    END IF;
  END IF;

  -- WHY: Bind this one-use purchase request to the consenting customer so another QR holder cannot claim it.
  UPDATE public.sales AS s
    SET shop_customer_id = linked_customer_id
    WHERE s.id = sale_record.id
      AND s.shop_id = sale_record.shop_id
      AND s.status = 'pending'
      AND s.method = 'pending'
      AND s.used_at IS NULL
      AND s.expires_at > pg_catalog.clock_timestamp()
      AND (s.shop_customer_id IS NULL OR s.shop_customer_id = linked_customer_id);
  IF NOT FOUND THEN
    RAISE EXCEPTION 'No active purchase QR is available';
  END IF;

  RETURN linked_customer_id;
END;
$$;
REVOKE ALL ON FUNCTION public.link_shop_customer_from_sale_with_consent(text, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.link_shop_customer_from_sale_with_consent(text, boolean) TO authenticated;
