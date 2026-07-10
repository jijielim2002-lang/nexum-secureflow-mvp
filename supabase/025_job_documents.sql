-- ─── Document Intelligence Layer v1 ─────────────────────────────────────────
-- Tables: job_documents, job_document_requirements, job_document_extracted_fields
-- Storage: job-documents bucket (may already exist via lib/documents.ts)
-- All statements are idempotent (IF NOT EXISTS / ON CONFLICT DO NOTHING)

-- ─── Tables ───────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS job_documents (
  id                    uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
  job_reference         text         NOT NULL REFERENCES secured_jobs(job_reference) ON DELETE CASCADE,
  company_id            uuid         NOT NULL REFERENCES companies(id),
  document_type         text         NOT NULL,
  -- commercial_invoice | packing_list | kastam_form | bl_awb_do | payment_slip
  -- pod | quotation_job_order | permit_license | insurance | other
  document_label        text,
  storage_bucket        text         NOT NULL DEFAULT 'job-documents',
  storage_path          text         NOT NULL,
  file_name             text         NOT NULL,
  file_size_bytes       bigint,
  mime_type             text,
  uploaded_by_user_id   uuid         REFERENCES profiles(id),
  uploaded_by_role      text         NOT NULL,
  -- admin | service_provider | customer
  verification_status   text         NOT NULL DEFAULT 'pending',
  -- pending | verified | rejected
  verified_by_user_id   uuid         REFERENCES profiles(id),
  verified_at           timestamptz,
  rejection_reason      text,
  mismatch_flags        jsonb        NOT NULL DEFAULT '[]'::jsonb,
  notes                 text,
  is_evidence_pack_item boolean      NOT NULL DEFAULT false,
  created_at            timestamptz  NOT NULL DEFAULT now(),
  updated_at            timestamptz  NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS job_document_requirements (
  id                  uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
  job_reference       text         NOT NULL REFERENCES secured_jobs(job_reference) ON DELETE CASCADE,
  document_type       text         NOT NULL,
  requirement_level   text         NOT NULL DEFAULT 'optional',
  -- required | optional | not_applicable
  responsible_role    text         NOT NULL DEFAULT 'any',
  -- admin | service_provider | customer | any
  upload_deadline     timestamptz,
  waived_by_user_id   uuid         REFERENCES profiles(id),
  waived_at           timestamptz,
  waiver_reason       text,
  created_at          timestamptz  NOT NULL DEFAULT now(),
  updated_at          timestamptz  NOT NULL DEFAULT now(),
  UNIQUE (job_reference, document_type)
);

CREATE TABLE IF NOT EXISTS job_document_extracted_fields (
  id                    uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
  job_document_id       uuid         NOT NULL REFERENCES job_documents(id) ON DELETE CASCADE,
  job_reference         text         NOT NULL,
  field_key             text         NOT NULL,
  field_label           text,
  field_value           text,
  field_value_numeric   numeric,
  field_value_date      date,
  extraction_method     text         NOT NULL DEFAULT 'manual',
  -- manual | ocr_pending (reserved)
  entered_by_user_id    uuid         REFERENCES profiles(id),
  entered_by_role       text,
  confidence_score      numeric,
  is_verified           boolean      NOT NULL DEFAULT false,
  created_at            timestamptz  NOT NULL DEFAULT now(),
  updated_at            timestamptz  NOT NULL DEFAULT now(),
  UNIQUE (job_document_id, field_key)
);

-- ─── updated_at triggers ──────────────────────────────────────────────────────

DROP TRIGGER IF EXISTS set_updated_at ON job_documents;
CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON job_documents
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS set_updated_at ON job_document_requirements;
CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON job_document_requirements
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS set_updated_at ON job_document_extracted_fields;
CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON job_document_extracted_fields
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ─── Indexes ──────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS job_documents_job_ref_idx
  ON job_documents (job_reference);

CREATE INDEX IF NOT EXISTS job_documents_company_id_idx
  ON job_documents (company_id);

CREATE INDEX IF NOT EXISTS job_documents_type_idx
  ON job_documents (document_type);

CREATE INDEX IF NOT EXISTS job_documents_status_idx
  ON job_documents (verification_status);

CREATE INDEX IF NOT EXISTS job_document_requirements_job_ref_idx
  ON job_document_requirements (job_reference);

CREATE INDEX IF NOT EXISTS job_document_extracted_fields_doc_id_idx
  ON job_document_extracted_fields (job_document_id);

CREATE INDEX IF NOT EXISTS job_document_extracted_fields_job_ref_idx
  ON job_document_extracted_fields (job_reference);

-- ─── RLS ──────────────────────────────────────────────────────────────────────

ALTER TABLE job_documents               ENABLE ROW LEVEL SECURITY;
ALTER TABLE job_document_requirements   ENABLE ROW LEVEL SECURITY;
ALTER TABLE job_document_extracted_fields ENABLE ROW LEVEL SECURITY;

-- job_documents
DROP POLICY IF EXISTS "admin_all_job_documents"              ON job_documents;
DROP POLICY IF EXISTS "provider_select_job_documents"        ON job_documents;
DROP POLICY IF EXISTS "provider_insert_job_documents"        ON job_documents;
DROP POLICY IF EXISTS "customer_select_job_documents"        ON job_documents;
DROP POLICY IF EXISTS "customer_insert_job_documents"        ON job_documents;

CREATE POLICY "admin_all_job_documents" ON job_documents
  FOR ALL TO authenticated
  USING (nexum_is_admin())
  WITH CHECK (nexum_is_admin());

-- Provider: view docs for jobs they're the service provider of
CREATE POLICY "provider_select_job_documents" ON job_documents
  FOR SELECT TO authenticated
  USING (
    nexum_my_role() = 'service_provider'
    AND job_reference IN (
      SELECT job_reference FROM secured_jobs
      WHERE service_provider_company_id = nexum_my_company_id()
    )
  );

-- Provider: upload pod, bl_awb_do, quotation_job_order, permit_license, insurance, other
CREATE POLICY "provider_insert_job_documents" ON job_documents
  FOR INSERT TO authenticated
  WITH CHECK (
    nexum_my_role() = 'service_provider'
    AND uploaded_by_role = 'service_provider'
    AND document_type IN ('pod', 'bl_awb_do', 'quotation_job_order', 'permit_license', 'insurance', 'other')
    AND job_reference IN (
      SELECT job_reference FROM secured_jobs
      WHERE service_provider_company_id = nexum_my_company_id()
    )
    AND company_id = nexum_my_company_id()
  );

-- Customer: view docs for their own jobs
CREATE POLICY "customer_select_job_documents" ON job_documents
  FOR SELECT TO authenticated
  USING (
    nexum_my_role() = 'customer'
    AND job_reference IN (
      SELECT job_reference FROM secured_jobs
      WHERE customer_company_id = nexum_my_company_id()
    )
  );

-- Customer: upload payment_slip, commercial_invoice, packing_list, kastam_form, permit_license
CREATE POLICY "customer_insert_job_documents" ON job_documents
  FOR INSERT TO authenticated
  WITH CHECK (
    nexum_my_role() = 'customer'
    AND uploaded_by_role = 'customer'
    AND document_type IN ('payment_slip', 'commercial_invoice', 'packing_list', 'kastam_form', 'permit_license', 'insurance')
    AND job_reference IN (
      SELECT job_reference FROM secured_jobs
      WHERE customer_company_id = nexum_my_company_id()
    )
    AND company_id = nexum_my_company_id()
  );

-- job_document_requirements
DROP POLICY IF EXISTS "admin_all_job_doc_requirements"    ON job_document_requirements;
DROP POLICY IF EXISTS "provider_select_job_doc_req"       ON job_document_requirements;
DROP POLICY IF EXISTS "customer_select_job_doc_req"       ON job_document_requirements;

CREATE POLICY "admin_all_job_doc_requirements" ON job_document_requirements
  FOR ALL TO authenticated
  USING (nexum_is_admin())
  WITH CHECK (nexum_is_admin());

CREATE POLICY "provider_select_job_doc_req" ON job_document_requirements
  FOR SELECT TO authenticated
  USING (
    nexum_my_role() = 'service_provider'
    AND job_reference IN (
      SELECT job_reference FROM secured_jobs
      WHERE service_provider_company_id = nexum_my_company_id()
    )
  );

CREATE POLICY "customer_select_job_doc_req" ON job_document_requirements
  FOR SELECT TO authenticated
  USING (
    nexum_my_role() = 'customer'
    AND job_reference IN (
      SELECT job_reference FROM secured_jobs
      WHERE customer_company_id = nexum_my_company_id()
    )
  );

-- job_document_extracted_fields
DROP POLICY IF EXISTS "admin_all_job_doc_fields"     ON job_document_extracted_fields;
DROP POLICY IF EXISTS "provider_select_doc_fields"   ON job_document_extracted_fields;
DROP POLICY IF EXISTS "provider_insert_doc_fields"   ON job_document_extracted_fields;
DROP POLICY IF EXISTS "customer_select_doc_fields"   ON job_document_extracted_fields;

CREATE POLICY "admin_all_job_doc_fields" ON job_document_extracted_fields
  FOR ALL TO authenticated
  USING (nexum_is_admin())
  WITH CHECK (nexum_is_admin());

CREATE POLICY "provider_select_doc_fields" ON job_document_extracted_fields
  FOR SELECT TO authenticated
  USING (
    nexum_my_role() = 'service_provider'
    AND job_document_id IN (
      SELECT id FROM job_documents
      WHERE job_reference IN (
        SELECT job_reference FROM secured_jobs
        WHERE service_provider_company_id = nexum_my_company_id()
      )
    )
  );

CREATE POLICY "provider_insert_doc_fields" ON job_document_extracted_fields
  FOR INSERT TO authenticated
  WITH CHECK (
    nexum_my_role() = 'service_provider'
    AND entered_by_role = 'service_provider'
    AND job_document_id IN (
      SELECT id FROM job_documents
      WHERE job_reference IN (
        SELECT job_reference FROM secured_jobs
        WHERE service_provider_company_id = nexum_my_company_id()
      )
      AND uploaded_by_role = 'service_provider'
    )
  );

CREATE POLICY "customer_select_doc_fields" ON job_document_extracted_fields
  FOR SELECT TO authenticated
  USING (
    nexum_my_role() = 'customer'
    AND job_document_id IN (
      SELECT id FROM job_documents
      WHERE job_reference IN (
        SELECT job_reference FROM secured_jobs
        WHERE customer_company_id = nexum_my_company_id()
      )
    )
  );

-- ─── Storage bucket (idempotent) ──────────────────────────────────────────────
-- Note: job-documents bucket may already exist via lib/documents.ts usage.
-- This is a no-op if it already exists.

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'job-documents',
  'job-documents',
  false,
  52428800,  -- 50 MB
  ARRAY[
    'application/pdf',
    'image/jpeg', 'image/jpg', 'image/png', 'image/webp',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  ]
)
ON CONFLICT (id) DO NOTHING;

