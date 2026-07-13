-- ============================================================
-- Provider Customers Migration
-- Run in Supabase SQL Editor
-- ============================================================

CREATE TABLE IF NOT EXISTS public.provider_customers (
  id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_company_id uuid        REFERENCES public.companies(id) ON DELETE CASCADE,
  created_by          uuid        REFERENCES auth.users(id),
  customer_company    text        NOT NULL,
  contact_name        text        NOT NULL,
  email               text,
  phone               text,
  address             text,
  created_at          timestamptz DEFAULT now(),
  updated_at          timestamptz DEFAULT now()
);

ALTER TABLE public.provider_customers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_all_provider_customers"
  ON public.provider_customers FOR ALL
  TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "provider_read_own_customers"
  ON public.provider_customers FOR SELECT
  TO authenticated
  USING (
    provider_company_id IN (
      SELECT company_id FROM public.profiles WHERE id = auth.uid()
    )
  );

CREATE POLICY "provider_insert_own_customers"
  ON public.provider_customers FOR INSERT
  TO authenticated
  WITH CHECK (
    provider_company_id IN (
      SELECT company_id FROM public.profiles WHERE id = auth.uid()
    )
  );

CREATE POLICY "provider_update_own_customers"
  ON public.provider_customers FOR UPDATE
  TO authenticated
  USING (
    provider_company_id IN (
      SELECT company_id FROM public.profiles WHERE id = auth.uid()
    )
  );

CREATE POLICY "provider_delete_own_customers"
  ON public.provider_customers FOR DELETE
  TO authenticated
  USING (
    provider_company_id IN (
      SELECT company_id FROM public.profiles WHERE id = auth.uid()
    )
  );
