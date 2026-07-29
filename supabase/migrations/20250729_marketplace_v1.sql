-- ─────────────────────────────────────────────────────────────────────────────
-- Service Marketplace v1
-- Tables: service_listings, service_customer_requests
-- Run AFTER: set_updated_at() trigger function exists in DB
-- ─────────────────────────────────────────────────────────────────────────────

-- ─── Reference generator ─────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.generate_service_reference()
RETURNS text
LANGUAGE plpgsql
AS $$
DECLARE
  ref text;
  exists_already boolean;
BEGIN
  LOOP
    ref := 'SVC-' || to_char(now(), 'YYYYMMDD') || '-' || upper(substring(md5(random()::text) from 1 for 6));
    SELECT EXISTS(SELECT 1 FROM public.service_listings WHERE listing_reference = ref) INTO exists_already;
    EXIT WHEN NOT exists_already;
  END LOOP;
  RETURN ref;
END;
$$;

CREATE OR REPLACE FUNCTION public.generate_service_request_reference()
RETURNS text
LANGUAGE plpgsql
AS $$
DECLARE
  ref text;
  exists_already boolean;
BEGIN
  LOOP
    ref := 'REQ-' || to_char(now(), 'YYYYMMDD') || '-' || upper(substring(md5(random()::text) from 1 for 6));
    SELECT EXISTS(SELECT 1 FROM public.service_customer_requests WHERE request_reference = ref) INTO exists_already;
    EXIT WHEN NOT exists_already;
  END LOOP;
  RETURN ref;
END;
$$;

-- ─── service_listings ────────────────────────────────────────────────────────
-- Created by service providers; approved by admin before visible to customers.