-- Storage RLS for job-documents bucket
DROP POLICY IF EXISTS "job_documents_admin_all"           ON storage.objects;
DROP POLICY IF EXISTS "job_documents_provider_upload"     ON storage.objects;
DROP POLICY IF EXISTS "job_documents_customer_upload"     ON storage.objects;
DROP POLICY IF EXISTS "job_documents_party_read"          ON storage.objects;

CREATE POLICY "job_documents_admin_all" ON storage.objects
  FOR ALL TO authenticated
  USING (bucket_id = 'job-documents' AND nexum_is_admin())
  WITH CHECK (bucket_id = 'job-documents' AND nexum_is_admin());

-- Provider: upload within their company folder
CREATE POLICY "job_documents_provider_upload" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'job-documents'
    AND nexum_my_role() = 'service_provider'
    AND (storage.foldername(name))[1] = nexum_my_company_id()::text
  );

-- Customer: upload within their company folder
CREATE POLICY "job_documents_customer_upload" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'job-documents'
    AND nexum_my_role() = 'customer'
    AND (storage.foldername(name))[1] = nexum_my_company_id()::text
  );

-- All authenticated parties read their own company folder
CREATE POLICY "job_documents_party_read" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'job-documents'
    AND (
      nexum_is_admin()
      OR (storage.foldername(name))[1] = nexum_my_company_id()::text
    )
  );

