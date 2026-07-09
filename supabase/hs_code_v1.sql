-- ─────────────────────────────────────────────────────────────────────────────
-- HS Code & Customs Classification v1
-- Adds HS Code, commodity classification, permit, customs risk, and duty/tax
-- rate estimate fields across secured_jobs, service_quotations, customer_rfqs,
-- job_terms_snapshots, and trade_intelligence_profiles.
-- All columns use IF NOT EXISTS — idempotent.
-- trade_intelligence_profiles already has hs_code — add new customs columns only.
-- ─────────────────────────────────────────────────────────────────────────────

-- ─── 1. secured_jobs ─────────────────────────────────────────────────────────

alter table public.secured_jobs
  add column if not exists hs_code                text,
  add column if not exists hs_code_description    text,
  add column if not exists hs_code_source         text    default 'Manual'
    check (hs_code_source is null or hs_code_source in ('Manual', 'Document Extracted', 'Verified')),
  add column if not exists commodity_category     text,
  add column if not exists permit_required        boolean default false,
  add column if not exists permit_note            text,
  add column if not exists customs_risk_level     text    default 'Medium'
    check (customs_risk_level is null or customs_risk_level in ('Low', 'Medium', 'High', 'Critical')),
  add column if not exists duty_rate_estimate     numeric,
  add column if not exists tax_rate_estimate      numeric;

comment on column public.secured_jobs.hs_code
  is 'Harmonised System (HS) commodity code. Used for customs classification, duty estimate, and permit check.';
comment on column public.secured_jobs.hs_code_source
  is 'How the HS code was obtained: Manual (provider entered), Document Extracted (AI from Commercial Invoice), Verified (admin confirmed extraction).';
comment on column public.secured_jobs.customs_risk_level
  is 'Admin-assessed customs risk for this commodity. Low/Medium/High/Critical.';
comment on column public.secured_jobs.duty_rate_estimate
  is 'Estimated import duty rate as a percentage (e.g. 5 = 5%). Manual entry only — not connected to customs API.';
comment on column public.secured_jobs.tax_rate_estimate
  is 'Estimated import tax rate as a percentage (e.g. 6 = 6% GST). Applied to (cargo value + duty). Manual entry only.';
comment on column public.secured_jobs.permit_required
  is 'Whether an import/export permit or license is required for this commodity. Subject to verification.';

-- ─── 2. service_quotations ───────────────────────────────────────────────────

alter table public.service_quotations
  add column if not exists hs_code                text,
  add column if not exists hs_code_description    text,
  add column if not exists hs_code_source         text    default 'Manual'
    check (hs_code_source is null or hs_code_source in ('Manual', 'Document Extracted', 'Verified')),
  add column if not exists commodity_category     text,
  add column if not exists permit_required        boolean,
  add column if not exists permit_note            text,
  add column if not exists customs_risk_level     text
    check (customs_risk_level is null or customs_risk_level in ('Low', 'Medium', 'High', 'Critical')),
  add column if not exists duty_rate_estimate     numeric,
  add column if not exists tax_rate_estimate      numeric;

-- ─── 3. customer_rfqs (defensive — only if table exists) ─────────────────────

do $$
begin
  if exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'customer_rfqs'
  ) then
    alter table public.customer_rfqs
      add column if not exists hs_code            text,
      add column if not exists hs_code_description text,
      add column if not exists commodity_category text,
      add column if not exists permit_required    boolean,
      add column if not exists permit_note        text;
  end if;
end;
$$;

-- ─── 4. job_terms_snapshots ──────────────────────────────────────────────────

alter table public.job_terms_snapshots
  add column if not exists hs_code                text,
  add column if not exists hs_code_description    text,
  add column if not exists commodity_category     text,
  add column if not exists permit_required        boolean,
  add column if not exists customs_risk_level     text
    check (customs_risk_level is null or customs_risk_level in ('Low', 'Medium', 'High', 'Critical')),
  add column if not exists duty_rate_estimate     numeric,
  add column if not exists tax_rate_estimate      numeric;

-- ─── 5. trade_intelligence_profiles — add supplementary customs columns ───────
-- Note: hs_code already exists on this table (added by original TIP schema).
-- Only add new columns here.

do $$
begin
  if exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'trade_intelligence_profiles'
  ) then
    alter table public.trade_intelligence_profiles
      add column if not exists hs_code_description    text,
      add column if not exists hs_code_source         text    default 'Manual'
        check (hs_code_source is null or hs_code_source in ('Manual', 'Document Extracted', 'Verified')),
      add column if not exists commodity_category     text,
      add column if not exists permit_required        boolean,
      add column if not exists permit_note            text,
      add column if not exists customs_risk_level     text
        check (customs_risk_level is null or customs_risk_level in ('Low', 'Medium', 'High', 'Critical')),
      add column if not exists duty_rate_estimate     numeric,
      add column if not exists tax_rate_estimate      numeric;
  end if;
end;
$$;

-- ─── 6. business_context_profiles — commodity analysis fields ────────────────

do $$
begin
  if exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'business_context_profiles'
  ) then
    alter table public.business_context_profiles
      add column if not exists hs_code            text,
      add column if not exists commodity_category text;
  end if;
end;
$$;

-- ─── 7. Indexes ───────────────────────────────────────────────────────────────

create index if not exists idx_secured_jobs_hs_code
  on public.secured_jobs (hs_code)
  where hs_code is not null;

create index if not exists idx_secured_jobs_customs_risk
  on public.secured_jobs (customs_risk_level)
  where customs_risk_level is not null;

create index if not exists idx_secured_jobs_permit_required
  on public.secured_jobs (permit_required)
  where permit_required = true;

create index if not exists idx_service_quotations_hs_code
  on public.service_quotations (hs_code)
  where hs_code is not null;

-- ─── 8. RLS — No new policies needed ─────────────────────────────────────────
-- New columns inherit existing RLS on each table.
-- secured_jobs, service_quotations, job_terms_snapshots, trade_intelligence_profiles
-- all have existing row-level security — no additions required.

-- ─── 9. Audit action reference (used in application code from lib/hsCode.ts) ──
-- hs_code_added
-- hs_code_updated
-- hs_code_extracted_from_document
-- hs_code_verified
-- customs_risk_updated
-- permit_requirement_updated
