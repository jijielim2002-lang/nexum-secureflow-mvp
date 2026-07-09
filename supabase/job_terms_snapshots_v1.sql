-- ─── Job Terms Snapshots v1 ───────────────────────────────────────────────────
-- Captures a frozen snapshot of agreed commercial terms when a customer accepts
-- a secured job. Used for audit trail, disputes, evidence pack, and release governance.
--
-- COMPLIANCE NOTE:
--   This is a commercial terms snapshot and acceptance record only.
--   It is NOT a final legal contract and does NOT constitute legal advice.
--   Consult a qualified legal professional for formal agreements.

-- ─── Table ────────────────────────────────────────────────────────────────────

create table if not exists job_terms_snapshots (
  id                               uuid primary key default gen_random_uuid(),
  job_reference                    text not null,
  version_number                   integer not null default 1,          -- increments on amendment
  is_current                       boolean not null default true,       -- only latest is true

  -- Parties
  customer_company_id              uuid references public.companies(id) on delete set null,
  provider_company_id              uuid references public.companies(id) on delete set null,
  accepted_by                      uuid references auth.users(id) on delete set null,
  accepted_at                      timestamptz default now(),

  -- Terms version
  terms_version                    text not null default 'v1.0',

  -- Job commercial details (frozen at acceptance)
  service_type                     text,
  route                            text,
  job_value                        numeric,
  currency                         text,
  payment_terms                    text,
  required_deposit                 numeric,
  balance_terms                    text,

  -- Operational rules (frozen at acceptance)
  delivery_confirmation_window_hours  integer not null default 48,
  release_condition                text,
  dispute_condition                text,
  liability_note                   text,
  required_documents               jsonb,           -- array of doc type strings

  -- Pilot disclaimer
  pilot_disclaimer                 text,

  -- Amendment tracking
  amendment_reason                 text,            -- null for original; populated on amendments
  amended_by                       uuid references auth.users(id) on delete set null,
  amended_at                       timestamptz,

  -- Full job data snapshot (immutable copy of secured_jobs row at acceptance time)
  snapshot_data                    jsonb,

  created_at                       timestamptz not null default now()
);

-- ─── Indexes ──────────────────────────────────────────────────────────────────

create index if not exists idx_jts_job_reference
  on job_terms_snapshots (job_reference);

create index if not exists idx_jts_job_current
  on job_terms_snapshots (job_reference, is_current)
  where is_current = true;

create index if not exists idx_jts_customer
  on job_terms_snapshots (customer_company_id);

create index if not exists idx_jts_provider
  on job_terms_snapshots (provider_company_id);

-- ─── RLS ──────────────────────────────────────────────────────────────────────

alter table job_terms_snapshots enable row level security;

-- Admin: full access
create policy "admin_all_jts" on job_terms_snapshots
  for all
  using (nexum_is_admin())
  with check (nexum_is_admin());

-- Customer: read own snapshots (their company or their user acceptance)
create policy "customer_read_jts" on job_terms_snapshots
  for select
  using (
    auth.uid() = accepted_by
    or customer_company_id in (
      select company_id from profiles where id = auth.uid()
    )
  );

-- Customer: insert own snapshot (locked to auth.uid() as accepted_by)
create policy "customer_insert_jts" on job_terms_snapshots
  for insert
  with check (
    auth.uid() = accepted_by
    and customer_company_id in (
      select company_id from profiles where id = auth.uid()
    )
  );

-- Provider: read snapshots for their jobs
create policy "provider_read_jts" on job_terms_snapshots
  for select
  using (
    provider_company_id in (
      select company_id from profiles where id = auth.uid()
    )
  );

-- ─── Trigger: mark old versions non-current on new insert ─────────────────────

create or replace function mark_old_jts_not_current()
returns trigger language plpgsql security definer as $$
begin
  -- When inserting a new snapshot for the same job, mark all prior ones as not current
  update job_terms_snapshots
  set    is_current = false
  where  job_reference = NEW.job_reference
    and  id != NEW.id
    and  is_current = true;
  return NEW;
end;
$$;

drop trigger if exists trg_jts_mark_old_not_current on job_terms_snapshots;
create trigger trg_jts_mark_old_not_current
  after insert on job_terms_snapshots
  for each row execute function mark_old_jts_not_current();
