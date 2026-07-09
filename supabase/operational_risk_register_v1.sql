-- ─── Operational Risk Register v1 ────────────────────────────────────────────
-- Central register for tracking operational, payment, supplier, shipment,
-- compliance, user access, control override, and platform risks.
--
-- Constraints:
--   - Does NOT create legal risk opinions.
--   - Does NOT connect external risk database.
--   - This is internal operational risk tracking only.
--   - Does NOT auto-block workflow actions.

-- ── Tables ────────────────────────────────────────────────────────────────────

create table if not exists public.operational_risk_register (
  id                     uuid        primary key default gen_random_uuid(),
  risk_reference         text        unique not null,
  job_reference          text,
  procurement_reference  text,
  company_id             uuid        references public.companies(id),
  supplier_id            uuid        references public.supplier_counterparties(id),
  risk_category          text        check (risk_category in (
    'Payment Risk',
    'Release Risk',
    'Supplier Risk',
    'Buyer Risk',
    'Provider Risk',
    'Shipment Risk',
    'Document Risk',
    'Customs / HS Code Risk',
    'Incoterm / Responsibility Risk',
    'Dispute / Claim Risk',
    'Compliance Wording Risk',
    'RLS / Access Control Risk',
    'Internal Control Override Risk',
    'System / Data Quality Risk',
    'AI Extraction Risk',
    'Bank Reconciliation Risk',
    'Other'
  )),
  risk_title             text        not null,
  risk_description       text,
  risk_severity          text        check (risk_severity in ('Low', 'Medium', 'High', 'Critical')) default 'Medium',
  likelihood             text        check (likelihood in ('Low', 'Medium', 'High')) default 'Medium',
  impact                 text        check (impact in ('Low', 'Medium', 'High', 'Critical')) default 'Medium',
  risk_status            text        check (risk_status in (
    'Open',
    'In Review',
    'Mitigation Active',
    'Accepted',
    'Resolved',
    'Closed'
  )) default 'Open',
  root_cause             text,
  mitigation_plan        text,
  owner_role             text,
  owner_user_id          uuid        references auth.users(id),
  due_date               date,
  resolved_at            timestamptz,
  resolution_note        text,
  source_type            text,
  source_id              uuid,
  created_by             uuid        references auth.users(id),
  created_at             timestamptz default now(),
  updated_at             timestamptz default now()
);

create table if not exists public.risk_mitigation_actions (
  id               uuid        primary key default gen_random_uuid(),
  risk_id          uuid        references public.operational_risk_register(id) on delete cascade,
  action_title     text,
  action_description text,
  assigned_role    text,
  assigned_user_id uuid        references auth.users(id),
  status           text        check (status in ('Open', 'In Progress', 'Completed', 'Dismissed', 'Overdue')) default 'Open',
  due_at           timestamptz,
  completed_at     timestamptz,
  created_at       timestamptz default now()
);

-- ── Indexes ───────────────────────────────────────────────────────────────────

create index if not exists orr_job_reference_idx       on public.operational_risk_register (job_reference);
create index if not exists orr_procurement_ref_idx     on public.operational_risk_register (procurement_reference);
create index if not exists orr_company_id_idx          on public.operational_risk_register (company_id);
create index if not exists orr_supplier_id_idx         on public.operational_risk_register (supplier_id);
create index if not exists orr_risk_status_idx         on public.operational_risk_register (risk_status);
create index if not exists orr_risk_severity_idx       on public.operational_risk_register (risk_severity);
create index if not exists orr_risk_category_idx       on public.operational_risk_register (risk_category);
create index if not exists orr_source_type_id_idx      on public.operational_risk_register (source_type, source_id);
create index if not exists orr_created_at_idx          on public.operational_risk_register (created_at desc);
create index if not exists rma_risk_id_idx             on public.risk_mitigation_actions (risk_id);

-- ── RLS ───────────────────────────────────────────────────────────────────────

alter table public.operational_risk_register  enable row level security;
alter table public.risk_mitigation_actions    enable row level security;

-- Risk register: admin sees all; others see only risks linked to their job/company
create policy "orr_select_admin"
  on public.operational_risk_register for select
  to authenticated
  using (
    exists (
      select 1 from public.profiles
      where id = auth.uid() and role = 'admin'
    )
  );

create policy "orr_select_own_company"
  on public.operational_risk_register for select
  to authenticated
  using (
    company_id = (
      select company_id from public.profiles where id = auth.uid()
    )
    or
    job_reference in (
      select job_reference from public.secured_jobs
      where customer_company_id = (
        select company_id from public.profiles where id = auth.uid()
      )
    )
  );

-- Mitigation actions: follow risk register access
create policy "rma_select_admin"
  on public.risk_mitigation_actions for select
  to authenticated
  using (
    exists (
      select 1 from public.profiles
      where id = auth.uid() and role = 'admin'
    )
  );

create policy "rma_select_via_risk"
  on public.risk_mitigation_actions for select
  to authenticated
  using (
    risk_id in (
      select id from public.operational_risk_register
      where company_id = (select company_id from public.profiles where id = auth.uid())
         or job_reference in (
           select job_reference from public.secured_jobs
           where customer_company_id = (select company_id from public.profiles where id = auth.uid())
         )
    )
  );

-- INSERT/UPDATE/DELETE: service role only via API routes
