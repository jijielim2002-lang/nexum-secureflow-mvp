-- =============================================================================
-- NEXUM SECUREFLOW — 002_live_rls_policies.sql
-- Row Level Security Policies — Live Pilot Baseline
--
-- RUN AFTER: 001_live_baseline_schema.sql
--
-- POLICY DESIGN:
--   Admin     — full access to all tables via service-role API or nexum_is_admin()
--   Provider  — view/edit own jobs only; upload POD; cannot verify payment or approve release
--   Customer  — view own/invited jobs only; upload payment proof; confirm delivery; raise dispute
--
-- SERVICE ROLE:
--   All API routes that write data use the service role key (server-side only).
--   Service role bypasses RLS — policies here govern browser client only.
--
-- HELPER FUNCTIONS (defined in 001):
--   nexum_is_admin()        — true if profiles.role = 'admin' for auth.uid()
--   nexum_my_role()         — returns role text for auth.uid()
--   nexum_my_company_id()   — returns company_id for auth.uid()
-- =============================================================================


-- =============================================================================
-- COMPANIES
-- =============================================================================

DROP POLICY IF EXISTS "companies_select_admin"    ON public.companies;
DROP POLICY IF EXISTS "companies_all_admin"        ON public.companies;
DROP POLICY IF EXISTS "companies_select_member"   ON public.companies;

-- Admin: full access
CREATE POLICY "companies_all_admin"
  ON public.companies FOR ALL TO authenticated
  USING (nexum_is_admin()) WITH CHECK (nexum_is_admin());

-- Provider / Customer: can view their own company record
CREATE POLICY "companies_select_own"
  ON public.companies FOR SELECT TO authenticated
  USING (id = nexum_my_company_id());


-- =============================================================================
-- PROFILES
-- =============================================================================

DROP POLICY IF EXISTS "profiles_select_self"     ON public.profiles;
DROP POLICY IF EXISTS "profiles_update_self"     ON public.profiles;
DROP POLICY IF EXISTS "profiles_all_admin"       ON public.profiles;

-- Admin: full access
CREATE POLICY "profiles_all_admin"
  ON public.profiles FOR ALL TO authenticated
  USING (nexum_is_admin()) WITH CHECK (nexum_is_admin());

-- Users: view and update own profile only
CREATE POLICY "profiles_select_self"
  ON public.profiles FOR SELECT TO authenticated
  USING (id = auth.uid());

CREATE POLICY "profiles_update_self"
  ON public.profiles FOR UPDATE TO authenticated
  USING (id = auth.uid()) WITH CHECK (id = auth.uid());


-- =============================================================================
-- SECURED_JOBS
-- =============================================================================

DROP POLICY IF EXISTS "secured_jobs_all_admin"             ON public.secured_jobs;
DROP POLICY IF EXISTS "secured_jobs_select_provider"       ON public.secured_jobs;
DROP POLICY IF EXISTS "secured_jobs_select_customer"       ON public.secured_jobs;
DROP POLICY IF EXISTS "secured_jobs_update_provider"       ON public.secured_jobs;
DROP POLICY IF EXISTS "secured_jobs_insert_admin"          ON public.secured_jobs;

-- Admin: full access
CREATE POLICY "secured_jobs_all_admin"
  ON public.secured_jobs FOR ALL TO authenticated
  USING (nexum_is_admin()) WITH CHECK (nexum_is_admin());

-- Provider: view jobs where they are the service provider
CREATE POLICY "secured_jobs_select_provider"
  ON public.secured_jobs FOR SELECT TO authenticated
  USING (
    nexum_my_role() = 'service_provider'
    AND service_provider_company_id = nexum_my_company_id()
  );

-- Provider: can update delivery/POD fields on their own jobs (milestone, pod_uploaded_at)
-- Write operations that change payment or release status must go through admin API.
CREATE POLICY "secured_jobs_update_provider"
  ON public.secured_jobs FOR UPDATE TO authenticated
  USING (
    nexum_my_role() = 'service_provider'
    AND service_provider_company_id = nexum_my_company_id()
  )
  WITH CHECK (
    nexum_my_role() = 'service_provider'
    AND service_provider_company_id = nexum_my_company_id()
  );

-- Customer: view jobs where they are the customer
CREATE POLICY "secured_jobs_select_customer"
  ON public.secured_jobs FOR SELECT TO authenticated
  USING (
    nexum_my_role() = 'customer'
    AND customer_company_id = nexum_my_company_id()
  );

