-- =============================================================================
-- payment_scope_hardening_v1.sql
-- Adds secured-component selection columns to secured_jobs so admins can
-- explicitly choose which value components are placed under Nexum workflow.
--
-- Default behaviour preserved:
--   secure_logistics_fee = true   (logistics fee always secured by default)
--   all others            = false  (cargo value, duty/tax, etc. are risk/
--                                   reference only by default)
--
-- Also adds payment_purpose to payment_obligations for richer obligation rows.
-- payment_scope_note on secured_jobs stores a free-text explanation.
--
-- Apply in Supabase SQL Editor.
-- Safe to re-run — all statements are idempotent.
-- =============================================================================

-- ─── 1. secured_jobs: secured component selection booleans ───────────────────

alter table public.secured_jobs
  add column if not exists secure_logistics_fee          boolean default true;

alter table public.secured_jobs
  add column if not exists secure_cargo_supplier_payment boolean default false;

alter table public.secured_jobs
  add column if not exists secure_duty_tax               boolean default false;

alter table public.secured_jobs
  add column if not exists secure_insurance              boolean default false;

alter table public.secured_jobs
  add column if not exists secure_additional_charges     boolean default false;

-- Free-text note explaining scope selection (admin note, non-blocking)
alter table public.secured_jobs
  add column if not exists payment_scope_note            text;

-- ─── 2. payment_obligations: add payment_purpose ─────────────────────────────

alter table public.payment_obligations
  add column if not exists payment_purpose text;

-- ─── 3. Backfill: existing rows default to secure_logistics_fee = true ───────
-- (The ALTER already sets default=true for new rows; existing rows get NULL
--  which we treat as true in code, but an explicit backfill is cleaner.)

update public.secured_jobs
   set secure_logistics_fee = true
 where secure_logistics_fee is null;

-- ─── 4. Verification ─────────────────────────────────────────────────────────

select table_name, column_name, data_type, column_default, is_nullable
from information_schema.columns
where table_schema = 'public'
  and table_name   = 'secured_jobs'
  and column_name  in (
    'secure_logistics_fee', 'secure_cargo_supplier_payment',
    'secure_duty_tax', 'secure_insurance', 'secure_additional_charges',
    'payment_scope_note'
  )
order by column_name;
-- Expected: 6 rows

select table_name, column_name, data_type
from information_schema.columns
where table_schema = 'public'
  and table_name   = 'payment_obligations'
  and column_name  = 'payment_purpose';
-- Expected: 1 row
