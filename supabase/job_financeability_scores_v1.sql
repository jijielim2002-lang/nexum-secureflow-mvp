-- =============================================================================
-- job_financeability_scores_v1.sql
-- Job-Level Financeability Score Engine — table, indexes, RLS.
--
-- Creates:
--   public.job_financeability_scores
--
-- Also extends:
--   public.simulated_financing_offers  (adds job_financeability_score_id)
--
-- All statements are idempotent — safe to re-run.
-- Apply AFTER financing_opportunities_v1.sql and working_capital_needs_v1.sql.
-- =============================================================================

create table if not exists public.job_financeability_scores (
  id                          uuid        primary key default gen_random_uuid(),

  -- ── Scope identifiers ────────────────────────────────────────────────────
  job_reference               text,
  procurement_reference       text,
  financing_opportunity_id    uuid        references public.financing_opportunities(id) on delete set null,
  working_capital_need_id     uuid        references public.working_capital_needs(id)   on delete set null,
  company_id                  uuid        references public.companies(id) on delete cascade,
  company_name                text,

  -- ── Score type ───────────────────────────────────────────────────────────
  score_type                  text        not null check (score_type in (
                                            'Secured Job',
                                            'Procurement Order',
                                            'Supplier Protection',
                                            'Financing Opportunity',
                                            'Release Against POD',
                                            'Other'
                                          )) default 'Secured Job',

  -- ── Financeability result ─────────────────────────────────────────────────
  financeability_score        numeric     not null default 0
                                          check (financeability_score >= 0 and financeability_score <= 100),

  financeability_grade        text        not null check (financeability_grade in (
                                            'A', 'B', 'C', 'D', 'Not Suitable'
                                          )) default 'C',

  financeability_status       text        not null check (financeability_status in (
                                            'Strong',
                                            'Reviewable',
                                            'Caution',
                                            'Not Suitable',
                                            'Manual Review Required'
                                          )) default 'Reviewable',

  -- ── Recommendation ───────────────────────────────────────────────────────
  recommended_product         text,
  recommended_amount          numeric,
  currency                    text        not null default 'RM',
  suggested_tenure_days       integer,
  repayment_source            text,
  repayment_trigger           text,

  -- ── Evidence and risk detail ──────────────────────────────────────────────
  key_strengths               jsonb,      -- string[]
  key_risks                   jsonb,      -- string[]
  required_conditions         jsonb,      -- string[]
  evidence_summary            jsonb,      -- { verified_docs, terms_snapshot, evidence_pack, ... }

  -- ── Pricing ───────────────────────────────────────────────────────────────
  pricing_band                text,       -- Low | Standard | High | Manual Review | No Pricing
  recommended_fee_rate        numeric,    -- % per 30 days

  -- ── Audit trail ──────────────────────────────────────────────────────────
  calculated_by_system        boolean     not null default true,
  calculated_at               timestamptz not null default now(),

  reviewed_by                 uuid        references auth.users(id) on delete set null,
  reviewed_at                 timestamptz,
  review_note                 text,

  created_at                  timestamptz not null default now(),
  updated_at                  timestamptz not null default now()
);

-- ─── Auto-update updated_at ───────────────────────────────────────────────────

create or replace function public.set_jfs_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_jfs_updated_at on public.job_financeability_scores;
create trigger trg_jfs_updated_at
  before update on public.job_financeability_scores
  for each row execute function public.set_jfs_updated_at();

-- ─── Indexes ──────────────────────────────────────────────────────────────────

create index if not exists idx_jfs_company_id
  on public.job_financeability_scores (company_id);

create index if not exists idx_jfs_job_reference
  on public.job_financeability_scores (job_reference)
  where job_reference is not null;

create index if not exists idx_jfs_procurement_reference
  on public.job_financeability_scores (procurement_reference)
  where procurement_reference is not null;

create index if not exists idx_jfs_financing_opportunity_id
  on public.job_financeability_scores (financing_opportunity_id)
  where financing_opportunity_id is not null;

create index if not exists idx_jfs_grade
  on public.job_financeability_scores (financeability_grade);

create index if not exists idx_jfs_status
  on public.job_financeability_scores (financeability_status);

create index if not exists idx_jfs_score_type
  on public.job_financeability_scores (score_type);

create index if not exists idx_jfs_calculated_at
  on public.job_financeability_scores (calculated_at desc);

-- ─── Row-Level Security ───────────────────────────────────────────────────────

alter table public.job_financeability_scores enable row level security;

-- Admin: full access
drop policy if exists "admin_all_jfs" on public.job_financeability_scores;
create policy "admin_all_jfs"
  on public.job_financeability_scores
  for all
  to authenticated
  using (
    exists (select 1 from public.profiles where id = auth.uid() and role = 'admin')
  )
  with check (
    exists (select 1 from public.profiles where id = auth.uid() and role = 'admin')
  );

-- Company users: read their own scores
drop policy if exists "company_users_read_own_jfs" on public.job_financeability_scores;
create policy "company_users_read_own_jfs"
  on public.job_financeability_scores
  for select
  to authenticated
  using (
    company_id = (select company_id from public.profiles where id = auth.uid())
  );

-- Service role: bypass RLS
drop policy if exists "service_role_all_jfs" on public.job_financeability_scores;
create policy "service_role_all_jfs"
  on public.job_financeability_scores
  for all
  to service_role
  using (true)
  with check (true);

-- ─── Grants ───────────────────────────────────────────────────────────────────

grant select, insert, update, delete on table public.job_financeability_scores to service_role;
grant select                          on table public.job_financeability_scores to authenticated;

-- ─── Extend simulated_financing_offers ───────────────────────────────────────
-- Link back to the financeability score that generated this simulation.

alter table public.simulated_financing_offers
  add column if not exists job_financeability_score_id uuid
    references public.job_financeability_scores(id) on delete set null;

-- ─── Verification ─────────────────────────────────────────────────────────────

select column_name, data_type, column_default, is_nullable
from   information_schema.columns
where  table_schema = 'public'
  and  table_name   = 'job_financeability_scores'
order  by ordinal_position;
-- Expected: 30 columns
