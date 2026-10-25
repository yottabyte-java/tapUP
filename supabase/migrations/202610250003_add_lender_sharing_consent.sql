-- WHY: Bring existing hosted databases in line with the customer-specific lender-consent UI and API.
ALTER TABLE public.shop_customers
  ADD COLUMN IF NOT EXISTS lender_sharing_consent_at timestamptz;

-- WHY: Only the linked customer may grant or revoke lender sharing for their shop-specific record.
CREATE OR REPLACE FUNCTION public.set_lender_sharing_consent(
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

REVOKE ALL ON FUNCTION public.set_lender_sharing_consent(uuid, boolean)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.set_lender_sharing_consent(uuid, boolean)
  TO authenticated;

GRANT SELECT (lender_sharing_consent_at)
  ON public.shop_customers TO authenticated;
