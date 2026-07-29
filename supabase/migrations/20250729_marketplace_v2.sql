-- ─────────────────────────────────────────────────────────────────────────────
-- Marketplace v2  —  drop v1 tables, create full marketplace schema
-- Run in Supabase SQL Editor AFTER set_updated_at() exists
-- ─────────────────────────────────────────────────────────────────────────────

-- ─── Drop v1 ─────────────────────────────────────────────────────────────────
DROP TABLE IF EXISTS public.service_customer_requests CASCADE;
DROP TABLE IF EXISTS public.service_listings           CASCADE;
DROP FUNCTION IF EXISTS public.generate_service_reference()         CASCADE;
DROP FUNCTION IF EXISTS public.generate_service_request_reference() CASCADE;

-- ─── Reference generators ────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.generate_listing_reference()
RETURNS text LANGUAGE plpgsql AS $$
DECLARE ref text; dup boolean;
BEGIN
  LOOP
    ref := 'SVC-' || to_char(now(), 'YYYYMMDD') || '-' || upper(substring(md5(random()::text) FROM 1 FOR 6));
    SELECT EXISTS(SELECT 1 FROM public.service_listings WHERE listing_reference = ref) INTO dup;
    EXIT WHEN NOT dup;
  END LOOP;
  RETURN ref;
END; $$;

CREATE OR REPLACE FUNCTION public.generate_rfq_reference()
RETURNS text LANGUAGE plpgsql AS $$
DECLARE ref text; dup boolean;
BEGIN
  LOOP
    ref := 'RFQ-' || to_char(now(), 'YYYYMMDD') || '-' || upper(substring(md5(random()::text) FROM 1 FOR 6));
    SELECT EXISTS(SELECT 1 FROM public.marketplace_rfqs WHERE rfq_reference = ref) INTO dup;
    EXIT WHEN NOT dup;
  END LOOP;
  RETURN ref;
END; $$;

CREATE OR REPLACE FUNCTION public.generate_quote_reference()
RETURNS text LANGUAGE plpgsql AS $$
DECLARE ref text; dup boolean;
BEGIN
  LOOP
    ref := 'QTE-' || to_char(now(), 'YYYYMMDD') || '-' || upper(substring(md5(random()::text) FROM 1 FOR 6));
    SELECT EXISTS(SELECT 1 FROM public.marketplace_quotes WHERE quote_reference = ref) INTO dup;
    EXIT WHEN NOT dup;
  END LOOP;
  RETURN ref;
END; $$;

-- ─── service_listings ────────────────────────────────────────────────────────

