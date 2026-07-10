-- =============================================================================
-- NEXUM SECUREFLOW — 002_rls_supplement.sql
-- Supplemental RLS policies for tables NOT covered by rls_hardening_v1.sql.
--
-- PREREQUISITE: Run 001_core_production_schema.sql first.
-- Helper functions (nexum_is_admin, nexum_my_role, nexum_my_company_id)
-- must exist (created in rls_hardening_v1.sql or 001_core_production_schema.sql).
--
-- SAFE TO RE-RUN: All policies use DROP POLICY IF EXISTS before CREATE POLICY.
--
-- TABLES COVERED HERE:
--   payment_proof_uploads, delivery_confirmations, job_terms_snapshots,
--   evidence_packs, evidence_pack_items, terms_acceptances,
--   disputes, go_live_readiness_items
--
-- TABLES COVERED ELSEWHERE (do NOT duplicate):
--   profiles, companies, secured_jobs, documents, audit_logs, memberships,
--   notifications, workflow_tasks → rls_hardening_v1.sql
--   payment_obligations, payment_ledger_events  → payment_ledger_v1.sql
--   held_payments, release_instructions         → payment_holding_v1.sql
--   release_settlements                          → release_settlements_v1.sql
--   claim_reserves                               → claim_reserves_v1.sql
-- =============================================================================


-- ─── Shared helpers ───────────────────────────────────────────────────────────
-- Drop helper: job exists for provider
-- (inline for portability — avoids creating another function)


-- =============================================================================
-- 1. PAYMENT_PROOF_UPLOADS
-- Customer uploads proof, admin verifies. Provider can view (their job only).
-- =============================================================================

alter table public.payment_proof_uploads enable row level security;

drop policy if exists "ppu_admin_all"        on public.payment_proof_uploads;
drop policy if exists "ppu_provider_select"  on public.payment_proof_uploads;
drop policy if exists "ppu_customer_all"     on public.payment_proof_uploads;

-- Admin: full access
create policy "ppu_admin_all"
  on public.payment_proof_uploads for all
  to authenticated
  using  (public.nexum_is_admin())
  with check (public.nexum_is_admin());

-- Customer: create + view own uploads (for their jobs)
create policy "ppu_customer_all"
  on public.payment_proof_uploads for all
  to authenticated
  using (
    public.nexum_my_role() = 'customer'
    and exists (
      select 1 from public.secured_jobs sj
      where sj.job_reference = payment_proof_uploads.job_reference
        and sj.customer_company_id = public.nexum_my_company_id()
    )
  )
  with check (
    public.nexum_my_role() = 'customer'
    and exists (
      select 1 from public.secured_jobs sj
      where sj.job_reference = payment_proof_uploads.job_reference
        and sj.customer_company_id = public.nexum_my_company_id()
    )
  );

-- Provider: read only for their jobs (to see what proof was submitted)
create policy "ppu_provider_select"
  on public.payment_proof_uploads for select
  to authenticated
  using (
    public.nexum_my_role() = 'service_provider'
    and exists (
      select 1 from public.secured_jobs sj
      where sj.job_reference = payment_proof_uploads.job_reference
        and sj.service_provider_company_id = public.nexum_my_company_id()
    )
  );


-- =============================================================================
-- 2. DELIVERY_CONFIRMATIONS
-- Customer confirms delivery. Provider can view. Admin has full access.
-- =============================================================================

alter table public.delivery_confirmations enable row level security;

drop policy if exists "dc_admin_all"         on public.delivery_confirmations;
drop policy if exists "dc_provider_select"   on public.delivery_confirmations;
drop policy if exists "dc_customer_all"      on public.delivery_confirmations;

create policy "dc_admin_all"
  on public.delivery_confirmations for all
  to authenticated
  using  (public.nexum_is_admin())
  with check (public.nexum_is_admin());

