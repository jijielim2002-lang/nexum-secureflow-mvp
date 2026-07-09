-- ─── job_change_requests — Amendment / Change Request Workflow v1 ──────────────
-- Run this in Supabase SQL editor.

create table if not exists public.job_change_requests (
  id                        uuid primary key default gen_random_uuid(),
  job_reference             text not null,
  requested_by              uuid references auth.users(id) on delete set null,
  requested_by_role         text,
  requested_by_company_id   uuid references public.companies(id) on delete set null,
  change_type               text not null check (change_type in (
    'Route Change',
    'ETA Change',
    'Delivery Address Change',
    'Additional Charge',
    'Payment Terms Change',
    'Incoterm Change',
    'Release Condition Change',
    'Document Requirement Change',
    'Partial Delivery',
    'Storage / Demurrage',
    'Customs / Permit Cost',
    'Other'
  )),
  change_reason             text,
  current_value             jsonb,
  proposed_value            jsonb,
  financial_impact_amount   numeric,
  currency                  text not null default 'RM',
  approval_required_from    text not null default 'Admin and Customer' check (approval_required_from in (
    'Customer',
    'Provider',
    'Admin',
    'Customer and Provider',
    'Admin and Customer',
    'All Parties'
  )),
  status                    text not null default 'Draft' check (status in (
    'Draft',
    'Submitted',
    'Pending Approval',
    'Approved',
    'Rejected',
    'Applied',
    'Cancelled'
  )),
  customer_approved_by      uuid references auth.users(id) on delete set null,
  customer_approved_at      timestamptz,
  provider_approved_by      uuid references auth.users(id) on delete set null,
  provider_approved_at      timestamptz,
  admin_approved_by         uuid references auth.users(id) on delete set null,
  admin_approved_at         timestamptz,
  rejection_reason          text,
  applied_at                timestamptz,
  created_at                timestamptz not null default now(),
  updated_at                timestamptz not null default now()
);

-- ── Indexes ────────────────────────────────────────────────────────────────────
create index if not exists idx_jcr_job_reference on public.job_change_requests (job_reference);
create index if not exists idx_jcr_status        on public.job_change_requests (status);
create index if not exists idx_jcr_requested_by  on public.job_change_requests (requested_by);
create index if not exists idx_jcr_company       on public.job_change_requests (requested_by_company_id);

-- ── updated_at auto-maintenance ───────────────────────────────────────────────
create or replace function public.fn_jcr_set_updated_at()
returns trigger language plpgsql security definer as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_jcr_updated_at on public.job_change_requests;
create trigger trg_jcr_updated_at
  before update on public.job_change_requests
  for each row execute function public.fn_jcr_set_updated_at();

-- ── RLS ───────────────────────────────────────────────────────────────────────
alter table public.job_change_requests enable row level security;

-- Admin: full access
create policy "admin_all_jcr"
  on public.job_change_requests for all
  to authenticated
  using  (nexum_is_admin())
  with check (nexum_is_admin());

-- Provider: read change requests on their jobs
create policy "provider_read_jcr"
  on public.job_change_requests for select
  to authenticated
  using (
    exists (
      select 1
      from   public.secured_jobs sj
      join   public.profiles     p  on p.id = auth.uid()
      where  sj.job_reference = job_change_requests.job_reference
        and  sj.service_provider_company_id = p.company_id
        and  p.role = 'service_provider'
    )
  );

-- Provider: insert allowed types
create policy "provider_insert_jcr"
  on public.job_change_requests for insert
  to authenticated
  with check (
    requested_by = auth.uid()
    and exists (select 1 from public.profiles where id = auth.uid() and role = 'service_provider')
    and change_type in (
      'ETA Change', 'Route Change', 'Delivery Address Change',
      'Additional Charge', 'Storage / Demurrage',
      'Document Requirement Change', 'Partial Delivery'
    )
  );

-- Customer: read change requests on their jobs
create policy "customer_read_jcr"
  on public.job_change_requests for select
  to authenticated
  using (
    exists (
      select 1
      from   public.secured_jobs sj
      join   public.profiles     p  on p.id = auth.uid()
      where  sj.job_reference = job_change_requests.job_reference
        and  sj.customer_company_id = p.company_id
        and  p.role = 'customer'
    )
  );

-- Customer: insert allowed types
create policy "customer_insert_jcr"
  on public.job_change_requests for insert
  to authenticated
  with check (
    requested_by = auth.uid()
    and exists (select 1 from public.profiles where id = auth.uid() and role = 'customer')
    and change_type in (
      'Delivery Address Change', 'Partial Delivery',
      'Payment Terms Change', 'Document Requirement Change'
    )
  );

-- NOTE: Approve / reject / apply actions go through the API with service-role client.
-- Provider and customer do not need UPDATE policies — all mutations use svc (service role).