-- Customer: can update confirmation fields on their own jobs
CREATE POLICY "secured_jobs_update_customer"
  ON public.secured_jobs FOR UPDATE TO authenticated
  USING (
    nexum_my_role() = 'customer'
    AND customer_company_id = nexum_my_company_id()
  )
  WITH CHECK (
    nexum_my_role() = 'customer'
    AND customer_company_id = nexum_my_company_id()
  );


-- =============================================================================
-- DOCUMENTS
-- =============================================================================

DROP POLICY IF EXISTS "documents_all_admin"           ON public.documents;
DROP POLICY IF EXISTS "documents_select_provider"     ON public.documents;
DROP POLICY IF EXISTS "documents_insert_provider"     ON public.documents;
DROP POLICY IF EXISTS "documents_select_customer"     ON public.documents;
DROP POLICY IF EXISTS "documents_insert_customer"     ON public.documents;

CREATE POLICY "documents_all_admin"
  ON public.documents FOR ALL TO authenticated
  USING (nexum_is_admin()) WITH CHECK (nexum_is_admin());

-- Provider: view documents for their jobs only; can upload POD
CREATE POLICY "documents_select_provider"
  ON public.documents FOR SELECT TO authenticated
  USING (
    nexum_my_role() = 'service_provider'
    AND EXISTS (
      SELECT 1 FROM secured_jobs sj
      WHERE sj.job_reference = documents.job_reference
        AND sj.service_provider_company_id = nexum_my_company_id()
    )
  );

CREATE POLICY "documents_insert_provider"
  ON public.documents FOR INSERT TO authenticated
  WITH CHECK (
    nexum_my_role() = 'service_provider'
    AND document_type = 'Proof of Delivery'
    AND company_id = nexum_my_company_id()
    AND EXISTS (
      SELECT 1 FROM secured_jobs sj
      WHERE sj.job_reference = documents.job_reference
        AND sj.service_provider_company_id = nexum_my_company_id()
    )
  );

-- Customer: view documents for their jobs only; can upload payment proof
CREATE POLICY "documents_select_customer"
  ON public.documents FOR SELECT TO authenticated
  USING (
    nexum_my_role() = 'customer'
    AND EXISTS (
      SELECT 1 FROM secured_jobs sj
      WHERE sj.job_reference = documents.job_reference
        AND sj.customer_company_id = nexum_my_company_id()
    )
  );

CREATE POLICY "documents_insert_customer"
  ON public.documents FOR INSERT TO authenticated
  WITH CHECK (
    nexum_my_role() = 'customer'
    AND document_type = 'Payment Proof'
    AND company_id = nexum_my_company_id()
    AND EXISTS (
      SELECT 1 FROM secured_jobs sj
      WHERE sj.job_reference = documents.job_reference
        AND sj.customer_company_id = nexum_my_company_id()
    )
  );


-- =============================================================================
-- PAYMENT_OBLIGATIONS
-- =============================================================================

DROP POLICY IF EXISTS "pay_ob_all_admin"         ON public.payment_obligations;
DROP POLICY IF EXISTS "pay_ob_select_provider"   ON public.payment_obligations;
DROP POLICY IF EXISTS "pay_ob_select_customer"   ON public.payment_obligations;

CREATE POLICY "pay_ob_all_admin"
  ON public.payment_obligations FOR ALL TO authenticated
  USING (nexum_is_admin()) WITH CHECK (nexum_is_admin());

CREATE POLICY "pay_ob_select_provider"
  ON public.payment_obligations FOR SELECT TO authenticated
  USING (
    nexum_my_role() = 'service_provider'
    AND EXISTS (
      SELECT 1 FROM secured_jobs sj
      WHERE sj.job_reference = payment_obligations.job_reference
        AND sj.service_provider_company_id = nexum_my_company_id()
    )
  );

CREATE POLICY "pay_ob_select_customer"
  ON public.payment_obligations FOR SELECT TO authenticated
  USING (
    nexum_my_role() = 'customer'
    AND payer_company_id = nexum_my_company_id()
  );


-- =============================================================================
-- PAYMENT_PROOF_UPLOADS
-- =============================================================================

DROP POLICY IF EXISTS "ppu_all_admin"        ON public.payment_proof_uploads;
DROP POLICY IF EXISTS "ppu_select_customer"  ON public.payment_proof_uploads;
DROP POLICY IF EXISTS "ppu_insert_customer"  ON public.payment_proof_uploads;

CREATE POLICY "ppu_all_admin"
  ON public.payment_proof_uploads FOR ALL TO authenticated
  USING (nexum_is_admin()) WITH CHECK (nexum_is_admin());