CREATE TABLE IF NOT EXISTS public.service_listings (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_reference     text UNIQUE NOT NULL,

  -- Provider info
  provider_company_id   uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,

  -- Service classification
  service_type          text NOT NULL,
  -- Values: 'Freight & Logistics', 'Customs Brokerage', 'Trade Finance Support',
  --         'Legal & Compliance', 'Inspection & Certification'

  -- Listing content
  title                 text NOT NULL,
  description           text,
  service_scope         text,          -- regions/countries covered
  service_modes         text[],        -- e.g. ['Air', 'Sea', 'Land']
  certifications        text[],        -- e.g. ['FIATA', 'ISO 9001']
  languages_supported   text[],

  -- Pricing
  pricing_model         text,          -- 'Fixed', 'Per Shipment', 'Hourly', 'Quote on Request'
  base_price            numeric(18,2),
  currency              text DEFAULT 'USD',
  commission_rate       numeric(5,2),  -- Nexum platform commission % (set by admin)

  -- Type-specific fields (stored as JSONB for flexibility)
  service_details       jsonb,
  -- Freight & Logistics:    { cargo_types, max_weight_kg, hazmat, reefer, port_pairs }
  -- Customs Brokerage:      { hs_code_expertise, countries, permit_types }
  -- Trade Finance Support:  { finance_types, min_amount, max_amount, supported_currencies }
  -- Legal & Compliance:     { practice_areas, jurisdictions, document_types }
  -- Inspection & Certification: { inspection_types, lab_accreditations, turnaround_days }

  -- Admin approval workflow
  listing_status        text NOT NULL DEFAULT 'Draft',
  -- Draft → Pending Review → Approved → Rejected → Suspended

  admin_notes           text,
  approved_by           uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  approved_at           timestamptz,
  rejection_reason      text,

  -- Availability
  available_from        date,
  available_until       date,
  is_active             boolean NOT NULL DEFAULT true,

  -- Meta
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_service_listings_provider    ON public.service_listings(provider_company_id);
CREATE INDEX IF NOT EXISTS idx_service_listings_status      ON public.service_listings(listing_status);
CREATE INDEX IF NOT EXISTS idx_service_listings_type        ON public.service_listings(service_type);

CREATE TRIGGER set_service_listings_updated_at
  BEFORE UPDATE ON public.service_listings
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ─── service_customer_requests ───────────────────────────────────────────────
-- Customer submits a request against a listing; provider + admin manage it.

CREATE TABLE IF NOT EXISTS public.service_customer_requests (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_reference     text UNIQUE NOT NULL,

  -- Parties
  listing_id            uuid NOT NULL REFERENCES public.service_listings(id) ON DELETE CASCADE,
  customer_company_id   uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  provider_company_id   uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,

  -- Job linkage (optional — can attach to an existing job)
  job_id                uuid REFERENCES public.secured_jobs(id) ON DELETE SET NULL,

  -- Request details
  message               text,          -- customer's request message
  quantity              numeric(18,2), -- e.g. number of shipments, hours
  requested_start_date  date,
  requested_end_date    date,
  origin_country        text,
  destination_country   text,
  cargo_description     text,
  special_requirements  text,
  attached_documents    jsonb,         -- array of { file_path, file_name, document_type }

  -- Pricing agreed
  agreed_price          numeric(18,2),
  agreed_currency       text DEFAULT 'USD',
  platform_commission   numeric(18,2), -- Nexum's cut (computed on approval)

  -- Status workflow
  request_status        text NOT NULL DEFAULT 'Submitted',
  -- Submitted → Under Review → Quoted → Accepted → In Progress → Completed → Cancelled

  -- Provider response
  provider_response     text,
  provider_quote        numeric(18,2),
  provider_quote_notes  text,
  provider_responded_at timestamptz,

  -- Admin oversight
  admin_notes           text,
  admin_reviewed_by     uuid REFERENCES auth.users(id) ON DELETE SET NULL,

  -- Completion
  completed_at          timestamptz,
  customer_rating       smallint CHECK (customer_rating BETWEEN 1 AND 5),
  customer_review       text,

  -- Meta
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_svc_requests_listing    ON public.service_customer_requests(listing_id);
CREATE INDEX IF NOT EXISTS idx_svc_requests_customer   ON public.service_customer_requests(customer_company_id);
CREATE INDEX IF NOT EXISTS idx_svc_requests_provider   ON public.service_customer_requests(provider_company_id);
CREATE INDEX IF NOT EXISTS idx_svc_requests_status     ON public.service_customer_requests(request_status);

CREATE TRIGGER set_service_customer_requests_updated_at
  BEFORE UPDATE ON public.service_customer_requests
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ─── RLS ─────────────────────────────────────────────────────────────────────

ALTER TABLE public.service_listings         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.service_customer_requests ENABLE ROW LEVEL SECURITY;

-- service_listings: provider sees own, customer sees Approved only, admin sees all
CREATE POLICY "svc_listings_select_provider" ON public.service_listings
  FOR SELECT TO authenticated
  USING (nexum_my_role() = 'service_provider' AND provider_company_id = nexum_my_company_id());

CREATE POLICY "svc_listings_select_customer" ON public.service_listings
  FOR SELECT TO authenticated
  USING (nexum_my_role() = 'customer' AND listing_status = 'Approved' AND is_active = true);

CREATE POLICY "svc_listings_select_admin" ON public.service_listings
  FOR SELECT TO authenticated
  USING (nexum_is_admin());

CREATE POLICY "svc_listings_insert_provider" ON public.service_listings
  FOR INSERT TO authenticated
  WITH CHECK (nexum_my_role() = 'service_provider' AND provider_company_id = nexum_my_company_id());

CREATE POLICY "svc_listings_update_provider" ON public.service_listings
  FOR UPDATE TO authenticated
  USING (nexum_my_role() = 'service_provider' AND provider_company_id = nexum_my_company_id()
         AND listing_status IN ('Draft', 'Rejected'));

CREATE POLICY "svc_listings_update_admin" ON public.service_listings
  FOR UPDATE TO authenticated
  USING (nexum_is_admin());

-- service_customer_requests: customer sees own, provider sees requests for their listings, admin sees all
CREATE POLICY "svc_requests_select_customer" ON public.service_customer_requests
  FOR SELECT TO authenticated
  USING (nexum_my_role() = 'customer' AND customer_company_id = nexum_my_company_id());

CREATE POLICY "svc_requests_select_provider" ON public.service_customer_requests
  FOR SELECT TO authenticated
  USING (nexum_my_role() = 'service_provider' AND provider_company_id = nexum_my_company_id());

CREATE POLICY "svc_requests_select_admin" ON public.service_customer_requests
  FOR SELECT TO authenticated
  USING (nexum_is_admin());

CREATE POLICY "svc_requests_insert_customer" ON public.service_customer_requests
  FOR INSERT TO authenticated
  WITH CHECK (nexum_my_role() = 'customer' AND customer_company_id = nexum_my_company_id());

CREATE POLICY "svc_requests_update_customer" ON public.service_customer_requests
  FOR UPDATE TO authenticated
  USING (nexum_my_role() = 'customer' AND customer_company_id = nexum_my_company_id()
         AND request_status IN ('Submitted', 'Quoted'));

CREATE POLICY "svc_requests_update_provider" ON public.service_customer_requests
  FOR UPDATE TO authenticated
  USING (nexum_my_role() = 'service_provider' AND provider_company_id = nexum_my_company_id());

CREATE POLICY "svc_requests_update_admin" ON public.service_customer_requests
  FOR UPDATE TO authenticated
  USING (nexum_is_admin());