-- ─── Go-live readiness items ──────────────────────────────────────────────────

INSERT INTO go_live_readiness_items (category, item_key, label, description, status, is_blocker)
VALUES
  (
    'Document Intelligence',
    'doc_upload_tested',
    'Document upload tested (all 3 roles)',
    'Admin, provider, and customer can each upload documents of their permitted types.',
    'Pending',
    true
  ),
  (
    'Document Intelligence',
    'doc_checklist_tested',
    'Document checklist visible on job pages',
    'JobDocumentPanel renders on admin, provider, and customer job pages without blocking page load.',
    'Pending',
    true
  ),
  (
    'Document Intelligence',
    'payment_slip_extraction_tested',
    'Payment slip field entry tested',
    'Admin can manually enter payment_amount, payer_name, bank_name for a payment slip and save.',
    'Pending',
    false
  ),
  (
    'Document Intelligence',
    'pod_extraction_tested',
    'POD field entry tested',
    'Provider or admin can manually enter delivery_date, receiver_name, pod_reference for a POD.',
    'Pending',
    false
  ),
  (
    'Document Intelligence',
    'evidence_pack_capture_tested',
    'Evidence pack document capture tested',
    'Verified documents marked as evidence pack items are captured in the evidence pack for a job.',
    'Pending',
    false
  ),
  (
    'Document Intelligence',
    'mismatch_detection_tested',
    'Mismatch detection flags tested',
    'Invoice value vs cargo_value_amount mismatch is flagged when values diverge by >10%.',
    'Pending',
    false
  )
ON CONFLICT (item_key) DO NOTHING;