CREATE POLICY "ppu_select_customer"
  ON public.payment_proof_uploads FOR SELECT TO authenticated
  USING (
    nexum_my_role() = 'customer'
    AND company_id = nexum_my_company_id()
  );

CREATE POLICY "ppu_insert_customer"
  ON public.payment_proof_uploads FOR INSERT TO authenticated
  WITH CHECK (
    nexum_my_role() = 'customer'
    AND company_id = nexum_my_company_id()
  );


-- =============================================================================
-- PAYMENT_LEDGER_EVENTS
-- =============================================================================

DROP POLICY IF EXISTS "ple_all_admin"        ON public.payment_ledger_events;
DROP POLICY IF EXISTS "ple_select_provider"  ON public.payment_ledger_events;
DROP POLICY IF EXISTS "ple_select_customer"  ON public.payment_ledger_events;

CREATE POLICY "ple_all_admin"
  ON public.payment_ledger_events FOR ALL TO authenticated
  USING (nexum_is_admin()) WITH CHECK (nexum_is_admin());

CREATE POLICY "ple_select_provider"
  ON public.payment_ledger_events FOR SELECT TO authenticated
  USING (
    nexum_my_role() = 'service_provider'
    AND EXISTS (
      SELECT 1 FROM secured_jobs sj
      WHERE sj.job_reference = payment_ledger_events.job_reference
        AND sj.service_provider_company_id = nexum_my_company_id()
    )
  );

CREATE POLICY "ple_select_customer"
  ON public.payment_ledger_events FOR SELECT TO authenticated
  USING (
    nexum_my_role() = 'customer'
    AND EXISTS (
      SELECT 1 FROM secured_jobs sj
      WHERE sj.job_reference = payment_ledger_events.job_reference
        AND sj.customer_company_id = nexum_my_company_id()
    )
  );


-- =============================================================================
-- HELD_PAYMENTS (admin-only write; provider/customer read own)
-- =============================================================================

DROP POLICY IF EXISTS "hp_all_admin"        ON public.held_payments;
DROP POLICY IF EXISTS "hp_select_provider"  ON public.held_payments;
DROP POLICY IF EXISTS "hp_select_customer"  ON public.held_payments;

CREATE POLICY "hp_all_admin"
  ON public.held_payments FOR ALL TO authenticated
  USING (nexum_is_admin()) WITH CHECK (nexum_is_admin());

CREATE POLICY "hp_select_provider"
  ON public.held_payments FOR SELECT TO authenticated
  USING (
    nexum_my_role() = 'service_provider'
    AND payee_company_id = nexum_my_company_id()
  );

CREATE POLICY "hp_select_customer"
  ON public.held_payments FOR SELECT TO authenticated
  USING (
    nexum_my_role() = 'customer'
    AND payer_company_id = nexum_my_company_id()
  );


-- =============================================================================
-- MANUAL_PAYMENT_OPERATIONS (admin-only — no provider/customer direct write)
-- =============================================================================

DROP POLICY IF EXISTS "mpo_all_admin"        ON public.manual_payment_operations;
DROP POLICY IF EXISTS "mpo_select_provider"  ON public.manual_payment_operations;
DROP POLICY IF EXISTS "mpo_select_customer"  ON public.manual_payment_operations;

CREATE POLICY "mpo_all_admin"
  ON public.manual_payment_operations FOR ALL TO authenticated
  USING (nexum_is_admin()) WITH CHECK (nexum_is_admin());

-- Provider: read-only view of their own job operations (for transparency)
CREATE POLICY "mpo_select_provider"
  ON public.manual_payment_operations FOR SELECT TO authenticated
  USING (
    nexum_my_role() = 'service_provider'
    AND payee_company_id = nexum_my_company_id()
  );

-- Customer: read-only view of their own job operations
CREATE POLICY "mpo_select_customer"
  ON public.manual_payment_operations FOR SELECT TO authenticated
  USING (
    nexum_my_role() = 'customer'
    AND payer_company_id = nexum_my_company_id()
  );


-- =============================================================================
-- DELIVERY_CONFIRMATIONS
-- =============================================================================

DROP POLICY IF EXISTS "dc_all_admin"        ON public.delivery_confirmations;
DROP POLICY IF EXISTS "dc_select_provider"  ON public.delivery_confirmations;
DROP POLICY IF EXISTS "dc_all_customer"     ON public.delivery_confirmations;

CREATE POLICY "dc_all_admin"
  ON public.delivery_confirmations FOR ALL TO authenticated
  USING (nexum_is_admin()) WITH CHECK (nexum_is_admin());