CREATE TABLE public.service_listings (
  id                   uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_reference    text        UNIQUE NOT NULL,
  provider_company_id  uuid        NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  created_by           uuid        NOT NULL REFERENCES auth.users(id) ON DELETE SET NULL,

  service_category     text        NOT NULL CHECK (service_category IN (
                           'Sea Freight','Air Freight','Courier','Small Parcel',
                           'Transport','Console Truck','Custom Broker')),
  listing_title        text        NOT NULL,
  description          text,
  cargo_type           text        NOT NULL DEFAULT 'General Cargo',

  status               text        NOT NULL DEFAULT 'Draft'
                           CHECK (status IN ('Draft','Pending Review','Approved','Live','Rejected','Suspended','Expired')),

  currency             text        NOT NULL DEFAULT 'USD',
  validity_from        date,
  validity_to          date,
  remarks              text,

  -- Admin review
  admin_review_status  text        NOT NULL DEFAULT 'Pending Review'
                           CHECK (admin_review_status IN ('Pending Review','Approved','Rejected')),
  reviewed_by          uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  reviewed_at          timestamptz,
  review_note          text,

  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_service_listings_provider  ON public.service_listings(provider_company_id);
CREATE INDEX idx_service_listings_status    ON public.service_listings(status);
CREATE INDEX idx_service_listings_category  ON public.service_listings(service_category);
CREATE INDEX idx_service_listings_validity  ON public.service_listings(validity_to);

CREATE TRIGGER set_service_listings_updated_at
  BEFORE UPDATE ON public.service_listings
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ─── service_listing_details ─────────────────────────────────────────────────
-- One row per listing; detail_json holds all category-specific fields

CREATE TABLE public.service_listing_details (
  id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  service_listing_id  uuid        NOT NULL UNIQUE REFERENCES public.service_listings(id) ON DELETE CASCADE,
  detail_json         jsonb       NOT NULL DEFAULT '{}'::jsonb,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER set_sld_updated_at
  BEFORE UPDATE ON public.service_listing_details
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ─── marketplace_rfqs ────────────────────────────────────────────────────────

CREATE TABLE public.marketplace_rfqs (
  id                       uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  rfq_reference            text        UNIQUE NOT NULL,
  customer_company_id      uuid        NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  created_by               uuid        NOT NULL REFERENCES auth.users(id) ON DELETE SET NULL,

  service_category         text        NOT NULL,
  origin_country           text,
  destination_country      text,
  origin_location          text,
  destination_location     text,
  cargo_description        text,
  cargo_type               text        NOT NULL DEFAULT 'General Cargo',
  weight_kg                numeric(12,2),
  volume_cbm               numeric(12,3),
  quantity                 text,
  ready_date               date,
  target_delivery_date     date,
  special_requirements     text,
  quote_deadline           timestamptz,

  rfq_status               text        NOT NULL DEFAULT 'Draft'
                               CHECK (rfq_status IN (
                                 'Draft','Open for Quotation','Quotes Received',
                                 'Customer Reviewing','Provider Selected',
                                 'Converted to Job','Expired','Cancelled')),

  customer_identity_masked boolean     NOT NULL DEFAULT true,
  converted_job_id         uuid        REFERENCES public.secured_jobs(id) ON DELETE SET NULL,
  selected_quote_id        uuid,       -- FK to marketplace_quotes added after quotes table created

  created_at               timestamptz NOT NULL DEFAULT now(),
  updated_at               timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_rfqs_customer  ON public.marketplace_rfqs(customer_company_id);
CREATE INDEX idx_rfqs_status    ON public.marketplace_rfqs(rfq_status);
CREATE INDEX idx_rfqs_category  ON public.marketplace_rfqs(service_category);

CREATE TRIGGER set_rfqs_updated_at
  BEFORE UPDATE ON public.marketplace_rfqs
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ─── marketplace_rfq_invites ─────────────────────────────────────────────────

CREATE TABLE public.marketplace_rfq_invites (
  id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  rfq_id              uuid        NOT NULL REFERENCES public.marketplace_rfqs(id) ON DELETE CASCADE,
  rfq_reference       text        NOT NULL,
  provider_company_id uuid        NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  invited_at          timestamptz NOT NULL DEFAULT now(),
  invite_status       text        NOT NULL DEFAULT 'Invited'
                          CHECK (invite_status IN ('Invited','Viewed','Quoting','Declined','Quoted')),
  UNIQUE (rfq_id, provider_company_id)
);

CREATE INDEX idx_rfq_invites_provider ON public.marketplace_rfq_invites(provider_company_id);
CREATE INDEX idx_rfq_invites_rfq      ON public.marketplace_rfq_invites(rfq_id);

-- ─── marketplace_quotes ──────────────────────────────────────────────────────

CREATE TABLE public.marketplace_quotes (
  id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  quote_reference     text        UNIQUE NOT NULL,
  rfq_id              uuid        NOT NULL REFERENCES public.marketplace_rfqs(id) ON DELETE CASCADE,
  rfq_reference       text        NOT NULL,
  provider_company_id uuid        NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  quoted_by           uuid        NOT NULL REFERENCES auth.users(id) ON DELETE SET NULL,

  quote_amount        numeric(18,2) NOT NULL,
  currency            text        NOT NULL DEFAULT 'USD',
  pricing_breakdown   jsonb       NOT NULL DEFAULT '{}'::jsonb,
  transit_time_days   numeric(5,1),
  validity_until      date,
  terms_note          text,
  remarks             text,

  quote_status        text        NOT NULL DEFAULT 'Submitted'
                          CHECK (quote_status IN (
                            'Submitted','Withdrawn','Customer Shortlisted',
                            'Selected','Rejected','Expired')),

  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_quotes_rfq      ON public.marketplace_quotes(rfq_id);
CREATE INDEX idx_quotes_provider ON public.marketplace_quotes(provider_company_id);
CREATE INDEX idx_quotes_status   ON public.marketplace_quotes(quote_status);

CREATE TRIGGER set_quotes_updated_at
  BEFORE UPDATE ON public.marketplace_quotes
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Add FK from rfqs to quotes (now that quotes table exists)
ALTER TABLE public.marketplace_rfqs
  ADD CONSTRAINT fk_rfq_selected_quote
  FOREIGN KEY (selected_quote_id) REFERENCES public.marketplace_quotes(id) ON DELETE SET NULL;

-- ─── provider_marketplace_scores ─────────────────────────────────────────────

CREATE TABLE public.provider_marketplace_scores (
  provider_company_id         uuid        PRIMARY KEY REFERENCES public.companies(id) ON DELETE CASCADE,
  completed_jobs              integer     NOT NULL DEFAULT 0,
  on_time_rate                numeric(5,2),   -- percentage 0-100
  average_response_time_hours numeric(7,2),
  pod_upload_speed_days       numeric(5,2),
  document_accuracy_rate      numeric(5,2),   -- percentage 0-100
  dispute_rate                numeric(5,2),   -- percentage 0-100
  cancellation_rate           numeric(5,2),   -- percentage 0-100
  customer_rating             numeric(3,2),   -- 1.00 - 5.00
  nexum_verified              boolean     NOT NULL DEFAULT false,
  score_updated_at            timestamptz NOT NULL DEFAULT now()
);

-- ─── RLS ─────────────────────────────────────────────────────────────────────

ALTER TABLE public.service_listings          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.service_listing_details   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.marketplace_rfqs          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.marketplace_rfq_invites   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.marketplace_quotes        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.provider_marketplace_scores ENABLE ROW LEVEL SECURITY;

-- service_listings
CREATE POLICY "sl_select_provider_own"  ON public.service_listings FOR SELECT TO authenticated
  USING (nexum_my_role() = 'service_provider' AND provider_company_id = nexum_my_company_id());

CREATE POLICY "sl_select_customer_live" ON public.service_listings FOR SELECT TO authenticated
  USING (nexum_my_role() = 'customer' AND status = 'Live');

CREATE POLICY "sl_select_admin"         ON public.service_listings FOR SELECT TO authenticated
  USING (nexum_is_admin());

CREATE POLICY "sl_insert_provider"      ON public.service_listings FOR INSERT TO authenticated
  WITH CHECK (nexum_my_role() = 'service_provider' AND provider_company_id = nexum_my_company_id());

CREATE POLICY "sl_update_provider_draft" ON public.service_listings FOR UPDATE TO authenticated
  USING (nexum_my_role() = 'service_provider'
         AND provider_company_id = nexum_my_company_id()
         AND status IN ('Draft','Rejected'));

CREATE POLICY "sl_update_admin"         ON public.service_listings FOR UPDATE TO authenticated
  USING (nexum_is_admin());

-- service_listing_details (follow parent listing access)
CREATE POLICY "sld_select_provider"  ON public.service_listing_details FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.service_listings sl
    WHERE sl.id = service_listing_id
    AND (sl.provider_company_id = nexum_my_company_id() OR nexum_is_admin() OR sl.status = 'Live')));

CREATE POLICY "sld_insert_provider"  ON public.service_listing_details FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.service_listings sl
    WHERE sl.id = service_listing_id AND sl.provider_company_id = nexum_my_company_id()));