-- Customer: can confirm (upsert) and view their own job's confirmation
create policy "dc_customer_all"
  on public.delivery_confirmations for all
  to authenticated
  using (
    public.nexum_my_role() = 'customer'
    and exists (
      select 1 from public.secured_jobs sj
      where sj.job_reference = delivery_confirmations.job_reference
        and sj.customer_company_id = public.nexum_my_company_id()
    )
  )
  with check (
    public.nexum_my_role() = 'customer'
    and exists (
      select 1 from public.secured_jobs sj
      where sj.job_reference = delivery_confirmations.job_reference
        and sj.customer_company_id = public.nexum_my_company_id()
    )
  );

-- Provider: read only (see if customer has confirmed)
create policy "dc_provider_select"
  on public.delivery_confirmations for select
  to authenticated
  using (
    public.nexum_my_role() = 'service_provider'
    and exists (
      select 1 from public.secured_jobs sj
      where sj.job_reference = delivery_confirmations.job_reference
        and sj.service_provider_company_id = public.nexum_my_company_id()
    )
  );


-- =============================================================================
-- 3. JOB_TERMS_SNAPSHOTS
-- Immutable — created at acceptance. Admin + job parties can read.
-- No one can update/delete (service role only).
-- =============================================================================

alter table public.job_terms_snapshots enable row level security;

drop policy if exists "jts_admin_all"        on public.job_terms_snapshots;
drop policy if exists "jts_provider_select"  on public.job_terms_snapshots;
drop policy if exists "jts_customer_select"  on public.job_terms_snapshots;
drop policy if exists "jts_insert_auth"      on public.job_terms_snapshots;

create policy "jts_admin_all"
  on public.job_terms_snapshots for all
  to authenticated
  using  (public.nexum_is_admin())
  with check (public.nexum_is_admin());

create policy "jts_provider_select"
  on public.job_terms_snapshots for select
  to authenticated
  using (
    public.nexum_my_role() = 'service_provider'
    and exists (
      select 1 from public.secured_jobs sj
      where sj.job_reference = job_terms_snapshots.job_reference
        and sj.service_provider_company_id = public.nexum_my_company_id()
    )
  );

create policy "jts_customer_select"
  on public.job_terms_snapshots for select
  to authenticated
  using (
    public.nexum_my_role() = 'customer'
    and exists (
      select 1 from public.secured_jobs sj
      where sj.job_reference = job_terms_snapshots.job_reference
        and sj.customer_company_id = public.nexum_my_company_id()
    )
  );

-- Insert allowed for authenticated (snapshot is created at acceptance time
-- from client-side; service role is used where available).
create policy "jts_insert_auth"
  on public.job_terms_snapshots for insert
  to authenticated
  with check (true);


-- =============================================================================
-- 4. EVIDENCE_PACKS
-- Generated by admin. Provider/customer can read for their jobs.
-- =============================================================================

alter table public.evidence_packs enable row level security;

drop policy if exists "ep_admin_all"        on public.evidence_packs;
drop policy if exists "ep_provider_select"  on public.evidence_packs;
drop policy if exists "ep_customer_select"  on public.evidence_packs;

create policy "ep_admin_all"
  on public.evidence_packs for all
  to authenticated
  using  (public.nexum_is_admin())
  with check (public.nexum_is_admin());

create policy "ep_provider_select"
  on public.evidence_packs for select
  to authenticated
  using (
    public.nexum_my_role() = 'service_provider'
    and exists (
      select 1 from public.secured_jobs sj
      where sj.job_reference = evidence_packs.job_reference
        and sj.service_provider_company_id = public.nexum_my_company_id()
    )
  );

create policy "ep_customer_select"
  on public.evidence_packs for select
  to authenticated
  using (
    public.nexum_my_role() = 'customer'
    and exists (
      select 1 from public.secured_jobs sj
      where sj.job_reference = evidence_packs.job_reference
        and sj.customer_company_id = public.nexum_my_company_id()
    )
  );


-- =============================================================================
-- 5. EVIDENCE_PACK_ITEMS
-- Same access as evidence_packs (via pack ID join).
-- =============================================================================

alter table public.evidence_pack_items enable row level security;

