-- =============================================================================
-- secured_jobs Extended Columns v1
-- Adds all extended columns required by the Create Job form.
-- All statements use ADD COLUMN IF NOT EXISTS — idempotent, safe to re-run.
--
-- Apply in Supabase SQL Editor BEFORE submitting the Create Job form.
-- This migration consolidates commercial_value_v1.sql and hs_code_v1.sql
-- columns for secured_jobs into a single, easy-to-apply script.
--
-- Column ownership:
--   Commercial Value  → incoterm, cargo_value_*, logistics_fee_*, duty_tax_*,
--                       insurance_cost_*, additional_charges_*, total_secured_*,
--                       base_currency
--   HS Code / Customs → hs_code, hs_code_description, hs_code_source,
--                       commodity_category, permit_required, permit_note,
--                       customs_risk_level, duty_rate_estimate, tax_rate_estimate
--   Delivery Status   → delivery_confirmation_status (set by delivery-confirmation
--                       API, not by the create-job form)
-- =============================================================================

-- ─── 1. Commercial Value Breakdown ───────────────────────────────────────────

alter table public.secured_jobs
  add column if not exists incoterm                    text,
  add column if not exists cargo_value_amount          numeric,
  add column if not exists cargo_value_currency        text not null default 'USD',
  add column if not exists cargo_value_fx_rate_to_base numeric,
  add column if not exists cargo_value_base_amount     numeric,
  add column if not exists logistics_fee_amount        numeric,
  add column if not exists logistics_fee_currency      text not null default 'RM',
  add column if not exists duty_tax_estimate_amount    numeric,
  add column if not exists duty_tax_currency           text not null default 'RM',
  add column if not exists insurance_cost_amount       numeric,
  add column if not exists insurance_cost_currency     text not null default 'RM',
  add column if not exists additional_charges_amount   numeric,
  add column if not exists additional_charges_currency text not null default 'RM',
  add column if not exists total_secured_amount        numeric,
  add column if not exists total_secured_currency      text not null default 'RM',
  add column if not exists base_currency               text not null default 'RM';

comment on column public.secured_jobs.incoterm
  is 'Incoterm (e.g. FOB, CIF, DDP). Governs risk and cost allocation between buyer and seller.';
comment on column public.secured_jobs.cargo_value_amount
  is 'Value of goods / cargo. Used for customs, insurance, and trade reference. Not automatically a payment obligation.';
comment on column public.secured_jobs.logistics_fee_amount
  is 'Service provider logistics charge. Primary amount secured under the Nexum workflow.';
comment on column public.secured_jobs.total_secured_amount
  is 'Total amount controlled under Nexum SecureFlow. Includes logistics fee and any other agreed charges.';
comment on column public.secured_jobs.base_currency
  is 'Base/reporting currency for FX conversions (typically RM).';

-- ─── 2. HS Code & Customs Classification ─────────────────────────────────────

alter table public.secured_jobs
  add column if not exists hs_code             text,
  add column if not exists hs_code_description text,
  add column if not exists hs_code_source      text default 'Manual'
    check (
      hs_code_source is null
      or hs_code_source in ('Manual', 'Document Extracted', 'Verified')
    ),
  add column if not exists commodity_category  text,
  add column if not exists permit_required     boolean default false,
  add column if not exists permit_note         text,
  add column if not exists customs_risk_level  text default 'Medium'
    check (
      customs_risk_level is null
      or customs_risk_level in ('Low', 'Medium', 'High', 'Critical')
    ),
  add column if not exists duty_rate_estimate  numeric,
  add column if not exists tax_rate_estimate   numeric;

comment on column public.secured_jobs.hs_code
  is 'Harmonised System (HS) commodity code. Used for customs classification and duty estimate.';
comment on column public.secured_jobs.hs_code_source
  is 'How the HS code was obtained: Manual (provider), Document Extracted (AI), Verified (admin).';
comment on column public.secured_jobs.customs_risk_level
  is 'Admin-assessed customs risk for this shipment: Low / Medium / High / Critical.';
comment on column public.secured_jobs.permit_required
  is 'Whether an import/export permit or license is required for this commodity.';
comment on column public.secured_jobs.duty_rate_estimate
  is 'Estimated import duty rate as a percentage (e.g. 5 = 5%). Manual entry only.';
comment on column public.secured_jobs.tax_rate_estimate
  is 'Estimated import tax/GST rate as a percentage. Manual entry only.';

-- ─── 3. Delivery Confirmation Status ─────────────────────────────────────────
-- Set by the delivery-confirmation API routes, not by the create-job form.
-- Added here so the column is guaranteed present for SELECT queries.

alter table public.secured_jobs
  add column if not exists delivery_confirmation_status text
    check (
      delivery_confirmation_status is null
      or delivery_confirmation_status in (
        'Pending Customer Confirmation',
        'Confirmed by Customer',
        'Auto Confirmed',
        'Disputed'
      )
    );

comment on column public.secured_jobs.delivery_confirmation_status
  is 'Customer-facing delivery confirmation state. Set by /api/delivery-confirmations routes.';

-- ─── 4. Indexes ──────────────────────────────────────────────────────────────

create index if not exists idx_secured_jobs_incoterm
  on public.secured_jobs (incoterm)
  where incoterm is not null;

create index if not exists idx_secured_jobs_total_secured
  on public.secured_jobs (total_secured_amount)
  where total_secured_amount is not null;

create index if not exists idx_secured_jobs_cargo_value
  on public.secured_jobs (cargo_value_amount)
  where cargo_value_amount is not null;

create index if not exists idx_secured_jobs_hs_code
  on public.secured_jobs (hs_code)
  where hs_code is not null;

create index if not exists idx_secured_jobs_customs_risk
  on public.secured_jobs (customs_risk_level)
  where customs_risk_level is not null;

create index if not exists idx_secured_jobs_permit_required
  on public.secured_jobs (permit_required)
  where permit_required = true;

-- ─── 5. Verification query ───────────────────────────────────────────────────
-- Run this after applying the migration to confirm all columns exist.
-- Expected: one row per column listed, information_schema shows data_type.

select column_name, data_type, column_default, is_nullable
from information_schema.columns
where table_schema = 'public'
  and table_name   = 'secured_jobs'
  and column_name in (
    -- Commercial Value
    'incoterm', 'cargo_value_amount', 'cargo_value_currency',
    'cargo_value_fx_rate_to_base', 'cargo_value_base_amount',
    'logistics_fee_amount', 'logistics_fee_currency',
    'duty_tax_estimate_amount', 'duty_tax_currency',
    'insurance_cost_amount', 'insurance_cost_currency',
    'additional_charges_amount', 'additional_charges_currency',
    'total_secured_amount', 'total_secured_currency', 'base_currency',
    -- HS Code / Customs
    'hs_code', 'hs_code_description', 'hs_code_source',
    'commodity_category', 'permit_required', 'permit_note',
    'customs_risk_level', 'duty_rate_estimate', 'tax_rate_estimate',
    -- Delivery
    'delivery_confirmation_status'
  )
order by column_name;
-- Expected: 26 rows returned. If fewer, the missing columns still need adding.