-- Provider: view confirmation status for their jobs
CREATE POLICY "dc_select_provider"
  ON public.delivery_confirmations FOR SELECT TO authenticated
  USING (
    nexum_my_role() = 'service_provider'
    AND EXISTS (
      SELECT 1 FROM secured_jobs sj
      WHERE sj.job_reference = delivery_confirmations.job_reference
        AND sj.service_provider_company_id = nexum_my_company_id()
    )
  );

-- Customer: view and insert their own confirmation
CREATE POLICY "dc_select_customer"
  ON public.delivery_confirmations FOR SELECT TO authenticated
  USING (
    nexum_my_role() = 'customer'
    AND company_id = nexum_my_company_id()
  );

CREATE POLICY "dc_insert_customer"
  ON public.delivery_confirmations FOR INSERT TO authenticated
  WITH CHECK (
    nexum_my_role() = 'customer'
    AND company_id = nexum_my_company_id()
  );


-- =============================================================================
-- JOB_TERMS_SNAPSHOTS
-- =============================================================================

DROP POLICY IF EXISTS "jts_all_admin"        ON public.job_terms_snapshots;
DROP POLICY IF EXISTS "jts_select_provider"  ON public.job_terms_snapshots;
DROP POLICY IF EXISTS "jts_select_customer"  ON public.job_terms_snapshots;

CREATE POLICY "jts_all_admin"
  ON public.job_terms_snapshots FOR ALL TO authenticated
  USING (nexum_is_admin()) WITH CHECK (nexum_is_admin());

CREATE POLICY "jts_select_provider"
  ON public.job_terms_snapshots FOR SELECT TO authenticated
  USING (
    nexum_my_role() = 'service_provider'
    AND EXISTS (
      SELECT 1 FROM secured_jobs sj
      WHERE sj.job_reference = job_terms_snapshots.job_reference
        AND sj.service_provider_company_id = nexum_my_company_id()
    )
  );

CREATE POLICY "jts_select_customer"
  ON public.job_terms_snapshots FOR SELECT TO authenticated
  USING (
    nexum_my_role() = 'customer'
    AND EXISTS (
      SELECT 1 FROM secured_jobs sj
      WHERE sj.job_reference = job_terms_snapshots.job_reference
        AND sj.customer_company_id = nexum_my_company_id()
    )
  );


-- =============================================================================
-- AUDIT_LOGS (admin full; provider/customer read own job logs)
-- =============================================================================

DROP POLICY IF EXISTS "audit_all_admin"        ON public.audit_logs;
DROP POLICY IF EXISTS "audit_select_provider"  ON public.audit_logs;
DROP POLICY IF EXISTS "audit_select_customer"  ON public.audit_logs;

CREATE POLICY "audit_all_admin"
  ON public.audit_logs FOR ALL TO authenticated
  USING (nexum_is_admin()) WITH CHECK (nexum_is_admin());

CREATE POLICY "audit_select_provider"
  ON public.audit_logs FOR SELECT TO authenticated
  USING (
    nexum_my_role() = 'service_provider'
    AND EXISTS (
      SELECT 1 FROM secured_jobs sj
      WHERE sj.job_reference = audit_logs.job_reference
        AND sj.service_provider_company_id = nexum_my_company_id()
    )
  );

CREATE POLICY "audit_select_customer"
  ON public.audit_logs FOR SELECT TO authenticated
  USING (
    nexum_my_role() = 'customer'
    AND EXISTS (
      SELECT 1 FROM secured_jobs sj
      WHERE sj.job_reference = audit_logs.job_reference
        AND sj.customer_company_id = nexum_my_company_id()
    )
  );


-- =============================================================================
-- LEGAL_TERMS_TEMPLATES (admin full; authenticated read active)
-- =============================================================================

DROP POLICY IF EXISTS "ltt_all_admin"            ON public.legal_terms_templates;
DROP POLICY IF EXISTS "ltt_select_authenticated" ON public.legal_terms_templates;

CREATE POLICY "ltt_all_admin"
  ON public.legal_terms_templates FOR ALL TO authenticated
  USING (nexum_is_admin()) WITH CHECK (nexum_is_admin());

CREATE POLICY "ltt_select_authenticated"
  ON public.legal_terms_templates FOR SELECT TO authenticated
  USING (status = 'Active');


-- =============================================================================
-- LEGAL_TERMS_ACCEPTANCES (admin full; user insert/select own)
-- =============================================================================