drop policy if exists "epi_admin_all"       on public.evidence_pack_items;
drop policy if exists "epi_provider_select" on public.evidence_pack_items;
drop policy if exists "epi_customer_select" on public.evidence_pack_items;

create policy "epi_admin_all"
  on public.evidence_pack_items for all
  to authenticated
  using  (public.nexum_is_admin())
  with check (public.nexum_is_admin());

create policy "epi_provider_select"
  on public.evidence_pack_items for select
  to authenticated
  using (
    public.nexum_my_role() = 'service_provider'
    and exists (
      select 1
      from public.evidence_packs ep
      join public.secured_jobs sj on sj.job_reference = ep.job_reference
      where ep.id = evidence_pack_items.evidence_pack_id
        and sj.service_provider_company_id = public.nexum_my_company_id()
    )
  );

create policy "epi_customer_select"
  on public.evidence_pack_items for select
  to authenticated
  using (
    public.nexum_my_role() = 'customer'
    and exists (
      select 1
      from public.evidence_packs ep
      join public.secured_jobs sj on sj.job_reference = ep.job_reference
      where ep.id = evidence_pack_items.evidence_pack_id
        and sj.customer_company_id = public.nexum_my_company_id()
    )
  );


-- =============================================================================
-- 6. TERMS_ACCEPTANCES
-- User can view/create their own acceptances. Admin views all.
-- =============================================================================

alter table public.terms_acceptances enable row level security;

drop policy if exists "ta_admin_all"        on public.terms_acceptances;
drop policy if exists "ta_own_select"       on public.terms_acceptances;
drop policy if exists "ta_own_insert"       on public.terms_acceptances;

create policy "ta_admin_all"
  on public.terms_acceptances for all
  to authenticated
  using  (public.nexum_is_admin())
  with check (public.nexum_is_admin());

-- User can read their own acceptances
create policy "ta_own_select"
  on public.terms_acceptances for select
  to authenticated
  using (user_id = auth.uid());

-- User can record their own acceptance
create policy "ta_own_insert"
  on public.terms_acceptances for insert
  to authenticated
  with check (user_id = auth.uid() or user_id is null);


-- =============================================================================
-- 7. DISPUTES
-- Customer raises dispute. Provider can read (their job). Admin has full access.
-- Release is BLOCKED while dispute is Open/Under Review (enforced in API, not RLS).
-- =============================================================================

alter table public.disputes enable row level security;

drop policy if exists "disputes_admin_all"        on public.disputes;
drop policy if exists "disputes_customer_all"     on public.disputes;
drop policy if exists "disputes_provider_select"  on public.disputes;

create policy "disputes_admin_all"
  on public.disputes for all
  to authenticated
  using  (public.nexum_is_admin())
  with check (public.nexum_is_admin());

-- Customer: raise and view disputes for their own jobs
create policy "disputes_customer_all"
  on public.disputes for all
  to authenticated
  using (
    public.nexum_my_role() = 'customer'
    and exists (
      select 1 from public.secured_jobs sj
      where sj.job_reference = disputes.job_reference
        and sj.customer_company_id = public.nexum_my_company_id()
    )
  )
  with check (
    public.nexum_my_role() = 'customer'
    and exists (
      select 1 from public.secured_jobs sj
      where sj.job_reference = disputes.job_reference
        and sj.customer_company_id = public.nexum_my_company_id()
    )
  );

-- Provider: read only (see dispute status, cannot resolve)
create policy "disputes_provider_select"
  on public.disputes for select
  to authenticated
  using (
    public.nexum_my_role() = 'service_provider'
    and exists (
      select 1 from public.secured_jobs sj
      where sj.job_reference = disputes.job_reference
        and sj.service_provider_company_id = public.nexum_my_company_id()
    )
  );


-- =============================================================================
-- 8. GO_LIVE_READINESS_ITEMS
-- Admin-only. No provider/customer access.
-- =============================================================================

-- (Already created in go_live_readiness_v1.sql — ensure it exists)
alter table public.go_live_readiness_items enable row level security;

