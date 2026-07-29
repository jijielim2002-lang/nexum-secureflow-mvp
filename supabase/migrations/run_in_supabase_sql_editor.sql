-- ─────────────────────────────────────────────────────────────────────────────
-- Run these in Supabase SQL Editor (in order)
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. Add payee_bank_details column to tradeflow_requests (if not already present)
ALTER TABLE public.tradeflow_requests
  ADD COLUMN IF NOT EXISTS payee_bank_details jsonb;

-- 2. Update TradeFlow insert policy to allow service_provider role
DROP POLICY IF EXISTS "tf_requests_insert_customer" ON public.tradeflow_requests;
CREATE POLICY "tf_requests_insert_customer" ON public.tradeflow_requests
  FOR INSERT TO authenticated
  WITH CHECK (
    nexum_my_role() IN ('customer', 'service_provider', 'admin')
    AND (customer_company_id = nexum_my_company_id() OR nexum_is_admin())
  );

-- 3. Run marketplace migration (paste contents of 20250729_marketplace_v1.sql)
--    OR run it via Supabase CLI: supabase db push
