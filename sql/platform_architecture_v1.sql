-- ============================================================
-- Platform Architecture Upgrade v1
-- Run in Supabase SQL Editor
-- Parts A, B, D, G
-- ============================================================

-- ─────────────────────────────────────────────────────────────
-- PART A: Company User Roles
-- ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.company_user_roles (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id   uuid        REFERENCES public.companies(id) ON DELETE CASCADE,
  user_id      uuid        REFERENCES auth.users(id) ON DELETE CASCADE,
  email        text,
  role         text        NOT NULL CHECK (role IN (
                             'Company Admin', 'Finance', 'User',
                             'Operations', 'Document Clerk', 'Manager', 'Viewer'
                           )),
  status       text        NOT NULL DEFAULT 'Pending'
                           CHECK (status IN ('Pending','Active','Suspended','Removed')),
  invited_by   uuid        REFERENCES auth.users(id),
  approved_by  uuid        REFERENCES auth.users(id),
  approved_at  timestamptz,
  created_at   timestamptz DEFAULT now(),
  updated_at   timestamptz DEFAULT now(),
  UNIQUE (company_id, user_id)
);

ALTER TABLE public.company_user_roles ENABLE ROW LEVEL SECURITY;

-- Nexum admin sees all
CREATE POLICY "admin_all_company_user_roles"
  ON public.company_user_roles FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- Company admin can manage own company roles
CREATE POLICY "company_admin_manage_roles"
  ON public.company_user_roles FOR ALL TO authenticated
  USING (
    company_id IN (
      SELECT cur.company_id FROM public.company_user_roles cur
      WHERE cur.user_id = auth.uid()
        AND cur.role = 'Company Admin'
        AND cur.status = 'Active'
    )
  );

-- Users can see their own role record
CREATE POLICY "user_see_own_role"
  ON public.company_user_roles FOR SELECT TO authenticated
  USING (user_id = auth.uid());

-- ─────────────────────────────────────────────────────────────
-- PART B: Counterparty Masking & Mapping
-- ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.counterparty_mappings (
  id                  uuid  PRIMARY KEY DEFAULT gen_random_uuid(),
  real_company_id     uuid  REFERENCES public.companies(id) ON DELETE CASCADE,
  owner_company_id    uuid  REFERENCES public.companies(id) ON DELETE CASCADE,
  masked_code         text  NOT NULL,
  masked_name         text,
  relationship_type   text  CHECK (relationship_type IN (
                              'Supplier','Customer','Buyer','Service Provider',
                              'Broker','Consignee','Shipper','Other'
                            )),
  visibility_level    text  DEFAULT 'Masked'
                            CHECK (visibility_level IN ('Full','Masked','Hidden')),
  created_at          timestamptz DEFAULT now(),
  UNIQUE (real_company_id, owner_company_id, relationship_type)
);

ALTER TABLE public.counterparty_mappings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_all_counterparty_mappings"
  ON public.counterparty_mappings FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- Company can see mappings it owns
CREATE POLICY "company_read_own_mappings"
  ON public.counterparty_mappings FOR SELECT TO authenticated
  USING (
    owner_company_id IN (
      SELECT company_id FROM public.profiles WHERE id = auth.uid()
    )
  );

-- ─────────────────────────────────────────────────────────────
-- Sensitive Data Access Logs
-- ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.sensitive_data_access_logs (
  id                  uuid  PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             uuid  REFERENCES auth.users(id),
  company_id          uuid  REFERENCES public.companies(id),
  target_record_type  text,
  target_record_id    text,
  sensitive_field     text,
  access_reason       text,
  access_level        text,
  created_at          timestamptz DEFAULT now()
);

ALTER TABLE public.sensitive_data_access_logs ENABLE ROW LEVEL SECURITY;

-- Only service role can write; admins read all
CREATE POLICY "service_role_all_access_logs"
  ON public.sensitive_data_access_logs FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- Users can read their own access log entries
CREATE POLICY "user_read_own_access_logs"
  ON public.sensitive_data_access_logs FOR SELECT TO authenticated
  USING (user_id = auth.uid());