CREATE POLICY "sld_update_provider"  ON public.service_listing_details FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.service_listings sl
    WHERE sl.id = service_listing_id
    AND (sl.provider_company_id = nexum_my_company_id() OR nexum_is_admin())));

-- marketplace_rfqs
CREATE POLICY "rfq_select_customer_own" ON public.marketplace_rfqs FOR SELECT TO authenticated
  USING (nexum_my_role() = 'customer' AND customer_company_id = nexum_my_company_id());

-- Providers see OPEN RFQs in their service category (identity masked at API layer)
CREATE POLICY "rfq_select_provider_open" ON public.marketplace_rfqs FOR SELECT TO authenticated
  USING (nexum_my_role() = 'service_provider'
         AND rfq_status IN ('Open for Quotation','Quotes Received','Customer Reviewing'));

CREATE POLICY "rfq_select_admin"        ON public.marketplace_rfqs FOR SELECT TO authenticated
  USING (nexum_is_admin());

CREATE POLICY "rfq_insert_customer"     ON public.marketplace_rfqs FOR INSERT TO authenticated
  WITH CHECK (nexum_my_role() = 'customer' AND customer_company_id = nexum_my_company_id());

CREATE POLICY "rfq_update_customer_own" ON public.marketplace_rfqs FOR UPDATE TO authenticated
  USING (nexum_my_role() = 'customer' AND customer_company_id = nexum_my_company_id());

