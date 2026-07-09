-- ─── Supplier Milestone Evidence Verification v1 ─────────────────────────────
-- Adds evidence tracking columns to supplier_release_milestones.
-- Creates supplier_milestone_evidence_items table.
-- NOT a quality or legal guarantee. Evidence verified for workflow purpose only.
-- Run idempotently: all objects created with IF NOT EXISTS / DO $$ blocks.
-- ─────────────────────────────────────────────────────────────────────────────

-- ─── Add columns to supplier_release_milestones ───────────────────────────────

do $$ begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'supplier_release_milestones'
      and column_name = 'evidence_status'
  ) then
    alter table public.supplier_release_milestones
      add column evidence_status text default 'Not Uploaded'
        check (evidence_status in (
          'Not Uploaded',
          'Uploaded',
          'Under Review',
          'Verified',
          'Rejected',
          'More Evidence Required'
        ));
  end if;
end $$;

do $$ begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'supplier_release_milestones'
      and column_name = 'evidence_uploaded_at'
  ) then
    alter table public.supplier_release_milestones
      add column evidence_uploaded_at timestamptz;
  end if;
end $$;

do $$ begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'supplier_release_milestones'
      and column_name = 'reviewed_by'
  ) then
    alter table public.supplier_release_milestones
      add column reviewed_by uuid references auth.users(id) on delete set null;
  end if;
end $$;

do $$ begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'supplier_release_milestones'
      and column_name = 'reviewed_at'
  ) then
    alter table public.supplier_release_milestones
      add column reviewed_at timestamptz;
  end if;
end $$;

do $$ begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'supplier_release_milestones'
      and column_name = 'review_note'
  ) then
    alter table public.supplier_release_milestones
      add column review_note text;
  end if;
end $$;

do $$ begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'supplier_release_milestones'
      and column_name = 'rejection_reason'
  ) then
    alter table public.supplier_release_milestones
      add column rejection_reason text;
  end if;
end $$;

do $$ begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'supplier_release_milestones'
      and column_name = 'release_blocker_note'
  ) then
    alter table public.supplier_release_milestones
      add column release_blocker_note text;
  end if;
end $$;

-- ─── Table: supplier_milestone_evidence_items ─────────────────────────────────

create table if not exists public.supplier_milestone_evidence_items (
  id                   uuid primary key default gen_random_uuid(),
  milestone_id         uuid not null
    references public.supplier_release_milestones(id) on delete cascade,
  job_reference        text not null,
  document_id          uuid references public.documents(id) on delete set null,
  evidence_type        text
    check (evidence_type in (
      'Proforma Invoice',
      'Order Confirmation',
      'Production Photo',
      'Production Report',
      'Inspection Report',
      'QA Certificate',
      'Packing List',
      'Bill of Lading',
      'Airway Bill',
      'Factory Statement',
      'Buyer Confirmation',
      'Other'
    )),
  uploaded_by_role     text,
  uploaded_by_user_id  uuid references auth.users(id) on delete set null,
  verification_status  text not null default 'Pending'
    check (verification_status in (
      'Pending',
      'Verified',
      'Rejected',
      'Needs Review'
    )),
  confidence_score     numeric,
  remarks              text,
  created_at           timestamptz default now()
);

-- ─── Indexes ──────────────────────────────────────────────────────────────────

create index if not exists idx_smei_milestone_id
  on public.supplier_milestone_evidence_items(milestone_id);

create index if not exists idx_smei_job_reference
  on public.supplier_milestone_evidence_items(job_reference);

create index if not exists idx_smei_verification_status
  on public.supplier_milestone_evidence_items(verification_status);

create index if not exists idx_smei_document_id
  on public.supplier_milestone_evidence_items(document_id);

create index if not exists idx_srm_evidence_status
  on public.supplier_release_milestones(evidence_status);

-- ─── Row-Level Security ───────────────────────────────────────────────────────

alter table public.supplier_milestone_evidence_items enable row level security;

-- SELECT: all authenticated users
do $$ begin
  if not exists (
    select 1 from pg_policies
    where tablename = 'supplier_milestone_evidence_items'
      and policyname = 'authenticated_select_smei'
  ) then
    create policy "authenticated_select_smei"
      on public.supplier_milestone_evidence_items
      for select to authenticated using (true);
  end if;
end $$;

-- INSERT: authenticated users (role enforcement at API layer)
do $$ begin
  if not exists (
    select 1 from pg_policies
    where tablename = 'supplier_milestone_evidence_items'
      and policyname = 'authenticated_insert_smei'
  ) then
    create policy "authenticated_insert_smei"
      on public.supplier_milestone_evidence_items
      for insert to authenticated with check (true);
  end if;
end $$;

-- UPDATE: service role only (API routes use SUPABASE_SERVICE_ROLE_KEY)

-- ─── Notes ────────────────────────────────────────────────────────────────────
-- Evidence verification is for workflow tracking only.
-- "Evidence verified" means: admin has reviewed the uploaded document/item
--   for workflow completeness. It does NOT mean quality certification, legal
--   guarantee, or financial approval.
-- Release eligibility is set only when:
--   - evidence_status = 'Verified'
--   - protection_status IN ('Payment Secured', 'Milestone Release Active')
--   - No open dispute blocking the milestone
-- No funds are disbursed automatically. Manual disbursement required.