DROP POLICY IF EXISTS "lta_all_admin"       ON public.legal_terms_acceptances;
DROP POLICY IF EXISTS "lta_select_own"      ON public.legal_terms_acceptances;
DROP POLICY IF EXISTS "lta_insert_own"      ON public.legal_terms_acceptances;

CREATE POLICY "lta_all_admin"
  ON public.legal_terms_acceptances FOR ALL TO authenticated
  USING (nexum_is_admin()) WITH CHECK (nexum_is_admin());

CREATE POLICY "lta_select_own"
  ON public.legal_terms_acceptances FOR SELECT TO authenticated
  USING (accepted_by_user_id = auth.uid());

CREATE POLICY "lta_insert_own"
  ON public.legal_terms_acceptances FOR INSERT TO authenticated
  WITH CHECK (accepted_by_user_id = auth.uid());


-- =============================================================================
-- PILOT_ONBOARDING_CHECKLISTS & ITEMS (admin full; company read own)
-- =============================================================================

DROP POLICY IF EXISTS "poc_all_admin"    ON public.pilot_onboarding_checklists;
DROP POLICY IF EXISTS "poc_select_own"  ON public.pilot_onboarding_checklists;

CREATE POLICY "poc_all_admin"
  ON public.pilot_onboarding_checklists FOR ALL TO authenticated
  USING (nexum_is_admin()) WITH CHECK (nexum_is_admin());

CREATE POLICY "poc_select_own"
  ON public.pilot_onboarding_checklists FOR SELECT TO authenticated
  USING (company_id = nexum_my_company_id());

DROP POLICY IF EXISTS "poi_all_admin"    ON public.pilot_onboarding_items;
DROP POLICY IF EXISTS "poi_select_own"  ON public.pilot_onboarding_items;

CREATE POLICY "poi_all_admin"
  ON public.pilot_onboarding_items FOR ALL TO authenticated
  USING (nexum_is_admin()) WITH CHECK (nexum_is_admin());

CREATE POLICY "poi_select_own"
  ON public.pilot_onboarding_items FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM pilot_onboarding_checklists c
      WHERE c.id = pilot_onboarding_items.checklist_id
        AND c.company_id = nexum_my_company_id()
    )
  );


-- =============================================================================
-- GO_LIVE_READINESS_ITEMS (admin only)
-- =============================================================================

DROP POLICY IF EXISTS "glr_all_admin" ON public.go_live_readiness_items;

CREATE POLICY "glr_all_admin"
  ON public.go_live_readiness_items FOR ALL TO authenticated
  USING (nexum_is_admin()) WITH CHECK (nexum_is_admin());


-- =============================================================================
-- DEPLOYMENT_CUTOVER_CHECKLISTS & ITEMS (admin only)
-- =============================================================================

DROP POLICY IF EXISTS "dcc_all_admin" ON public.deployment_cutover_checklists;
CREATE POLICY "dcc_all_admin"
  ON public.deployment_cutover_checklists FOR ALL TO authenticated
  USING (nexum_is_admin()) WITH CHECK (nexum_is_admin());

DROP POLICY IF EXISTS "dci_all_admin" ON public.deployment_cutover_items;
CREATE POLICY "dci_all_admin"
  ON public.deployment_cutover_items FOR ALL TO authenticated
  USING (nexum_is_admin()) WITH CHECK (nexum_is_admin());


-- =============================================================================
-- LIVE_PILOT_DRY_RUNS & STEPS (admin only)
-- =============================================================================

DROP POLICY IF EXISTS "lpdr_all_admin" ON public.live_pilot_dry_runs;
CREATE POLICY "lpdr_all_admin"
  ON public.live_pilot_dry_runs FOR ALL TO authenticated
  USING (nexum_is_admin()) WITH CHECK (nexum_is_admin());

DROP POLICY IF EXISTS "lpdrs_all_admin" ON public.live_pilot_dry_run_steps;
CREATE POLICY "lpdrs_all_admin"
  ON public.live_pilot_dry_run_steps FOR ALL TO authenticated
  USING (nexum_is_admin()) WITH CHECK (nexum_is_admin());


-- =============================================================================
-- SYSTEM_SETTINGS (admin full; authenticated read)
-- =============================================================================

DROP POLICY IF EXISTS "ss_all_admin"            ON public.system_settings;
DROP POLICY IF EXISTS "ss_select_authenticated" ON public.system_settings;

CREATE POLICY "ss_all_admin"
  ON public.system_settings FOR ALL TO authenticated
  USING (nexum_is_admin()) WITH CHECK (nexum_is_admin());

