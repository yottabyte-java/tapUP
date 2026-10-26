-- WHY: RLS keeps every client query scoped to the authenticated user's shop or own customer record.

-- WHY: This SECURITY DEFINER predicate checks ownership without recursive RLS queries.
CREATE FUNCTION public.is_shop_owner(target_shop_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.shops AS s
    JOIN public.profiles AS p ON p.id = s.owner_id
    WHERE s.id = target_shop_id
      AND s.owner_id = (SELECT auth.uid())
      AND p.role = 'shop_owner'
  );
$$;

-- WHY: This safe predicate lets customer-facing RLS avoid recursive table policies.
CREATE FUNCTION public.is_linked_customer_to_shop(target_shop_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.shop_customers AS sc
    WHERE sc.shop_id = target_shop_id
      AND sc.customer_profile_id = (SELECT auth.uid())
      AND sc.status = 'active'
  );
$$;

-- WHY: An authenticated customer can only link their own account and explicitly timestamp consent.
CREATE FUNCTION public.link_shop_customer_with_consent(
  target_shop_customer_id uuid,
  consent_given boolean
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  caller_id uuid := auth.uid();
  caller_phone text;
  changed_rows integer;
BEGIN
  IF caller_id IS NULL OR consent_given IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'Sign in as the customer and provide consent to link this account';
  END IF;

  -- WHY: A profile phone is editable account data, so only Auth's OTP-confirmed phone can prove ownership.
  -- WHY: GoTrue may return a confirmed South African number without its E.164 plus prefix.
  SELECT CASE
      WHEN u.phone ~ '^27[0-9]{9}$' THEN '+' || u.phone
      WHEN u.phone ~ '^0[0-9]{9}$' THEN '+27' || substring(u.phone FROM 2)
      ELSE u.phone
    END
    INTO caller_phone
    FROM auth.users AS u
    JOIN public.profiles AS p ON p.id = u.id
    WHERE u.id = caller_id
      AND u.phone_confirmed_at IS NOT NULL
      AND p.role = 'customer';

  IF NOT FOUND OR caller_phone IS NULL THEN
    RAISE EXCEPTION 'A customer profile with a phone number is required';
  END IF;

  UPDATE public.shop_customers AS sc
    SET customer_profile_id = caller_id,
        consent_at = now()
    WHERE sc.id = target_shop_customer_id
      AND sc.customer_phone = caller_phone
      AND sc.customer_profile_id IS NULL
      AND sc.status = 'active';

  GET DIAGNOSTICS changed_rows = ROW_COUNT;
  IF changed_rows <> 1 THEN
    RAISE EXCEPTION 'No matching unlinked customer record is available';
  END IF;
END;
$$;

-- WHY: A customer can create their own shop relationship from a live purchase QR using an
-- Auth-confirmed phone and explicit consent, without an owner creating a smartphone customer.
CREATE FUNCTION public.link_shop_customer_from_sale_with_consent(
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

-- WHY: Only the linked customer can grant or revoke lender sharing for their shop-specific record.
CREATE FUNCTION public.set_lender_sharing_consent(
  target_shop_customer_id uuid,
  consent_given boolean
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  caller_id uuid := auth.uid();
  changed_rows integer;
BEGIN
  IF caller_id IS NULL OR consent_given IS NULL THEN
    RAISE EXCEPTION 'A signed-in customer must choose lender sharing consent';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.profiles AS p
    WHERE p.id = caller_id AND p.role = 'customer'
  ) THEN
    RAISE EXCEPTION 'Only a customer can change lender sharing consent';
  END IF;

  UPDATE public.shop_customers AS sc
    SET lender_sharing_consent_at = CASE WHEN consent_given THEN now() ELSE NULL END
    WHERE sc.id = target_shop_customer_id
      AND sc.customer_profile_id = caller_id;

  GET DIAGNOSTICS changed_rows = ROW_COUNT;
  IF changed_rows <> 1 THEN
    RAISE EXCEPTION 'No linked customer record is available';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.is_shop_owner(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.is_linked_customer_to_shop(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.link_shop_customer_with_consent(uuid, boolean)
  FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.link_shop_customer_from_sale_with_consent(text, boolean)
  FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.set_lender_sharing_consent(uuid, boolean)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.is_shop_owner(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_linked_customer_to_shop(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.link_shop_customer_with_consent(uuid, boolean)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.link_shop_customer_from_sale_with_consent(text, boolean)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_lender_sharing_consent(uuid, boolean)
  TO authenticated;

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shops ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shop_customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sales ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.repayments ENABLE ROW LEVEL SECURITY;

-- WHY: A profile is private; this prevents one user from enumerating other account identities.
CREATE POLICY profiles_select_self
  ON public.profiles FOR SELECT TO authenticated
  USING (id = (SELECT auth.uid()));

-- WHY: Users can edit their name but cannot change the phone value used for account identification.
CREATE POLICY profiles_update_self
  ON public.profiles FOR UPDATE TO authenticated
  USING (id = (SELECT auth.uid()))
  WITH CHECK (id = (SELECT auth.uid()));

-- WHY: Owners and linked customers can see only shops relevant to their relationship.
CREATE POLICY shops_select_related
  ON public.shops FOR SELECT TO authenticated
  USING (
    public.is_shop_owner(id)
    OR public.is_linked_customer_to_shop(id)
  );

-- WHY: This prevents a user from creating a shop owned by another account or by a customer.
CREATE POLICY shops_insert_self_as_owner
  ON public.shops FOR INSERT TO authenticated
  WITH CHECK (
    owner_id = (SELECT auth.uid())
    AND EXISTS (
      SELECT 1
      FROM public.profiles AS p
      WHERE p.id = (SELECT auth.uid())
        AND p.role = 'shop_owner'
    )
  );

-- WHY: Only the owner can change their shop's settings or delete that shop.
CREATE POLICY shops_update_owned
  ON public.shops FOR UPDATE TO authenticated
  USING (public.is_shop_owner(id))
  WITH CHECK (public.is_shop_owner(id));
CREATE POLICY shops_delete_owned
  ON public.shops FOR DELETE TO authenticated
  USING (public.is_shop_owner(id));

-- WHY: A shop owner sees only their own customer records; customers see only their own link.
CREATE POLICY shop_customers_select_related
  ON public.shop_customers FOR SELECT TO authenticated
  USING (
    public.is_shop_owner(shop_id)
    OR customer_profile_id = (SELECT auth.uid())
  );

-- WHY: A shop owner cannot create a customer row for a shop they do not own.
CREATE POLICY shop_customers_insert_owned
  ON public.shop_customers FOR INSERT TO authenticated
  WITH CHECK (public.is_shop_owner(shop_id));

-- WHY: This prevents an owner from altering another shop's relationship or its customer PIN state.
CREATE POLICY shop_customers_update_owned
  ON public.shop_customers FOR UPDATE TO authenticated
  USING (public.is_shop_owner(shop_id))
  WITH CHECK (public.is_shop_owner(shop_id));

-- WHY: Only the owning shop can remove its customer record; FK restrictions preserve sale history.
CREATE POLICY shop_customers_delete_owned
  ON public.shop_customers FOR DELETE TO authenticated
  USING (public.is_shop_owner(shop_id));

-- WHY: Sales are visible only to the owning shop or the customer linked to that exact sale.
CREATE POLICY sales_select_related
  ON public.sales FOR SELECT TO authenticated
  USING (
    public.is_shop_owner(shop_id)
    OR (
      shop_customer_id IS NOT NULL
      AND EXISTS (
        SELECT 1
        FROM public.shop_customers AS sc
        WHERE sc.id = sales.shop_customer_id
          AND sc.shop_id = sales.shop_id
          AND sc.customer_profile_id = (SELECT auth.uid())
      )
    )
  );

-- WHY: Sale writes use validated server actions with conditional state changes; client DML is
-- intentionally denied so an authenticated browser cannot forge a tender or bypass approval.
CREATE POLICY sales_no_direct_client_write
  ON public.sales FOR ALL TO authenticated
  USING (false)
  WITH CHECK (false);

-- WHY: Repayment history is visible only to the shop that received it and its linked customer.
CREATE POLICY repayments_select_related
  ON public.repayments FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.sales AS s
      WHERE s.id = repayments.sale_id
        AND (
          public.is_shop_owner(s.shop_id)
          OR (
            s.shop_customer_id IS NOT NULL
            AND EXISTS (
              SELECT 1
              FROM public.shop_customers AS sc
              WHERE sc.id = s.shop_customer_id
                AND sc.customer_profile_id = (SELECT auth.uid())
            )
          )
        )
    )
  );

-- WHY: Repayments are append-only server-validated events, not browser-editable balances.
CREATE POLICY repayments_no_direct_client_write
  ON public.repayments FOR ALL TO authenticated
  USING (false)
  WITH CHECK (false);

-- WHY: Revoke broad grants first; column grants let clients read only safe fields, never PIN/QR
-- hashes or lockout counters. Privileged writes must go through server-only actions.
REVOKE ALL ON TABLE
  public.profiles,
  public.shops,
  public.shop_customers,
  public.sales,
  public.repayments
FROM PUBLIC, anon, authenticated;

GRANT SELECT (id, role, full_name, phone, created_at, updated_at)
  ON public.profiles TO authenticated;
GRANT UPDATE (full_name)
  ON public.profiles TO authenticated;

GRANT SELECT (id, owner_id, name, created_at, updated_at)
  ON public.shops TO authenticated;
GRANT INSERT (owner_id, name)
  ON public.shops TO authenticated;
GRANT UPDATE (name)
  ON public.shops TO authenticated;
GRANT DELETE ON public.shops TO authenticated;

GRANT SELECT (
  id, shop_id, customer_profile_id, customer_phone, display_name, status,
  consent_at, lender_sharing_consent_at, owner_confirmed_at,
  credit_limit_cents, created_at, updated_at
)
  ON public.shop_customers TO authenticated;
GRANT INSERT (shop_id, customer_phone, display_name, status, consent_at)
  ON public.shop_customers TO authenticated;
GRANT UPDATE (display_name, status, owner_confirmed_at)
  ON public.shop_customers TO authenticated;
GRANT DELETE ON public.shop_customers TO authenticated;

GRANT SELECT (
  id, shop_id, shop_customer_id, items, total_cents, method, status,
  paid_now_cents, tab_cents, paid_now_method, paid_now_confirmed_at,
  expires_at, used_at, approved_at, due_at, created_at, updated_at
)
  ON public.sales TO authenticated;

GRANT SELECT (id, sale_id, amount_cents, paid_at, on_time, created_at)
  ON public.repayments TO authenticated;

-- WHY: Automatic table exposure is disabled, so the server-only service role needs explicit grants.
GRANT USAGE ON SCHEMA public TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO service_role;
