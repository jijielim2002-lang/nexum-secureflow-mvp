-- ─── Supplier Advance Payment Protection v1 ───────────────────────────────────
-- Milestone-based supplier payment protection workflow.
-- Not legal escrow. Controlled payment workflow and evidence tracking only.
-- Run idempotently: all objects created with IF NOT EXISTS.
-- ──────────────────────────────────────────────────────────────────────────────

-- ─── Table: supplier_payment_protections ──────────────────────────────────────

create table if not exists public.supplier_payment_protections (
  id                     uuid primary key default gen_random_uuid(),
  job_reference          text not null,
  supplier_id            uuid references public.supplier_counterparties(id) on delete set null,
  buyer_company_id       uuid references public.companies(id) on delete set null,
  supplier_name          text,
  supplier_country       text,
  protection_status      text not null default 'Draft'
    check (protection_status in (
      'Draft',
      'Pending Buyer Funding',
      'Payment Secured',
      'Milestone Release Active',
      'Partially Released',
      'Fully Released',
      'Disputed',
      'Cancelled',
      'Closed'
    )),
  goods_description      text,
  hs_code                text,
  incoterm               text,
  cargo_value_amount     numeric,
  cargo_value_currency   text default 'USD',
  advance_required_amount numeric,
  advance_currency        text default 'USD',
  advance_percentage      numeric,
  balance_amount          numeric,
  balance_currency        text default 'USD',
  release_model           text not null default 'Milestone Release'
    check (release_model in (
      'Deposit Only',
      'Milestone Release',
      'Production Proof Release',
      'Inspection Release',
      'BL Release',
      'Final Acceptance Release',
      'Manual Review'
    )),
  required_documents      jsonb,    -- array of document type strings
  risk_level              text not null default 'Medium'
    check (risk_level in ('Low', 'Medium', 'High', 'Critical')),
  risk_note               text,
  created_at              timestamptz default now(),
  updated_at              timestamptz default now()
);

-- ─── Table: supplier_release_milestones ───────────────────────────────────────

create table if not exists public.supplier_release_milestones (
  id                    uuid primary key default gen_random_uuid(),
  protection_id         uuid not null
    references public.supplier_payment_protections(id) on delete cascade,
  job_reference         text not null,
  milestone_name        text,
  milestone_percentage  numeric,
  milestone_amount      numeric,
  currency              text default 'USD',
  required_evidence     text,
  milestone_status      text not null default 'Pending'
    check (milestone_status in (
      'Pending',
      'Evidence Uploaded',
      'Verified',
      'Release Eligible',
      'Released',
      'Disputed',
      'Cancelled'
    )),
  evidence_document_id  uuid references public.documents(id) on delete set null,
  verified_by           uuid references auth.users(id) on delete set null,
  verified_at           timestamptz,
  released_at           timestamptz,
  created_at            timestamptz default now(),
  updated_at            timestamptz default now()
);

-- ─── Indexes ──────────────────────────────────────────────────────────────────

create index if not exists idx_spp_job_reference
  on public.supplier_payment_protections(job_reference);

create index if not exists idx_spp_supplier_id
  on public.supplier_payment_protections(supplier_id);

create index if not exists idx_spp_status
  on public.supplier_payment_protections(protection_status);

create index if not exists idx_srm_protection_id
  on public.supplier_release_milestones(protection_id);

create index if not exists idx_srm_job_reference
  on public.supplier_release_milestones(job_reference);

create index if not exists idx_srm_status
  on public.supplier_release_milestones(milestone_status);

-- ─── Row-Level Security ───────────────────────────────────────────────────────

alter table public.supplier_payment_protections enable row level security;
alter table public.supplier_release_milestones  enable row level security;

-- SELECT: all authenticated users can read
-- (role-specific filtering done at API layer)
do $$ begin
  if not exists (
    select 1 from pg_policies
    where tablename = 'supplier_payment_protections'
      and policyname = 'authenticated_select_spp'
  ) then
    create policy "authenticated_select_spp"
      on public.supplier_payment_protections
      for select to authenticated using (true);
  end if;
end $$;

do $$ begin
  if not exists (
    select 1 from pg_policies
    where tablename = 'supplier_release_milestones'
      and policyname = 'authenticated_select_srm'
  ) then
    create policy "authenticated_select_srm"
      on public.supplier_release_milestones
      for select to authenticated using (true);
  end if;
end $$;

-- INSERT: authenticated users can create records
-- (admin/customer enforcement at API layer via service role)
do $$ begin
  if not exists (
    select 1 from pg_policies
    where tablename = 'supplier_payment_protections'
      and policyname = 'authenticated_insert_spp'
  ) then
    create policy "authenticated_insert_spp"
      on public.supplier_payment_protections
      for insert to authenticated with check (true);
  end if;
end $$;

do $$ begin
  if not exists (
    select 1 from pg_policies
    where tablename = 'supplier_release_milestones'
      and policyname = 'authenticated_insert_srm'
  ) then
    create policy "authenticated_insert_srm"
      on public.supplier_release_milestones
      for insert to authenticated with check (true);
  end if;
end $$;

-- UPDATE: service role only (enforced at API layer via SUPABASE_SERVICE_ROLE_KEY)
-- No direct UPDATE policy for authenticated role; all updates go through API routes.

-- ─── Notes ────────────────────────────────────────────────────────────────────
-- RLS design:
--   SELECT  → authenticated (all roles); role filtering at API layer
--   INSERT  → authenticated (all roles); role/permission check at API layer
--   UPDATE  → service role only (API routes use SUPABASE_SERVICE_ROLE_KEY)
--   DELETE  → not permitted (use 'Cancelled' status instead)
--
-- Default milestone templates (applied programmatically, not stored here):
--   1. Deposit Release         30%  — Supplier acceptance / PI / Order Confirmation
--   2. Production Proof        25%  — Production photos / Factory progress report
--   3. QA / Inspection         20%  — Inspection report / Third-party QA certificate
--   4. BL / Shipping Evidence  15%  — Bill of Lading / Airway Bill / Shipment proof
--   5. Final Acceptance        10%  — Buyer acceptance / Delivery confirmation