CREATE POLICY "rfq_update_admin"        ON public.marketplace_rfqs FOR UPDATE TO authenticated
  USING (nexum_is_admin());

-- marketplace_rfq_invites
CREATE POLICY "invite_select_provider" ON public.marketplace_rfq_invites FOR SELECT TO authenticated
  USING (nexum_my_role() = 'service_provider' AND provider_company_id = nexum_my_company_id());

CREATE POLICY "invite_select_admin"    ON public.marketplace_rfq_invites FOR SELECT TO authenticated
  USING (nexum_is_admin());

CREATE POLICY "invite_insert_provider" ON public.marketplace_rfq_invites FOR INSERT TO authenticated
  WITH CHECK (nexum_my_role() = 'service_provider' AND provider_company_id = nexum_my_company_id());

CREATE POLICY "invite_insert_admin"    ON public.marketplace_rfq_invites FOR INSERT TO authenticated
  WITH CHECK (nexum_is_admin());

-- marketplace_quotes
CREATE POLICY "quote_select_provider_own" ON public.marketplace_quotes FOR SELECT TO authenticated
  USING (nexum_my_role() = 'service_provider' AND provider_company_id = nexum_my_company_id());

-- Customer can see quotes on their own RFQs
CREATE POLICY "quote_select_customer"  ON public.marketplace_quotes FOR SELECT TO authenticated
  USING (nexum_my_role() = 'customer'
         AND EXISTS (SELECT 1 FROM public.marketplace_rfqs r
                     WHERE r.id = rfq_id AND r.customer_company_id = nexum_my_company_id()));

CREATE POLICY "quote_select_admin"     ON public.marketplace_quotes FOR SELECT TO authenticated
  USING (nexum_is_admin());

CREATE POLICY "quote_insert_provider"  ON public.marketplace_quotes FOR INSERT TO authenticated
  WITH CHECK (nexum_my_role() = 'service_provider' AND provider_company_id = nexum_my_company_id());

CREATE POLICY "quote_update_provider"  ON public.marketplace_quotes FOR UPDATE TO authenticated
  USING (nexum_my_role() = 'service_provider' AND provider_company_id = nexum_my_company_id());

CREATE POLICY "quote_update_admin"     ON public.marketplace_quotes FOR UPDATE TO authenticated
  USING (nexum_is_admin());

-- provider_marketplace_scores — public read for customers/providers, admin write
CREATE POLICY "score_select_all"       ON public.provider_marketplace_scores FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "score_upsert_admin"     ON public.provider_marketplace_scores FOR ALL TO authenticated
  USING (nexum_is_admin()) WITH CHECK (nexum_is_admin());
