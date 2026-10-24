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

REVOKE ALL ON FUNCTION public.is_shop_owner(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.is_linked_customer_to_shop(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.link_shop_customer_with_consent(uuid, boolean)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_shop_owner(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_linked_customer_to_shop(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.link_shop_customer_with_consent(uuid, boolean)
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
  consent_at, owner_confirmed_at, credit_limit_cents, created_at, updated_at
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