drop policy if exists "admin_all_go_live_readiness" on public.go_live_readiness_items;

create policy "admin_all_go_live_readiness"
  on public.go_live_readiness_items for all
  to authenticated
  using (public.nexum_is_admin())
  with check (public.nexum_is_admin());


-- =============================================================================
-- 9. STORAGE BUCKET SECURITY
-- Run in SQL Editor. Sets bucket public = false and creates access policies.
-- =============================================================================

-- Ensure all buckets are private (non-public)
update storage.buckets set public = false
where id in (
  'job-documents',
  'payment-proofs',
  'pod-documents',
  'evidence-packs',
  'company-documents'
);

-- Drop any existing permissive storage policies
drop policy if exists "Allow all uploads"    on storage.objects;
drop policy if exists "Public read"          on storage.objects;
drop policy if exists "Allow authenticated"  on storage.objects;
drop policy if exists "Authenticated read"   on storage.objects;

-- Admin: full access to all pilot buckets
drop policy if exists "storage_admin_all_buckets" on storage.objects;
create policy "storage_admin_all_buckets"
  on storage.objects for all
  to authenticated
  using  (
    bucket_id in ('job-documents','payment-proofs','pod-documents','evidence-packs','company-documents')
    and public.nexum_is_admin()
  )
  with check (
    bucket_id in ('job-documents','payment-proofs','pod-documents','evidence-packs','company-documents')
    and public.nexum_is_admin()
  );

-- Provider: upload/read documents for own jobs
-- (path format: {job_reference}/{doc_type}/{filename})
drop policy if exists "storage_provider_job_docs" on storage.objects;
create policy "storage_provider_job_docs"
  on storage.objects for all
  to authenticated
  using (
    bucket_id in ('job-documents','pod-documents')
    and public.nexum_my_role() = 'service_provider'
    and exists (
      select 1 from public.secured_jobs sj
      where sj.job_reference = split_part(name, '/', 1)
        and sj.service_provider_company_id = public.nexum_my_company_id()
    )
  )
  with check (
    bucket_id in ('job-documents','pod-documents')
    and public.nexum_my_role() = 'service_provider'
    and exists (
      select 1 from public.secured_jobs sj
      where sj.job_reference = split_part(name, '/', 1)
        and sj.service_provider_company_id = public.nexum_my_company_id()
    )
  );

-- Customer: upload/read payment proofs for own jobs
drop policy if exists "storage_customer_payment_proofs" on storage.objects;
create policy "storage_customer_payment_proofs"
  on storage.objects for all
  to authenticated
  using (
    bucket_id in ('job-documents','payment-proofs')
    and public.nexum_my_role() = 'customer'
    and exists (
      select 1 from public.secured_jobs sj
      where sj.job_reference = split_part(name, '/', 1)
        and sj.customer_company_id = public.nexum_my_company_id()
    )
  )
  with check (
    bucket_id in ('job-documents','payment-proofs')
    and public.nexum_my_role() = 'customer'
    and exists (
      select 1 from public.secured_jobs sj
      where sj.job_reference = split_part(name, '/', 1)
        and sj.customer_company_id = public.nexum_my_company_id()
    )
  );


-- =============================================================================
-- 10. VERIFICATION QUERIES
-- Run after applying to confirm policies are in place.
-- =============================================================================

select tablename, count(*) as policy_count
from pg_policies
where schemaname = 'public'
  and tablename in (
    'payment_proof_uploads','delivery_confirmations','job_terms_snapshots',
    'evidence_packs','evidence_pack_items','terms_acceptances',
    'disputes','go_live_readiness_items'
  )
group by tablename
order by tablename;

select relname as table_name, relrowsecurity as rls_enabled
from pg_class
where relnamespace = 'public'::regnamespace
  and relkind = 'r'
  and relname in (
    'payment_proof_uploads','delivery_confirmations','job_terms_snapshots',
    'evidence_packs','evidence_pack_items','terms_acceptances',
    'disputes','go_live_readiness_items'
  )
order by relname;
