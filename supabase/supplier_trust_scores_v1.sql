-- ─── Supplier Trust Scores v1 ─────────────────────────────────────────────────
-- Idempotent: safe to run multiple times.
-- Stores computed supplier risk intelligence scores derived from Nexum workflow
-- records only. NOT a guarantee of supplier quality, legal certification, or
-- approved supplier status.

-- ── Table ─────────────────────────────────────────────────────────────────────

create table if not exists public.supplier_trust_scores (
  id                           uuid primary key default gen_random_uuid(),
  supplier_id                  uuid references public.supplier_counterparties(id) on delete cascade,
  supplier_name                text,
  supplier_country             text,
  total_jobs                   integer default 0,
  total_protection_flows       integer default 0,
  completed_protection_flows   integer default 0,
  active_protection_flows      integer default 0,
  disputed_flows               integer default 0,
  verified_milestones          integer default 0,
  rejected_milestones          integer default 0,
  average_evidence_confidence  numeric,
  on_time_milestone_rate       numeric,
  document_consistency_score   numeric,
  evidence_quality_score       numeric,
  shipment_completion_score    numeric,
  dispute_score                numeric,
  overall_supplier_trust_score numeric,
  supplier_grade               text check (supplier_grade in ('A','B','C','D','Watchlist','Blocked')) default 'C',
  risk_level                   text check (risk_level in ('Low','Medium','High','Critical'))          default 'Medium',
  recommended_release_model    text,
  recommended_advance_limit    numeric,
  recommended_precaution       text,
  last_calculated_at           timestamptz,
  created_at                   timestamptz default now(),
  updated_at                   timestamptz default now()
);

comment on table public.supplier_trust_scores is
  'Supplier risk context scores derived from Nexum workflow records. '
  'Not a guarantee of supplier quality, legal certification, or approved-supplier status.';

-- ── Indexes ───────────────────────────────────────────────────────────────────

-- One score row per supplier (upsert target)
create unique index if not exists supplier_trust_scores_supplier_id_uidx
  on public.supplier_trust_scores (supplier_id);

create index if not exists supplier_trust_scores_grade_idx
  on public.supplier_trust_scores (supplier_grade);

create index if not exists supplier_trust_scores_risk_idx
  on public.supplier_trust_scores (risk_level);

create index if not exists supplier_trust_scores_score_idx
  on public.supplier_trust_scores (overall_supplier_trust_score desc);

create index if not exists supplier_trust_scores_name_idx
  on public.supplier_trust_scores (supplier_name);

create index if not exists supplier_trust_scores_country_idx
  on public.supplier_trust_scores (supplier_country);

-- ── RLS ───────────────────────────────────────────────────────────────────────

alter table public.supplier_trust_scores enable row level security;

-- All authenticated users may SELECT (app layer filters by role)
drop policy if exists "authenticated_select_supplier_trust_scores"
  on public.supplier_trust_scores;

create policy "authenticated_select_supplier_trust_scores"
  on public.supplier_trust_scores
  for select
  to authenticated
  using (true);

-- INSERT / UPDATE / DELETE: service role only (no RLS policies = blocked for authenticated)
-- All writes go through the /api/supplier-trust-scores recalculate endpoint
-- using the SUPABASE_SERVICE_ROLE_KEY.

-- ── Audit log actions (for reference) ────────────────────────────────────────
-- supplier_trust_score_calculated
-- supplier_grade_changed
-- supplier_release_model_recommended
-- supplier_risk_warning_generated