CREATE POLICY "ss_select_authenticated"
  ON public.system_settings FOR SELECT TO authenticated
  USING (true);


-- =============================================================================
-- NOTIFICATIONS (admin full; user read/update own)
-- =============================================================================

DROP POLICY IF EXISTS "notif_all_admin"     ON public.notifications;
DROP POLICY IF EXISTS "notif_select_own"   ON public.notifications;
DROP POLICY IF EXISTS "notif_update_own"   ON public.notifications;

CREATE POLICY "notif_all_admin"
  ON public.notifications FOR ALL TO authenticated
  USING (nexum_is_admin()) WITH CHECK (nexum_is_admin());

CREATE POLICY "notif_select_own"
  ON public.notifications FOR SELECT TO authenticated
  USING (recipient_user_id = auth.uid());

CREATE POLICY "notif_update_own"
  ON public.notifications FOR UPDATE TO authenticated
  USING (recipient_user_id = auth.uid())
  WITH CHECK (recipient_user_id = auth.uid());


-- =============================================================================
-- WORKFLOW_TASKS (admin full; role-scoped read for provider/customer)
-- =============================================================================

DROP POLICY IF EXISTS "wt_all_admin"        ON public.workflow_tasks;
DROP POLICY IF EXISTS "wt_select_provider"  ON public.workflow_tasks;
DROP POLICY IF EXISTS "wt_select_customer"  ON public.workflow_tasks;

CREATE POLICY "wt_all_admin"
  ON public.workflow_tasks FOR ALL TO authenticated
  USING (nexum_is_admin()) WITH CHECK (nexum_is_admin());

CREATE POLICY "wt_select_provider"
  ON public.workflow_tasks FOR SELECT TO authenticated
  USING (
    nexum_my_role() = 'service_provider'
    AND assigned_role = 'service_provider'
    AND company_id = nexum_my_company_id()
  );

CREATE POLICY "wt_select_customer"
  ON public.workflow_tasks FOR SELECT TO authenticated
  USING (
    nexum_my_role() = 'customer'
    AND assigned_role = 'customer'
    AND company_id = nexum_my_company_id()
  );


-- =============================================================================
-- TERMS_ACCEPTANCES (admin full; user insert/select own)
-- =============================================================================

DROP POLICY IF EXISTS "ta_all_admin"   ON public.terms_acceptances;
DROP POLICY IF EXISTS "ta_select_own"  ON public.terms_acceptances;
DROP POLICY IF EXISTS "ta_insert_own"  ON public.terms_acceptances;

CREATE POLICY "ta_all_admin"
  ON public.terms_acceptances FOR ALL TO authenticated
  USING (nexum_is_admin()) WITH CHECK (nexum_is_admin());

CREATE POLICY "ta_select_own"
  ON public.terms_acceptances FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "ta_insert_own"
  ON public.terms_acceptances FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());


-- =============================================================================
-- DISPUTES (admin full; customer insert/read own; provider read related)
-- =============================================================================

DROP POLICY IF EXISTS "disp_all_admin"        ON public.disputes;
DROP POLICY IF EXISTS "disp_select_provider"  ON public.disputes;
DROP POLICY IF EXISTS "disp_all_customer"     ON public.disputes;

CREATE POLICY "disp_all_admin"
  ON public.disputes FOR ALL TO authenticated
  USING (nexum_is_admin()) WITH CHECK (nexum_is_admin());

-- Provider: read-only view of disputes raised against their jobs
CREATE POLICY "disp_select_provider"
  ON public.disputes FOR SELECT TO authenticated
  USING (
    nexum_my_role() = 'service_provider'
    AND EXISTS (
      SELECT 1 FROM secured_jobs sj
      WHERE sj.job_reference = disputes.job_reference
        AND sj.service_provider_company_id = nexum_my_company_id()
    )
  );

-- Customer: view and insert their own disputes
CREATE POLICY "disp_select_customer"
  ON public.disputes FOR SELECT TO authenticated
  USING (
    nexum_my_role() = 'customer'
    AND company_id = nexum_my_company_id()
  );

CREATE POLICY "disp_insert_customer"
  ON public.disputes FOR INSERT TO authenticated
  WITH CHECK (
    nexum_my_role() = 'customer'
    AND company_id = nexum_my_company_id()
    AND raised_by = auth.uid()
  );


-- =============================================================================
-- EVIDENCE_PACKS & ITEMS (admin full; provider/customer read own job packs)
-- =============================================================================

