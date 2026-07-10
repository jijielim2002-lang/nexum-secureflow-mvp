-- ─── Buyer–Supplier Relationship History v1 ──────────────────────────────────
-- Tracks relationship intelligence between each buyer company and supplier counterparty.
-- NOT a credit approval. NOT a guaranteed-supplier certification.
-- Risk context and recommended advance guidance derived from Nexum workflow records only.

create table if not exists public.buyer_supplier_relationships (
  id                              uuid primary key default gen_random_uuid(),
  buyer_company_id                uuid references public.companies(id) on delete cascade,
  supplier_id                     uuid references public.supplier_counterparties(id) on delete cascade,
  buyer_name                      text,
  supplier_name                   text,
  relationship_status             text check (relationship_status in (
    'New', 'Known', 'Established', 'Trusted', 'Watchlist', 'Blocked'
  )) default 'New',
  first_transaction_date          date,
  last_transaction_date           date,
  relationship_years              numeric,
  total_jobs                      integer  default 0,
  completed_jobs                  integer  default 0,
  active_jobs                     integer  default 0,
  total_cargo_value               numeric  default 0,
  total_advance_paid              numeric  default 0,
  total_released_amount           numeric  default 0,
  total_disputed_amount           numeric  default 0,
  average_advance_percentage      numeric,
  average_order_value             numeric,
  repurchase_frequency            text,
  purchase_cycle_days             integer,
  successful_milestones           integer  default 0,
  disputed_flows                  integer  default 0,
  rejected_evidence_count         integer  default 0,
  on_time_delivery_rate           numeric,
  payment_protection_success_rate numeric,
  relationship_trust_score        numeric,
  recommended_advance_percentage  numeric,
  recommended_release_model       text,
  risk_note                       text,
  -- Admin status override
  status_override_by              uuid references auth.users(id),
  status_override_at              timestamptz,
  status_override_reason          text,
  -- Admin recommendation override
  recommendation_override_by      uuid references auth.users(id),
  recommendation_override_at      timestamptz,
  recommendation_override_reason  text,
  recommendation_override_value   numeric,
  -- Timestamps
  last_calculated_at              timestamptz,
  created_at                      timestamptz default now(),
  updated_at                      timestamptz default now()
);

-- Unique constraint: one record per buyer-supplier pair
create unique index buyer_supplier_rel_pair_uidx
  on public.buyer_supplier_relationships (buyer_company_id, supplier_id);

-- Supporting indexes
create index buyer_supplier_rel_buyer_idx
  on public.buyer_supplier_relationships (buyer_company_id);

create index buyer_supplier_rel_supplier_idx
  on public.buyer_supplier_relationships (supplier_id);

create index buyer_supplier_rel_status_idx
  on public.buyer_supplier_relationships (relationship_status);

create index buyer_supplier_rel_score_idx
  on public.buyer_supplier_relationships (relationship_trust_score desc nulls last);

-- ── Row-Level Security ────────────────────────────────────────────────────────
-- Authenticated users can read all records (admin manages via service role).
-- Insert/Update/Delete is via service role only (no RLS needed — blocked by default).

alter table public.buyer_supplier_relationships enable row level security;

create policy "authenticated_select_buyer_supplier_relationships"
  on public.buyer_supplier_relationships
  for select
  to authenticated
  using (true);
