-- ─── Service Inquiries & Quotations v1 ────────────────────────────────────────
-- Pre-job workflow: Customer inquiry → Provider quotation → Secured job
-- Run this in the Supabase SQL editor.

-- ── service_inquiries ─────────────────────────────────────────────────────────

create table if not exists public.service_inquiries (
  id                           uuid primary key default gen_random_uuid(),
  inquiry_reference            text not null unique,          -- INQ-20260525-A3BX
  customer_company_id          uuid references public.companies(id) on delete set null,
  requested_by                 uuid references auth.users(id) on delete set null,
  service_type                 text not null,
  origin                       text,
  destination                  text,
  route                        text,                          -- auto or manual "Origin → Destination"
  cargo_description            text,
  estimated_cargo_value        numeric,
  currency                     text not null default 'RM',
  incoterm_preference          text,
  target_delivery_date         date,
  special_requirements         text,
  assigned_provider_company_id uuid references public.companies(id) on delete set null,
  admin_notes                  text,
  status                       text not null default 'Submitted' check (status in (
    'Submitted', 'Assigned', 'Quoted', 'Converted', 'Cancelled'
  )),
  created_at                   timestamptz not null default now(),
  updated_at                   timestamptz not null default now()
);

create index if not exists idx_si_customer_company   on public.service_inquiries (customer_company_id);
create index if not exists idx_si_provider_company   on public.service_inquiries (assigned_provider_company_id);
create index if not exists idx_si_status             on public.service_inquiries (status);
create index if not exists idx_si_ref                on public.service_inquiries (inquiry_reference);

create or replace function public.fn_si_set_updated_at()
returns trigger language plpgsql security definer as $$
begin new.updated_at = now(); return new; end; $$;

drop trigger if exists trg_si_updated_at on public.service_inquiries;
create trigger trg_si_updated_at
  before update on public.service_inquiries
  for each row execute function public.fn_si_set_updated_at();

-- ── quotations ────────────────────────────────────────────────────────────────

create table if not exists public.quotations (
  id                     uuid primary key default gen_random_uuid(),
  quotation_reference    text not null unique,               -- QUO-20260525-K9ZM
  inquiry_id             uuid references public.service_inquiries(id) on delete set null,
  inquiry_reference      text,                               -- denormalised for display
  job_reference          text,                               -- populated on conversion
  provider_company_id    uuid references public.companies(id) on delete set null,
  customer_company_id    uuid references public.companies(id) on delete set null,
  quoted_by              uuid references auth.users(id) on delete set null,
  service_type           text not null,
  route                  text,
  cargo_description      text,
  job_value              numeric not null,
  currency               text not null default 'RM',
  payment_terms          text,
  required_deposit       numeric,
  balance_terms          text,
  incoterm               text,
  estimated_delivery_date date,
  special_conditions     text,
  validity_days          integer not null default 7,
  valid_until            date,
  status                 text not null default 'Submitted' check (status in (
    'Submitted', 'Accepted', 'Rejected', 'Expired', 'Converted'
  )),
  accepted_by            uuid references auth.users(id) on delete set null,
  accepted_at            timestamptz,
  rejection_reason       text,
  converted_at           timestamptz,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);

create index if not exists idx_quo_inquiry          on public.quotations (inquiry_id);
create index if not exists idx_quo_provider_company on public.quotations (provider_company_id);
create index if not exists idx_quo_customer_company on public.quotations (customer_company_id);
create index if not exists idx_quo_status           on public.quotations (status);
create index if not exists idx_quo_job_ref          on public.quotations (job_reference);

create or replace function public.fn_quo_set_updated_at()
returns trigger language plpgsql security definer as $$
begin new.updated_at = now(); return new; end; $$;

drop trigger if exists trg_quo_updated_at on public.quotations;
create trigger trg_quo_updated_at
  before update on public.quotations
  for each row execute function public.fn_quo_set_updated_at();

-- ── RLS — service_inquiries ───────────────────────────────────────────────────

alter table public.service_inquiries enable row level security;

create policy "admin_all_si" on public.service_inquiries
  for all to authenticated
  using (nexum_is_admin()) with check (nexum_is_admin());

create policy "customer_read_si" on public.service_inquiries
  for select to authenticated
  using (
    customer_company_id = (
      select company_id from public.profiles where id = auth.uid()
    )
  );

create policy "customer_insert_si" on public.service_inquiries
  for insert to authenticated
  with check (
    requested_by = auth.uid()
    and customer_company_id = (
      select company_id from public.profiles where id = auth.uid() and role = 'customer'
    )
  );

create policy "provider_read_si" on public.service_inquiries
  for select to authenticated
  using (
    assigned_provider_company_id = (
      select company_id from public.profiles where id = auth.uid() and role = 'service_provider'
    )
  );

-- ── RLS — quotations ──────────────────────────────────────────────────────────

alter table public.quotations enable row level security;

create policy "admin_all_quo" on public.quotations
  for all to authenticated
  using (nexum_is_admin()) with check (nexum_is_admin());

create policy "provider_read_quo" on public.quotations
  for select to authenticated
  using (
    provider_company_id = (
      select company_id from public.profiles where id = auth.uid() and role = 'service_provider'
    )
  );

create policy "provider_insert_quo" on public.quotations
  for insert to authenticated
  with check (
    quoted_by = auth.uid()
    and provider_company_id = (
      select company_id from public.profiles where id = auth.uid() and role = 'service_provider'
    )
  );

create policy "customer_read_quo" on public.quotations
  for select to authenticated
  using (
    customer_company_id = (
      select company_id from public.profiles where id = auth.uid() and role = 'customer'
    )
  );

-- NOTE: accept/reject/convert operations go through API with service-role client.