DROP POLICY IF EXISTS "ep_all_admin"        ON public.evidence_packs;
DROP POLICY IF EXISTS "ep_select_provider"  ON public.evidence_packs;
DROP POLICY IF EXISTS "ep_select_customer"  ON public.evidence_packs;

CREATE POLICY "ep_all_admin"
  ON public.evidence_packs FOR ALL TO authenticated
  USING (nexum_is_admin()) WITH CHECK (nexum_is_admin());

CREATE POLICY "ep_select_provider"
  ON public.evidence_packs FOR SELECT TO authenticated
  USING (
    nexum_my_role() = 'service_provider'
    AND EXISTS (
      SELECT 1 FROM secured_jobs sj
      WHERE sj.job_reference = evidence_packs.job_reference
        AND sj.service_provider_company_id = nexum_my_company_id()
    )
  );

CREATE POLICY "ep_select_customer"
  ON public.evidence_packs FOR SELECT TO authenticated
  USING (
    nexum_my_role() = 'customer'
    AND EXISTS (
      SELECT 1 FROM secured_jobs sj
      WHERE sj.job_reference = evidence_packs.job_reference
        AND sj.customer_company_id = nexum_my_company_id()
    )
  );

DROP POLICY IF EXISTS "epi_all_admin"        ON public.evidence_pack_items;
DROP POLICY IF EXISTS "epi_select_provider"  ON public.evidence_pack_items;
DROP POLICY IF EXISTS "epi_select_customer"  ON public.evidence_pack_items;

CREATE POLICY "epi_all_admin"
  ON public.evidence_pack_items FOR ALL TO authenticated
  USING (nexum_is_admin()) WITH CHECK (nexum_is_admin());

CREATE POLICY "epi_select_provider"
  ON public.evidence_pack_items FOR SELECT TO authenticated
  USING (
    nexum_my_role() = 'service_provider'
    AND EXISTS (
      SELECT 1 FROM evidence_packs ep
      JOIN secured_jobs sj ON sj.job_reference = ep.job_reference
      WHERE ep.id = evidence_pack_items.evidence_pack_id
        AND sj.service_provider_company_id = nexum_my_company_id()
    )
  );

CREATE POLICY "epi_select_customer"
  ON public.evidence_pack_items FOR SELECT TO authenticated
  USING (
    nexum_my_role() = 'customer'
    AND EXISTS (
      SELECT 1 FROM evidence_packs ep
      JOIN secured_jobs sj ON sj.job_reference = ep.job_reference
      WHERE ep.id = evidence_pack_items.evidence_pack_id
        AND sj.customer_company_id = nexum_my_company_id()
    )
  );


-- =============================================================================
-- MEMBERSHIPS (admin full; company read own)
-- =============================================================================

DROP POLICY IF EXISTS "mem_all_admin"   ON public.memberships;
DROP POLICY IF EXISTS "mem_select_own"  ON public.memberships;

CREATE POLICY "mem_all_admin"
  ON public.memberships FOR ALL TO authenticated
  USING (nexum_is_admin()) WITH CHECK (nexum_is_admin());

CREATE POLICY "mem_select_own"
  ON public.memberships FOR SELECT TO authenticated
  USING (company_id = nexum_my_company_id());


-- =============================================================================
-- COMPANY_INTELLIGENCE_PROFILES (admin only — service-role API)
-- =============================================================================

DROP POLICY IF EXISTS "cip_all_admin" ON public.company_intelligence_profiles;

CREATE POLICY "cip_all_admin"
  ON public.company_intelligence_profiles FOR ALL TO authenticated
  USING (nexum_is_admin()) WITH CHECK (nexum_is_admin());


-- =============================================================================
-- COMPANY_FINANCIAL_INPUTS & MARKET_INPUTS (admin only)
-- =============================================================================

DROP POLICY IF EXISTS "cfi_all_admin" ON public.company_financial_inputs;
CREATE POLICY "cfi_all_admin"
  ON public.company_financial_inputs FOR ALL TO authenticated
  USING (nexum_is_admin()) WITH CHECK (nexum_is_admin());

DROP POLICY IF EXISTS "cmi_all_admin" ON public.company_market_inputs;
CREATE POLICY "cmi_all_admin"
  ON public.company_market_inputs FOR ALL TO authenticated
  USING (nexum_is_admin()) WITH CHECK (nexum_is_admin());


-- =============================================================================
-- PAYMENT_HOLDING_ACCOUNTS (admin full; authenticated select)
-- =============================================================================

DROP POLICY IF EXISTS "pha_all_admin"            ON public.payment_holding_accounts;
DROP POLICY IF EXISTS "pha_select_authenticated" ON public.payment_holding_accounts;

