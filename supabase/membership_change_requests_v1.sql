-- ─── Membership Change Requests v1 ──────────────────────────────────────────
-- Tracks provider upgrade / renewal / downgrade / trial-conversion requests.
-- No payment gateway. No official invoice. Commercial workflow only.

-- ── Table ─────────────────────────────────────────────────────────────────────

create table if not exists public.membership_change_requests (
  id                    uuid        primary key default gen_random_uuid(),
  provider_company_id   uuid        references public.companies(id) on delete set null,
  current_membership_id uuid        references public.memberships(id) on delete set null,
  current_plan_id       uuid        references public.membership_plans(id) on delete set null,
  requested_plan_id     uuid        references public.membership_plans(id) on delete set null,
  request_type          text        not null
    check (request_type in (
      'Upgrade', 'Downgrade', 'Renewal', 'Trial Conversion',
      'Custom Plan', 'Cancellation', 'Other'
    )),
  request_status        text        not null default 'Draft'
    check (request_status in (
      'Draft', 'Submitted', 'Under Review', 'Approved',
      'Rejected', 'Applied', 'Cancelled'
    )),
  reason                text,
  usage_summary         jsonb,
  commercial_note       text,
  effective_date        date,
  approved_by           uuid        references auth.users(id) on delete set null,
  approved_at           timestamptz,
  applied_at            timestamptz,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

-- ── Indexes ───────────────────────────────────────────────────────────────────

create index if not exists mcr_company_idx    on public.membership_change_requests (provider_company_id);
create index if not exists mcr_status_idx     on public.membership_change_requests (request_status);
create index if not exists mcr_type_idx       on public.membership_change_requests (request_type);
create index if not exists mcr_created_idx    on public.membership_change_requests (created_at desc);

-- ── RLS ──────────────────────────────────────────────────────────────────────

alter table public.membership_change_requests enable row level security;

-- Admin: full access
create policy "mcr_admin_all" on public.membership_change_requests
  for all to authenticated
  using (
    exists (select 1 from public.profiles where id = auth.uid() and role = 'admin')
  )
  with check (
    exists (select 1 from public.profiles where id = auth.uid() and role = 'admin')
  );

-- Provider: read own company's requests
create policy "mcr_provider_read_own" on public.membership_change_requests
  for select to authenticated
  using (
    provider_company_id = (
      select company_id from public.profiles where id = auth.uid() limit 1
    )
  );

-- Provider: create request for own company
create policy "mcr_provider_insert_own" on public.membership_change_requests
  for insert to authenticated
  with check (
    provider_company_id = (
      select company_id from public.profiles where id = auth.uid() limit 1
    )
    and exists (
      select 1 from public.profiles where id = auth.uid() and role = 'provider'
    )
  );

-- ── Grant ─────────────────────────────────────────────────────────────────────

grant select, insert, update on public.membership_change_requests to authenticated;

-- ── End ───────────────────────────────────────────────────────────────────────
-- After running this migration, providers can submit upgrade/renewal/downgrade
-- requests. Admins manage them at /admin/membership-requests.
-- No payment gateway is connected and no official invoice is issued.
