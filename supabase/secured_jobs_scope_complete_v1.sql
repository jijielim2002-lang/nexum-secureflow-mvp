-- =============================================================================
-- secured_jobs_scope_complete_v1.sql
-- Single authoritative migration for all payment-scope, secured-amount,
-- and secured-component columns on secured_jobs.
--
-- Supersedes / consolidates:
--   payment_scope_hardening_v1.sql  (secure_* booleans + payment_scope_note)
--   [new]                           (secured_amount_note, total_secured_base_amount)
--
-- All statements are idempotent — safe to re-run.
-- Apply in Supabase SQL Editor BEFORE the admin/provider/customer job detail
-- pages request these columns.
-- =============================================================================

-- ─── 1. Secured component selection booleans ─────────────────────────────────
--
-- Controls which value components are placed under Nexum workflow.
-- Defaults: logistics_fee = true (all others false).
-- Cargo Value is NEVER auto-included — it must be explicitly opted in.

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

-- ─── 2. Payment scope note ────────────────────────────────────────────────────
-- Admin free-text note explaining why a particular scope was chosen.

alter table public.secured_jobs
  add column if not exists payment_scope_note text;

-- ─── 3. Secured amount note ───────────────────────────────────────────────────
-- Human-readable explanation of how the secured amount was calculated.
-- E.g. "Logistics fee only (USD 6,000) — cargo value excluded from scope."

alter table public.secured_jobs
  add column if not exists secured_amount_note text;

-- ─── 4. Total secured amount in base currency ─────────────────────────────────
-- total_secured_amount in whatever currency the job uses (may be multi-currency).
-- total_secured_base_amount = amount converted to base_currency using FX rates.
-- Null until admin explicitly confirms the FX conversion.

alter table public.secured_jobs
  add column if not exists total_secured_base_amount numeric;

-- ─── 5. Backfill defaults for existing rows ──────────────────────────────────
-- Ensure existing rows have the correct boolean defaults set explicitly
-- (column defaults apply to new rows only; existing NULLs need a backfill).

update public.secured_jobs
   set secure_logistics_fee = true
 where secure_logistics_fee is null;

update public.secured_jobs
   set secure_cargo_supplier_payment = false
 where secure_cargo_supplier_payment is null;

update public.secured_jobs
   set secure_duty_tax = false
 where secure_duty_tax is null;

update public.secured_jobs
   set secure_insurance = false
 where secure_insurance is null;

update public.secured_jobs
   set secure_additional_charges = false
 where secure_additional_charges is null;

-- ─── 6. payment_obligations: payment_purpose column ──────────────────────────
-- Labels each obligation row ("Logistics Fee", "Cargo / Supplier Payment", etc.)
-- Also idempotent — harmless if payment_scope_hardening_v1.sql was already run.

alter table public.payment_obligations
  add column if not exists payment_purpose text;

-- ─── 7. Verification ─────────────────────────────────────────────────────────

select column_name, data_type, column_default, is_nullable
from   information_schema.columns
where  table_schema = 'public'
  and  table_name   = 'secured_jobs'
  and  column_name  in (
    'secure_logistics_fee', 'secure_cargo_supplier_payment',
    'secure_duty_tax', 'secure_insurance', 'secure_additional_charges',
    'payment_scope_note', 'secured_amount_note', 'total_secured_base_amount'
  )
order by column_name;
-- Expected: 8 rows

select column_name, data_type
from   information_schema.columns
where  table_schema = 'public'
  and  table_name   = 'payment_obligations'
  and  column_name  = 'payment_purpose';
-- Expected: 1 row