CREATE POLICY "pha_all_admin"
  ON public.payment_holding_accounts FOR ALL TO authenticated
  USING (nexum_is_admin()) WITH CHECK (nexum_is_admin());

CREATE POLICY "pha_select_authenticated"
  ON public.payment_holding_accounts FOR SELECT TO authenticated
  USING (status IN ('Active', 'Pilot Only'));


-- =============================================================================
-- STORAGE BUCKET POLICIES
-- Create these buckets in Supabase Dashboard → Storage before applying.
-- Buckets: payment-proofs, pod-documents, evidence-packs, company-documents
--
-- NOTE: Storage policies use a different syntax from table RLS.
-- Run these in Supabase Dashboard → Storage → Policies, or via SQL Editor.
-- =============================================================================

-- payment-proofs: customer upload own; admin read all
INSERT INTO storage.buckets (id, name, public)
  VALUES ('payment-proofs', 'payment-proofs', false)
  ON CONFLICT (id) DO NOTHING;

INSERT INTO storage.buckets (id, name, public)
  VALUES ('pod-documents', 'pod-documents', false)
  ON CONFLICT (id) DO NOTHING;

INSERT INTO storage.buckets (id, name, public)
  VALUES ('evidence-packs', 'evidence-packs', false)
  ON CONFLICT (id) DO NOTHING;

INSERT INTO storage.buckets (id, name, public)
  VALUES ('company-documents', 'company-documents', false)
  ON CONFLICT (id) DO NOTHING;

-- Storage RLS: admin read all buckets
DROP POLICY IF EXISTS "storage_admin_all_payment_proofs"    ON storage.objects;
DROP POLICY IF EXISTS "storage_admin_all_pod_documents"     ON storage.objects;
DROP POLICY IF EXISTS "storage_admin_all_evidence_packs"    ON storage.objects;
DROP POLICY IF EXISTS "storage_admin_all_company_documents" ON storage.objects;

CREATE POLICY "storage_admin_all_payment_proofs"
  ON storage.objects FOR ALL TO authenticated
  USING (bucket_id = 'payment-proofs' AND nexum_is_admin())
  WITH CHECK (bucket_id = 'payment-proofs' AND nexum_is_admin());

CREATE POLICY "storage_admin_all_pod_documents"
  ON storage.objects FOR ALL TO authenticated
  USING (bucket_id = 'pod-documents' AND nexum_is_admin())
  WITH CHECK (bucket_id = 'pod-documents' AND nexum_is_admin());

CREATE POLICY "storage_admin_all_evidence_packs"
  ON storage.objects FOR ALL TO authenticated
  USING (bucket_id = 'evidence-packs' AND nexum_is_admin())
  WITH CHECK (bucket_id = 'evidence-packs' AND nexum_is_admin());

CREATE POLICY "storage_admin_all_company_documents"
  ON storage.objects FOR ALL TO authenticated
  USING (bucket_id = 'company-documents' AND nexum_is_admin())
  WITH CHECK (bucket_id = 'company-documents' AND nexum_is_admin());

-- Customer: upload to payment-proofs (scoped to own company folder)
DROP POLICY IF EXISTS "storage_customer_upload_payment_proofs" ON storage.objects;
CREATE POLICY "storage_customer_upload_payment_proofs"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'payment-proofs'
    AND nexum_my_role() = 'customer'
    AND (storage.foldername(name))[1] = nexum_my_company_id()::text
  );

DROP POLICY IF EXISTS "storage_customer_select_payment_proofs" ON storage.objects;
CREATE POLICY "storage_customer_select_payment_proofs"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'payment-proofs'
    AND nexum_my_role() = 'customer'
    AND (storage.foldername(name))[1] = nexum_my_company_id()::text
  );

-- Provider: upload to pod-documents (own company folder only)
DROP POLICY IF EXISTS "storage_provider_upload_pod_documents" ON storage.objects;
CREATE POLICY "storage_provider_upload_pod_documents"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'pod-documents'
    AND nexum_my_role() = 'service_provider'
    AND (storage.foldername(name))[1] = nexum_my_company_id()::text
  );

DROP POLICY IF EXISTS "storage_provider_select_pod_documents" ON storage.objects;
CREATE POLICY "storage_provider_select_pod_documents"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'pod-documents'
    AND nexum_my_role() = 'service_provider'
    AND (storage.foldername(name))[1] = nexum_my_company_id()::text
  );

-- =============================================================================
-- END 002_live_rls_policies.sql
-- =============================================================================