-- ─────────────────────────────────────────────────────────────
-- PART D: Dual-LLM Extraction
-- ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.document_extraction_runs (
  id              uuid  PRIMARY KEY DEFAULT gen_random_uuid(),
  file_id         uuid  REFERENCES public.document_ingestion_files(id) ON DELETE CASCADE,
  provider        text  NOT NULL,  -- 'OpenAI' | 'Anthropic' | etc.
  model           text,
  status          text  DEFAULT 'Pending'
                        CHECK (status IN ('Pending','Running','Completed','Failed')),
  raw_output      jsonb,
  extracted_fields jsonb,
  confidence_score numeric,
  error_message   text,
  duration_ms     int,
  created_at      timestamptz DEFAULT now(),
  updated_at      timestamptz DEFAULT now()
);

ALTER TABLE public.document_extraction_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_all_extraction_runs"
  ON public.document_extraction_runs FOR ALL TO service_role
  USING (true) WITH CHECK (true);

CREATE TABLE IF NOT EXISTS public.document_extraction_comparisons (
  id                    uuid    PRIMARY KEY DEFAULT gen_random_uuid(),
  file_id               uuid    REFERENCES public.document_ingestion_files(id) ON DELETE CASCADE,
  job_reference         text,
  primary_provider      text,
  secondary_provider    text,
  primary_run_id        uuid    REFERENCES public.document_extraction_runs(id),
  secondary_run_id      uuid    REFERENCES public.document_extraction_runs(id),
  comparison_status     text    DEFAULT 'Pending'
                                CHECK (comparison_status IN (
                                  'Pending','Matched','Minor Differences',
                                  'Conflict','Failed','Reviewed'
                                )),
  matched_fields        jsonb   DEFAULT '[]'::jsonb,
  mismatched_fields     jsonb   DEFAULT '[]'::jsonb,
  missing_fields        jsonb   DEFAULT '[]'::jsonb,
  confidence_score      numeric,
  final_review_status   text    DEFAULT 'Pending'
                                CHECK (final_review_status IN (
                                  'Pending','Accepted','Corrected','Rejected'
                                )),
  reviewed_by           uuid    REFERENCES auth.users(id),
  reviewed_at           timestamptz,
  review_note           text,
  created_at            timestamptz DEFAULT now(),
  updated_at            timestamptz DEFAULT now()
);

ALTER TABLE public.document_extraction_comparisons ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_all_extraction_comparisons"
  ON public.document_extraction_comparisons FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- Nexum admin can review all comparisons (via service role API)
-- Provider can see comparisons for their own batches
CREATE POLICY "provider_read_own_comparisons"
  ON public.document_extraction_comparisons FOR SELECT TO authenticated
  USING (
    file_id IN (
      SELECT dif.id FROM public.document_ingestion_files dif
      JOIN public.document_ingestion_batches dib ON dib.id = dif.batch_id
      WHERE dib.provider_company_id IN (
        SELECT company_id FROM public.profiles WHERE id = auth.uid()
      )
    )
  );

-- ─────────────────────────────────────────────────────────────
-- PART B: Helper function — masked company name
-- ─────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.get_masked_company_name(
  p_real_company_id   uuid,
  p_viewer_company_id uuid,
  p_viewer_role       text DEFAULT 'User'
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_mapping   public.counterparty_mappings%ROWTYPE;
  v_real_name text;
BEGIN
  -- Nexum admin always gets full name
  IF p_viewer_role = 'nexum_admin' THEN
    SELECT name INTO v_real_name FROM public.companies WHERE id = p_real_company_id;
    RETURN v_real_name;
  END IF;

  -- Same company always sees full name
  IF p_real_company_id = p_viewer_company_id THEN
    SELECT name INTO v_real_name FROM public.companies WHERE id = p_real_company_id;
    RETURN v_real_name;
  END IF;

  -- Look up mapping
  SELECT * INTO v_mapping
  FROM public.counterparty_mappings
  WHERE real_company_id  = p_real_company_id
    AND owner_company_id = p_viewer_company_id
  LIMIT 1;

  -- No mapping: return generic masked code
  IF NOT FOUND THEN
    RETURN 'Company-' || UPPER(LEFT(p_real_company_id::text, 6));
  END IF;

  -- Apply visibility
  IF v_mapping.visibility_level = 'Full' THEN
    SELECT name INTO v_real_name FROM public.companies WHERE id = p_real_company_id;
    RETURN v_real_name;
  ELSIF v_mapping.visibility_level = 'Hidden' THEN
    RETURN '[Hidden]';
  ELSE
    -- Masked: return masked_name or masked_code
    RETURN COALESCE(v_mapping.masked_name, v_mapping.masked_code);
  END IF;
END;
$$;

