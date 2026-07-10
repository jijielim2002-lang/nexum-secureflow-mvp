-- ─── Supplier Exposure Limits v1 ──────────────────────────────────────────────
-- Idempotent: safe to run multiple times.
-- Risk-based advance guidance derived from Nexum workflow records.
-- NOT credit approval. NOT a guarantee of supplier performance.
-- NOT a "safe to pay" certification.

-- ── Table ─────────────────────────────────────────────────────────────────────

create table if not exists public.supplier_exposure_limits (
  id                              uuid primary key default gen_random_uuid(),
  supplier_id                     uuid references public.supplier_counterparties(id) on delete cascade,
  buyer_company_id                uuid references public.companies(id) on delete set null,
  supplier_name                   text,
  buyer_name                      text,
  currency                        text default 'USD',
  recommended_max_advance_amount  numeric,
  recommended_max_advance_percentage numeric,
  current_active_exposure         numeric default 0,
  total_historical_exposure       numeric default 0,
  open_protection_flows           integer default 0,
  active_disputes                 integer default 0,
  supplier_trust_score            numeric,
  supplier_grade                  text,
  buyer_payment_score             numeric,
  risk_level                      text check (risk_level in ('Low','Medium','High','Critical')) default 'Medium',
  recommended_release_model       text,
  exposure_status                 text check (exposure_status in (
    'Within Limit',
    'Near Limit',
    'Exceeds Limit',
    'Blocked / Review Required'
  )) default 'Within Limit',
  rationale                       text,
  -- Override tracking
  advance_override_requested      boolean default false,
  advance_override_reason         text,
  advance_override_approved_at    timestamptz,
  advance_override_approved_by    uuid references auth.users(id),
  advance_override_admin_note     text,
  last_calculated_at              timestamptz,
  created_at                      timestamptz default now(),
  updated_at                      timestamptz default now()
);

comment on table public.supplier_exposure_limits is
  'Risk-based advance payment guidance. NOT credit approval, NOT guaranteed-supplier status. '
  'Recommended exposure limits derived from Nexum workflow records only.';

-- ── Indexes ───────────────────────────────────────────────────────────────────

-- One record per supplier+buyer pair (upsert target)
create unique index if not exists supplier_exposure_limits_supplier_buyer_uidx
  on public.supplier_exposure_limits (supplier_id, buyer_company_id)
  where buyer_company_id is not null;

-- Supplier-only lookup (no buyer filter)
create index if not exists supplier_exposure_limits_supplier_idx
  on public.supplier_exposure_limits (supplier_id);

create index if not exists supplier_exposure_limits_buyer_idx
  on public.supplier_exposure_limits (buyer_company_id);

create index if not exists supplier_exposure_limits_status_idx
  on public.supplier_exposure_limits (exposure_status);

create index if not exists supplier_exposure_limits_risk_idx
  on public.supplier_exposure_limits (risk_level);

create index if not exists supplier_exposure_limits_override_idx
  on public.supplier_exposure_limits (advance_override_requested)
  where advance_override_requested = true;

-- ── RLS ───────────────────────────────────────────────────────────────────────

alter table public.supplier_exposure_limits enable row level security;

-- All authenticated users may SELECT (app layer filters by role)
drop policy if exists "authenticated_select_supplier_exposure_limits"
  on public.supplier_exposure_limits;

create policy "authenticated_select_supplier_exposure_limits"
  on public.supplier_exposure_limits
  for select
  to authenticated
  using (true);

-- INSERT / UPDATE / DELETE: service role only (no RLS policy = blocked for authenticated)
-- All writes via /api/supplier-exposure-limits using SUPABASE_SERVICE_ROLE_KEY

-- ── Audit log actions (for reference) ────────────────────────────────────────
-- supplier_exposure_limit_calculated
-- supplier_exposure_limit_exceeded
-- supplier_advance_override_requested
-- supplier_advance_override_approved
-- supplier_advance_override_rejected
