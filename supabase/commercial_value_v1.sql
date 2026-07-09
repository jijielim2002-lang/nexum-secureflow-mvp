-- ─────────────────────────────────────────────────────────────────────────────
-- Commercial Value Breakdown v1
-- Adds structured commercial value fields to secured_jobs, service_quotations,
-- customer_rfqs, job_terms_snapshots, payment_obligations, held_payments.
-- All columns use IF NOT EXISTS so the migration is idempotent.
-- DO NOT remove job_value — kept for backward compatibility.
-- ─────────────────────────────────────────────────────────────────────────────

-- ─── 1. secured_jobs ─────────────────────────────────────────────────────────

alter table public.secured_jobs
  add column if not exists incoterm                    text,
  add column if not exists cargo_value_amount          numeric,
  add column if not exists cargo_value_currency        text    not null default 'USD',
  add column if not exists cargo_value_fx_rate_to_base numeric,
  add column if not exists cargo_value_base_amount     numeric,
  add column if not exists logistics_fee_amount        numeric,
  add column if not exists logistics_fee_currency      text    not null default 'RM',
  add column if not exists duty_tax_estimate_amount    numeric,
  add column if not exists duty_tax_currency           text    not null default 'RM',
  add column if not exists insurance_cost_amount       numeric,
  add column if not exists insurance_cost_currency     text    not null default 'RM',
  add column if not exists additional_charges_amount   numeric,
  add column if not exists additional_charges_currency text    not null default 'RM',
  add column if not exists total_secured_amount        numeric,
  add column if not exists total_secured_currency      text    not null default 'RM',
  add column if not exists base_currency               text    not null default 'RM';

comment on column public.secured_jobs.cargo_value_amount
  is 'Value of goods / risk exposure. Used for customs, insurance, and trade reference. Not automatically a payment obligation.';
comment on column public.secured_jobs.logistics_fee_amount
  is 'Service provider charge. Primary amount secured under Nexum workflow.';
comment on column public.secured_jobs.total_secured_amount
  is 'Total amount controlled under Nexum SecureFlow workflow. May include logistics, cargo, duty, insurance, additional charges depending on agreed payment scope.';
comment on column public.secured_jobs.incoterm
  is 'Incoterm governs risk/cost allocation between buyer and seller.';

-- ─── 2. service_quotations ───────────────────────────────────────────────────

alter table public.service_quotations
  add column if not exists cargo_value_amount          numeric,
  add column if not exists cargo_value_currency        text    not null default 'USD',
  add column if not exists cargo_value_fx_rate_to_base numeric,
  add column if not exists cargo_value_base_amount     numeric,
  add column if not exists logistics_fee_amount        numeric,
  add column if not exists logistics_fee_currency      text    not null default 'RM',
  add column if not exists duty_tax_estimate_amount    numeric,
  add column if not exists duty_tax_currency           text    not null default 'RM',
  add column if not exists insurance_cost_amount       numeric,
  add column if not exists insurance_cost_currency     text    not null default 'RM',
  add column if not exists additional_charges_amount   numeric,
  add column if not exists additional_charges_currency text    not null default 'RM',
  add column if not exists total_secured_amount        numeric,
  add column if not exists total_secured_currency      text    not null default 'RM',
  add column if not exists base_currency               text    not null default 'RM';

-- ─── 3. customer_rfqs ────────────────────────────────────────────────────────
-- (Only if this table exists — skip if not yet created)

do $$
begin
  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'customer_rfqs') then

    alter table public.customer_rfqs
      add column if not exists cargo_value_amount          numeric,
      add column if not exists cargo_value_currency        text    not null default 'USD',
      add column if not exists cargo_value_fx_rate_to_base numeric,
      add column if not exists preferred_payment_currency  text    default 'RM',
      add column if not exists logistics_budget_amount     numeric,
      add column if not exists logistics_budget_currency   text    default 'RM',
      add column if not exists incoterm                    text;

  end if;
end;
$$;

-- ─── 4. job_terms_snapshots ──────────────────────────────────────────────────

alter table public.job_terms_snapshots
  add column if not exists incoterm                 text,
  add column if not exists cargo_value_amount       numeric,
  add column if not exists cargo_value_currency     text    default 'USD',
  add column if not exists logistics_fee_amount     numeric,
  add column if not exists logistics_fee_currency   text    default 'RM',
  add column if not exists duty_tax_estimate_amount numeric,
  add column if not exists duty_tax_currency        text    default 'RM',
  add column if not exists insurance_cost_amount    numeric,
  add column if not exists insurance_cost_currency  text    default 'RM',
  add column if not exists additional_charges_amount   numeric,
  add column if not exists additional_charges_currency text   default 'RM',
  add column if not exists total_secured_amount     numeric,
  add column if not exists total_secured_currency   text    default 'RM',
  add column if not exists base_currency            text    default 'RM';

-- ─── 5. payment_obligations — payment_purpose ────────────────────────────────

alter table public.payment_obligations
  add column if not exists payment_purpose text
    check (payment_purpose is null or payment_purpose in (
      'Cargo / Supplier Payment',
      'Logistics Fee',
      'Duty / Tax',
      'Insurance',
      'Additional Charges',
      'Nexum Service Fee',
      'Refund',
      'Other'
    ));

comment on column public.payment_obligations.payment_purpose
  is 'Describes what the payment covers. Enables line-item breakdown on settlement statements.';

-- ─── 6. held_payments — payment_purpose ─────────────────────────────────────

alter table public.held_payments
  add column if not exists payment_purpose text
    check (payment_purpose is null or payment_purpose in (
      'Cargo / Supplier Payment',
      'Logistics Fee',
      'Duty / Tax',
      'Insurance',
      'Additional Charges',
      'Nexum Service Fee',
      'Refund',
      'Other'
    ));

comment on column public.held_payments.payment_purpose
  is 'Describes what this held payment is securing. Used in payment holding display and settlement line items.';

-- ─── 7. Indexes ───────────────────────────────────────────────────────────────

create index if not exists idx_secured_jobs_incoterm
  on public.secured_jobs (incoterm)
  where incoterm is not null;

create index if not exists idx_secured_jobs_total_secured
  on public.secured_jobs (total_secured_amount)
  where total_secured_amount is not null;

create index if not exists idx_secured_jobs_cargo_value
  on public.secured_jobs (cargo_value_amount)
  where cargo_value_amount is not null;

create index if not exists idx_held_payments_payment_purpose
  on public.held_payments (payment_purpose)
  where payment_purpose is not null;

create index if not exists idx_payment_obligations_purpose
  on public.payment_obligations (payment_purpose)
  where payment_purpose is not null;

-- ─── 8. RLS — No new policies needed ─────────────────────────────────────────
-- The new columns inherit the existing RLS policies on each table.
-- secured_jobs:        providers see own company rows; customers see own company rows; admin sees all.
-- service_quotations:  providers see own; customers see own; admin sees all.
-- payment_obligations: same as secured_jobs — scoped by job_reference.
-- held_payments:       same pattern.
-- job_terms_snapshots: same pattern.
-- No additional RLS policies are required.

-- ─── 9. Audit log reminder ───────────────────────────────────────────────────
-- Audit actions to use in application code (from lib/commercialValue.ts):
--   commercial_value_breakdown_added
--   cargo_value_updated
--   logistics_fee_updated
--   total_secured_amount_updated
--   payment_purpose_added
--   fx_rate_updated
