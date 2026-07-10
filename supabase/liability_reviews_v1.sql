-- ─── Liability Reviews v1 ────────────────────────────────────────────────────
-- Evidence collection and preliminary review workflow for cargo incidents.
-- NOT a legal determination. All outcomes require admin/legal/insurance review.

-- ── Tables ─────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.liability_reviews (
  id                        uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  job_reference             text        NOT NULL,
  dispute_case_id           uuid        REFERENCES public.dispute_cases(id)     ON DELETE SET NULL,
  exception_id              uuid        REFERENCES public.job_exceptions(id)    ON DELETE SET NULL,
  customer_company_id       uuid        REFERENCES public.companies(id)         ON DELETE SET NULL,
  provider_company_id       uuid        REFERENCES public.companies(id)         ON DELETE SET NULL,

  liability_review_status   text        NOT NULL DEFAULT 'Pending Review'
    CHECK (liability_review_status IN (
      'Not Required',
      'Pending Review',
      'Under Review',
      'Evidence Requested',
      'Insurance Review',
      'Liability Unclear',
      'Provider Potentially Liable',
      'Customer Potentially Liable',
      'Third Party / Carrier Potentially Liable',
      'No Liability Identified',
      'Resolved',
      'Closed'
    )),

  incident_type             text
    CHECK (incident_type IN (
      'Cargo Damage',
      'Cargo Loss',
      'Short Delivery',
      'Late Delivery',
      'POD Mismatch',
      'Wrong Cargo',
      'Temperature Excursion',
      'Customs Hold',
      'Other'
    )),

  claimed_amount            numeric,
  currency                  text        NOT NULL DEFAULT 'RM',
  cargo_value               numeric,
  liability_limit_note      text,

  insurance_available       boolean,
  insurance_policy_reference text,
  insurance_claim_status    text        NOT NULL DEFAULT 'Not Applicable'
    CHECK (insurance_claim_status IN (
      'Not Applicable',
      'Not Submitted',
      'Pending Submission',
      'Submitted',
      'Under Review',
      'Approved',
      'Rejected',
      'Paid',
      'Closed'
    )),

  evidence_summary          text,
  admin_review_note         text,
  preliminary_position      text,
  resolution_note           text,

  reviewed_by               uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  reviewed_at               timestamptz,
  resolved_at               timestamptz,

  created_at                timestamptz NOT NULL DEFAULT now(),
  updated_at                timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.liability_evidence (
  id                        uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  liability_review_id       uuid        NOT NULL REFERENCES public.liability_reviews(id) ON DELETE CASCADE,
  job_reference             text        NOT NULL,
  document_id               uuid        REFERENCES public.documents(id)         ON DELETE SET NULL,
  evidence_type             text
    CHECK (evidence_type IN (
      'POD',
      'Photo',
      'Damage Report',
      'Inspection Report',
      'Temperature Log',
      'Delivery Note',
      'Insurance Policy',
      'Carrier Report',
      'Customer Statement',
      'Provider Statement',
      'Other'
    )),
  uploaded_by_role          text,
  uploaded_by_user_id       uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  remarks                   text,
  created_at                timestamptz NOT NULL DEFAULT now()
);

-- ── Indexes ────────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS lr_job_ref_idx         ON public.liability_reviews (job_reference);
CREATE INDEX IF NOT EXISTS lr_dispute_idx          ON public.liability_reviews (dispute_case_id);
CREATE INDEX IF NOT EXISTS lr_exception_idx        ON public.liability_reviews (exception_id);
CREATE INDEX IF NOT EXISTS lr_customer_idx         ON public.liability_reviews (customer_company_id);
CREATE INDEX IF NOT EXISTS lr_provider_idx         ON public.liability_reviews (provider_company_id);
CREATE INDEX IF NOT EXISTS lr_status_idx           ON public.liability_reviews (liability_review_status);
CREATE INDEX IF NOT EXISTS lr_incident_type_idx    ON public.liability_reviews (incident_type);

CREATE INDEX IF NOT EXISTS le_review_id_idx        ON public.liability_evidence (liability_review_id);
CREATE INDEX IF NOT EXISTS le_job_ref_idx          ON public.liability_evidence (job_reference);
CREATE INDEX IF NOT EXISTS le_document_id_idx      ON public.liability_evidence (document_id);

-- ── updated_at trigger ─────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.set_liability_review_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_liability_reviews_updated_at ON public.liability_reviews;
CREATE TRIGGER trg_liability_reviews_updated_at
  BEFORE UPDATE ON public.liability_reviews
  FOR EACH ROW EXECUTE FUNCTION public.set_liability_review_updated_at();

-- ── RLS ───────────────────────────────────────────────────────────────────────

ALTER TABLE public.liability_reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.liability_evidence ENABLE ROW LEVEL SECURITY;

-- liability_reviews: Admin — full access
CREATE POLICY lr_admin_all ON public.liability_reviews
  FOR ALL TO authenticated
  USING (nexum_is_admin())
  WITH CHECK (nexum_is_admin());

-- liability_reviews: Provider — read if they are the provider party
CREATE POLICY lr_provider_read ON public.liability_reviews
  FOR SELECT TO authenticated
  USING (
    provider_company_id IN (
      SELECT company_id FROM public.profiles
      WHERE id = auth.uid() AND role = 'service_provider'
    )
  );

-- liability_reviews: Customer — read if they are the customer party
CREATE POLICY lr_customer_read ON public.liability_reviews
  FOR SELECT TO authenticated
  USING (
    customer_company_id IN (
      SELECT company_id FROM public.profiles
      WHERE id = auth.uid() AND role = 'customer'
    )
  );

-- liability_evidence: Admin — full access
CREATE POLICY le_admin_all ON public.liability_evidence
  FOR ALL TO authenticated
  USING (nexum_is_admin())
  WITH CHECK (nexum_is_admin());

-- liability_evidence: Provider — read evidence for their reviews
CREATE POLICY le_provider_read ON public.liability_evidence
  FOR SELECT TO authenticated
  USING (
    liability_review_id IN (
      SELECT lr.id FROM public.liability_reviews lr
      WHERE lr.provider_company_id IN (
        SELECT company_id FROM public.profiles
        WHERE id = auth.uid() AND role = 'service_provider'
      )
    )
  );

-- liability_evidence: Customer — read evidence for their reviews
CREATE POLICY le_customer_read ON public.liability_evidence
  FOR SELECT TO authenticated
  USING (
    liability_review_id IN (
      SELECT lr.id FROM public.liability_reviews lr
      WHERE lr.customer_company_id IN (
        SELECT company_id FROM public.profiles
        WHERE id = auth.uid() AND role = 'customer'
      )
    )
  );

-- Note: Evidence INSERT for provider/customer is done via service-role API route
-- (API validates role and companyId before inserting), so no INSERT RLS policy needed
-- for non-admin roles — they go through the API which uses service role client.
