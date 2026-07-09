-- =============================================================================
-- NEXUM SECUREFLOW — 001_core_production_schema.sql
-- Consolidated idempotent reference migration for all core pilot workflow tables.
--
-- PURPOSE:
--   Single file you can run against a FRESH Supabase project to stand up
--   the complete core schema, OR run against an existing project — all
--   statements use IF NOT EXISTS / ADD COLUMN IF NOT EXISTS so they are safe
--   to re-run without destroying data.
--
-- SCOPE: Core pilot workflow only
--   company setup → job creation → customer acceptance →
--   payment obligation → payment proof → admin verification →
--   payment secured → provider execution → POD → customer confirmation →
--   release approval → settlement/payout → audit log → evidence pack
--
-- PREREQUISITE FILES (run BEFORE this file if setting up fresh):
--   None — this file is self-contained for the core tables.
--
-- AFTER THIS FILE, ALSO RUN:
--   002_rls_supplement.sql          — RLS policies for tables below
--   rls_hardening_v1.sql            — existing RLS for secured_jobs, docs, audit, etc.
--   payment_holding_v1.sql          — held_payments, release_instructions
--   payment_ledger_v1.sql           — payment_obligations, payment_ledger_events
--   release_settlements_v1.sql      — release_settlements
--   claim_reserves_v1.sql           — claim_reserves
--   go_live_readiness_v1.sql        — go_live_readiness_items
--
-- COMPLIANCE:
--   This schema records WORKFLOW STATUS only.
--   Nexum does not hold or disburse funds directly.
--   All payment operations are manual.
--   Do not say "legal escrow" — say "designated payment holding workflow".
-- =============================================================================


-- =============================================================================
-- 0. HELPER FUNCTIONS
-- These are SECURITY DEFINER so they bypass RLS when reading profiles.
-- If they already exist from rls_hardening_v1.sql, these are no-ops.
-- =============================================================================

create or replace function public.nexum_my_role()
returns text
language sql stable security definer
set search_path = public
as $$
  select role from profiles where id = auth.uid()
$$;

create or replace function public.nexum_my_company_id()
returns uuid
language sql stable security definer
set search_path = public
as $$
  select company_id from profiles where id = auth.uid()
$$;

create or replace function public.nexum_is_admin()
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (
    select 1 from profiles where id = auth.uid() and role = 'admin'
  )
$$;

create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;


-- =============================================================================
-- 1. COMPANIES
-- Master company records. One per service provider or customer organisation.
-- =============================================================================

create table if not exists public.companies (
  id           uuid        primary key default gen_random_uuid(),
  name         text        not null,
  company_type text        check (company_type in ('Service Provider', 'Customer', 'Admin', 'Other')),
  email        text,
  phone        text,
  address      text,
  country      text        default 'Malaysia',
  currency     text        default 'RM',
  status       text        default 'Active' check (status in ('Active', 'Inactive', 'Suspended')),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index if not exists idx_companies_status on public.companies (status);

alter table public.companies enable row level security;

drop trigger if exists companies_updated_at on public.companies;
create trigger companies_updated_at
  before update on public.companies
  for each row execute function public.set_updated_at();


-- =============================================================================
-- 2. PROFILES (extends auth.users)
-- One profile per authenticated user. Roles: admin | service_provider | customer
-- =============================================================================

create table if not exists public.profiles (
  id           uuid        primary key references auth.users(id) on delete cascade,
  full_name    text,
  email        text,
  role         text        not null default 'customer'
                           check (role in ('admin', 'service_provider', 'customer')),
  company_id   uuid        references public.companies(id) on delete set null,
  status       text        default 'Active' check (status in ('Active', 'Inactive', 'Suspended')),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index if not exists idx_profiles_company_id on public.profiles (company_id);
create index if not exists idx_profiles_role        on public.profiles (role);

alter table public.profiles enable row level security;


-- =============================================================================
-- 3. SECURED_JOBS
-- Core job record — represents one logistics/trade job under Nexum workflow.
-- =============================================================================

create table if not exists public.secured_jobs (
  id                          uuid        primary key default gen_random_uuid(),
  job_reference               text        not null unique,
  service_provider            text,
  service_provider_company_id uuid        references public.companies(id) on delete set null,
  customer                    text,
  customer_company_id         uuid        references public.companies(id) on delete set null,
  customer_email              text,

  -- Job details
  service_type                text,
  service_description         text,
  route                       text,
  cargo_description           text,
  incoterm                    text,
  hs_code                     text,

  -- Financial
  job_value                   numeric     default 0,
  currency                    text        not null default 'RM',
  required_deposit            numeric     default 0,
  payment_terms               text,

  -- Cargo value (NOT auto-secured — admin must explicitly opt in)
  cargo_value_amount          numeric,
  cargo_value_currency        text,
  cargo_value_base_amount     numeric,
  cargo_value_base_currency   text,

  -- Fee components
  logistics_fee_amount        numeric,
  logistics_fee_currency      text,
  duty_tax_amount             numeric,
  duty_tax_currency           text,
  insurance_cost_amount       numeric,
  insurance_cost_currency     text,
  additional_charges_amount   numeric,
  additional_charges_currency text,

  -- Total secured amounts (calculated, not auto)
  total_secured_amount        numeric     default 0,
  total_secured_currency      text        default 'RM',
  total_secured_base_amount   numeric,
  payment_scope_note          text,
  secured_amount_note         text,

  -- Scope flags — which components are under Nexum workflow
  secure_logistics_fee          boolean   default true,
  secure_cargo_supplier_payment boolean   default false,
  secure_duty_tax               boolean   default false,
  secure_insurance              boolean   default false,
  secure_additional_charges     boolean   default false,

  -- Status
  job_status                  text        not null default 'Awaiting Customer Acceptance'
                              check (job_status in (
                                'Awaiting Customer Acceptance',
                                'Awaiting Deposit',
                                'Awaiting Deposit Confirmation',
                                'Ready for Execution',
                                'In Progress',
                                'Delivered',
                                'Awaiting Customer Confirmation',
                                'Completed',
                                'Disputed',
                                'Cancelled'
                              )),
  payment_status              text        not null default 'Payment Pending'
                              check (payment_status in (
                                'Payment Pending',
                                'Deposit Proof Uploaded',
                                'Deposit Confirmed',
                                'Balance Pending',
                                'Balance Proof Uploaded',
                                'Payment Proof Uploaded',
                                'Payment Secured',
                                'Fully Paid',
                                'Disputed',
                                'Refund Pending'
                              )),
  current_milestone           text        default 'Job Created',
  risk_level                  text        default 'Low' check (risk_level in ('Low', 'Medium', 'High', 'Critical')),

  -- Invite
  invite_token                text,
  invite_token_expires_at     timestamptz,
  customer_accepted_at        timestamptz,
  customer_accepted_by        uuid        references auth.users(id) on delete set null,

  -- POD / Confirmation
  pod_uploaded_at             timestamptz,
  pod_uploaded_by             uuid        references auth.users(id) on delete set null,
  customer_confirmed_at       timestamptz,
  customer_confirmed_by       uuid        references auth.users(id) on delete set null,
  auto_confirm_at             timestamptz,

  -- Admin
  created_by                  uuid        references auth.users(id) on delete set null,
  created_at                  timestamptz not null default now(),
  updated_at                  timestamptz not null default now()
);

create index if not exists idx_secured_jobs_job_reference             on public.secured_jobs (job_reference);
create index if not exists idx_secured_jobs_service_provider_company  on public.secured_jobs (service_provider_company_id);
create index if not exists idx_secured_jobs_customer_company          on public.secured_jobs (customer_company_id);
create index if not exists idx_secured_jobs_job_status                on public.secured_jobs (job_status);
create index if not exists idx_secured_jobs_payment_status            on public.secured_jobs (payment_status);
create index if not exists idx_secured_jobs_created_at                on public.secured_jobs (created_at desc);

alter table public.secured_jobs enable row level security;

drop trigger if exists secured_jobs_updated_at on public.secured_jobs;
create trigger secured_jobs_updated_at
  before update on public.secured_jobs
  for each row execute function public.set_updated_at();


-- =============================================================================
-- 4. DOCUMENTS
-- File records for uploaded documents (payment proofs, PODs, BLs, etc.)
-- =============================================================================

create table if not exists public.documents (
  id              uuid        primary key default gen_random_uuid(),
  job_reference   text        not null,
  company_id      uuid        references public.companies(id) on delete set null,
  document_type   text        not null
                  check (document_type in (
                    'Payment Proof', 'Proof of Delivery', 'Bill of Lading',
                    'Commercial Invoice', 'Packing List', 'Certificate of Origin',
                    'Customs Declaration', 'Insurance Certificate',
                    'Delivery Order', 'Other'
                  )),
  file_name       text,
  file_url        text,
  file_size_bytes bigint,
  mime_type       text,
  is_verified     boolean     default false,
  verified_by     uuid        references auth.users(id) on delete set null,
  verified_at     timestamptz,
  uploaded_by     uuid        references auth.users(id) on delete set null,
  upload_note     text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists idx_documents_job_reference  on public.documents (job_reference);
create index if not exists idx_documents_document_type  on public.documents (document_type);
create index if not exists idx_documents_company_id     on public.documents (company_id);

alter table public.documents enable row level security;

drop trigger if exists documents_updated_at on public.documents;
create trigger documents_updated_at
  before update on public.documents
  for each row execute function public.set_updated_at();


-- =============================================================================
-- 5. PAYMENT_PROOF_UPLOADS
-- Explicit tracking of payment proof upload events (linked to documents).
-- =============================================================================

create table if not exists public.payment_proof_uploads (
  id                    uuid        primary key default gen_random_uuid(),
  job_reference         text        not null,
  company_id            uuid        references public.companies(id) on delete set null,
  document_id           uuid        references public.documents(id) on delete set null,
  payment_obligation_id uuid        references public.payment_obligations(id) on delete set null,
  upload_status         text        not null default 'Pending Review'
                        check (upload_status in (
                          'Pending Review', 'Under Review', 'Verified',
                          'Rejected', 'Requires Reupload'
                        )),
  payment_amount_claimed    numeric,
  payment_currency_claimed  text,
  payment_date_claimed      date,
  uploaded_by           uuid        references auth.users(id) on delete set null,
  reviewed_by           uuid        references auth.users(id) on delete set null,
  reviewed_at           timestamptz,
  rejection_reason      text,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

create index if not exists idx_payment_proof_uploads_job_reference on public.payment_proof_uploads (job_reference);
create index if not exists idx_payment_proof_uploads_status        on public.payment_proof_uploads (upload_status);

alter table public.payment_proof_uploads enable row level security;

drop trigger if exists payment_proof_uploads_updated_at on public.payment_proof_uploads;
create trigger payment_proof_uploads_updated_at
  before update on public.payment_proof_uploads
  for each row execute function public.set_updated_at();


-- =============================================================================
-- 6. DELIVERY_CONFIRMATIONS
-- Records customer confirmation of delivery receipt.
-- =============================================================================

create table if not exists public.delivery_confirmations (
  id                   uuid        primary key default gen_random_uuid(),
  job_reference        text        not null unique,
  company_id           uuid        references public.companies(id) on delete set null,
  confirmation_status  text        not null default 'Pending'
                       check (confirmation_status in (
                         'Pending', 'Confirmed', 'Auto-Confirmed',
                         'Disputed', 'Overridden by Admin'
                       )),
  confirmed_by         uuid        references auth.users(id) on delete set null,
  confirmed_at         timestamptz,
  auto_confirm_at      timestamptz,
  confirmation_note    text,
  dispute_raised_at    timestamptz,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

create index if not exists idx_delivery_confirmations_job_reference on public.delivery_confirmations (job_reference);
create index if not exists idx_delivery_confirmations_status        on public.delivery_confirmations (confirmation_status);

alter table public.delivery_confirmations enable row level security;

drop trigger if exists delivery_confirmations_updated_at on public.delivery_confirmations;
create trigger delivery_confirmations_updated_at
  before update on public.delivery_confirmations
  for each row execute function public.set_updated_at();


-- =============================================================================
-- 7. JOB_TERMS_SNAPSHOTS
-- Immutable snapshot of job terms at acceptance time.
-- =============================================================================

create table if not exists public.job_terms_snapshots (
  id              uuid        primary key default gen_random_uuid(),
  job_reference   text        not null,
  company_id      uuid        references public.companies(id) on delete set null,
  snapshot_data   jsonb       not null default '{}'::jsonb,
  snapshot_type   text        default 'Customer Acceptance',
  created_by      uuid        references auth.users(id) on delete set null,
  created_at      timestamptz not null default now()
);

create index if not exists idx_job_terms_snapshots_job_reference on public.job_terms_snapshots (job_reference);

alter table public.job_terms_snapshots enable row level security;


-- =============================================================================
-- 8. AUDIT_LOGS
-- Append-only audit trail. No updates or deletes (service role only).
-- =============================================================================

create table if not exists public.audit_logs (
  id            uuid        primary key default gen_random_uuid(),
  job_reference text,
  actor_id      uuid        references auth.users(id) on delete set null,
  actor_role    text,
  actor_name    text,
  action        text        not null,
  description   text,
  metadata      jsonb       default '{}'::jsonb,
  created_at    timestamptz not null default now()
);

create index if not exists idx_audit_logs_job_reference on public.audit_logs (job_reference);
create index if not exists idx_audit_logs_actor_id      on public.audit_logs (actor_id);
create index if not exists idx_audit_logs_action        on public.audit_logs (action);
create index if not exists idx_audit_logs_created_at    on public.audit_logs (created_at desc);

alter table public.audit_logs enable row level security;


-- =============================================================================
-- 9. EVIDENCE_PACKS
-- Generated evidence packs for dispute resolution / compliance.
-- =============================================================================

create table if not exists public.evidence_packs (
  id              uuid        primary key default gen_random_uuid(),
  job_reference   text        not null,
  company_id      uuid        references public.companies(id) on delete set null,
  pack_status     text        not null default 'Draft'
                  check (pack_status in ('Draft', 'Generating', 'Ready', 'Failed', 'Archived')),
  pack_url        text,
  pack_hash       text,
  generated_at    timestamptz,
  generated_by    uuid        references auth.users(id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists idx_evidence_packs_job_reference on public.evidence_packs (job_reference);

alter table public.evidence_packs enable row level security;

drop trigger if exists evidence_packs_updated_at on public.evidence_packs;
create trigger evidence_packs_updated_at
  before update on public.evidence_packs
  for each row execute function public.set_updated_at();


-- =============================================================================
-- 10. EVIDENCE_PACK_ITEMS
-- Individual document/data items within an evidence pack.
-- =============================================================================

create table if not exists public.evidence_pack_items (
  id                uuid        primary key default gen_random_uuid(),
  evidence_pack_id  uuid        not null references public.evidence_packs(id) on delete cascade,
  item_type         text,
  document_id       uuid        references public.documents(id) on delete set null,
  item_label        text,
  item_url          text,
  item_hash         text,
  created_at        timestamptz not null default now()
);

create index if not exists idx_evidence_pack_items_pack_id on public.evidence_pack_items (evidence_pack_id);

alter table public.evidence_pack_items enable row level security;


-- =============================================================================
-- 11. NOTIFICATIONS
-- In-app notifications for all roles.
-- =============================================================================

create table if not exists public.notifications (
  id                    uuid        primary key default gen_random_uuid(),
  recipient_user_id     uuid        references auth.users(id) on delete cascade,
  recipient_role        text,
  recipient_company_id  uuid        references public.companies(id) on delete set null,
  job_reference         text,
  notification_type     text,
  title                 text        not null,
  body                  text,
  is_read               boolean     not null default false,
  action_url            text,
  created_at            timestamptz not null default now()
);

create index if not exists idx_notifications_recipient_user_id     on public.notifications (recipient_user_id);
create index if not exists idx_notifications_recipient_role_company on public.notifications (recipient_role, recipient_company_id);
create index if not exists idx_notifications_is_read               on public.notifications (is_read) where not is_read;
create index if not exists idx_notifications_created_at            on public.notifications (created_at desc);

alter table public.notifications enable row level security;


-- =============================================================================
-- 12. WORKFLOW_TASKS
-- Actionable tasks surfaced to roles in the UI.
-- =============================================================================

create table if not exists public.workflow_tasks (
  id            uuid        primary key default gen_random_uuid(),
  job_reference text,
  company_id    uuid        references public.companies(id) on delete set null,
  task_type     text        not null,
  task_status   text        not null default 'Pending'
                check (task_status in ('Pending', 'In Progress', 'Completed', 'Dismissed', 'Overdue')),
  assigned_role text        not null,
  title         text        not null,
  description   text,
  due_at        timestamptz,
  completed_at  timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists idx_workflow_tasks_job_reference  on public.workflow_tasks (job_reference);
create index if not exists idx_workflow_tasks_assigned_role  on public.workflow_tasks (assigned_role);
create index if not exists idx_workflow_tasks_company_id     on public.workflow_tasks (company_id);
create index if not exists idx_workflow_tasks_task_status    on public.workflow_tasks (task_status);

alter table public.workflow_tasks enable row level security;

drop trigger if exists workflow_tasks_updated_at on public.workflow_tasks;
create trigger workflow_tasks_updated_at
  before update on public.workflow_tasks
  for each row execute function public.set_updated_at();


-- =============================================================================
-- 13. TERMS_ACCEPTANCES
-- Records that customers/providers have accepted terms before proceeding.
-- =============================================================================

create table if not exists public.terms_acceptances (
  id            uuid        primary key default gen_random_uuid(),
  job_reference text,
  user_id       uuid        references auth.users(id) on delete set null,
  company_id    uuid        references public.companies(id) on delete set null,
  terms_type    text        not null default 'Job Acceptance'
                check (terms_type in (
                  'Job Acceptance', 'Provider Platform Terms',
                  'Pilot Terms', 'Financing Simulation Disclaimer', 'Other'
                )),
  terms_version text,
  accepted_at   timestamptz not null default now(),
  ip_address    text,
  user_agent    text
);

create index if not exists idx_terms_acceptances_job_reference on public.terms_acceptances (job_reference);
create index if not exists idx_terms_acceptances_user_id       on public.terms_acceptances (user_id);

alter table public.terms_acceptances enable row level security;


-- =============================================================================
-- 14. DISPUTES
-- Customer-raised disputes that block release.
-- NOTE: The app may also use dispute_cases — check which table is in use
--       before applying this migration if you have existing data.
-- =============================================================================

create table if not exists public.disputes (
  id               uuid        primary key default gen_random_uuid(),
  job_reference    text        not null,
  company_id       uuid        references public.companies(id) on delete set null,
  dispute_status   text        not null default 'Open'
                   check (dispute_status in (
                     'Open', 'Under Review', 'Resolved — Release Approved',
                     'Resolved — Refund', 'Resolved — Cancelled', 'Withdrawn'
                   )),
  dispute_reason   text,
  dispute_category text
                   check (dispute_category in (
                     'Delivery Dispute', 'Quality Issue', 'Short Delivery',
                     'Wrong Goods', 'Damaged Goods', 'Payment Dispute', 'Other'
                   )),
  raised_by        uuid        references auth.users(id) on delete set null,
  raised_at        timestamptz not null default now(),
  reviewed_by      uuid        references auth.users(id) on delete set null,
  reviewed_at      timestamptz,
  resolved_at      timestamptz,
  resolution_note  text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create index if not exists idx_disputes_job_reference  on public.disputes (job_reference);
create index if not exists idx_disputes_dispute_status on public.disputes (dispute_status);
create index if not exists idx_disputes_company_id     on public.disputes (company_id);

alter table public.disputes enable row level security;

drop trigger if exists disputes_updated_at on public.disputes;
create trigger disputes_updated_at
  before update on public.disputes
  for each row execute function public.set_updated_at();


-- =============================================================================
-- 15. MEMBERSHIPS
-- Company-level membership/subscription records.
-- =============================================================================

create table if not exists public.memberships (
  id            uuid        primary key default gen_random_uuid(),
  company_id    uuid        not null references public.companies(id) on delete cascade,
  plan_type     text        default 'Pilot',
  status        text        not null default 'Active'
                check (status in ('Active', 'Inactive', 'Suspended', 'Expired')),
  annual_fee    numeric,
  used_jobs     integer     not null default 0,
  max_jobs      integer,
  currency      text        default 'RM',
  started_at    timestamptz default now(),
  expires_at    timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists idx_memberships_company_id on public.memberships (company_id);

alter table public.memberships enable row level security;

drop trigger if exists memberships_updated_at on public.memberships;
create trigger memberships_updated_at
  before update on public.memberships
  for each row execute function public.set_updated_at();


-- =============================================================================
-- 16. GO_LIVE_READINESS_ITEMS
-- Operational checklist for production deployment.
-- =============================================================================

create table if not exists public.go_live_readiness_items (
  id              uuid        primary key default gen_random_uuid(),
  category        text        not null,
  item_name       text        not null,
  description     text,
  status          text        not null
                  check (status in ('Pending','In Progress','Passed','Failed','Not Applicable'))
                  default 'Pending',
  priority        text        not null
                  check (priority in ('Low','Medium','High','Critical'))
                  default 'Medium',
  owner_name      text,
  evidence_note   text,
  evidence_url    text,
  last_checked_at timestamptz,
  checked_by      uuid        references auth.users(id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

alter table public.go_live_readiness_items enable row level security;


-- =============================================================================
-- 17. MISSING COLUMN PATCHES
-- Safe ALTER TABLE ADD COLUMN IF NOT EXISTS for columns that may have been
-- added in piecemeal migrations but might be missing in fresh setups.
-- =============================================================================

-- secured_jobs extras
alter table public.secured_jobs
  add column if not exists payment_purpose            text,
  add column if not exists expected_completion_date   date,
  add column if not exists actual_completion_date     date,
  add column if not exists provider_notes             text,
  add column if not exists admin_notes                text;

-- documents extras
alter table public.documents
  add column if not exists storage_path               text,
  add column if not exists storage_bucket             text default 'job-documents';

-- audit_logs extras
alter table public.audit_logs
  add column if not exists company_id                 uuid references public.companies(id) on delete set null,
  add column if not exists ip_address                 text;

-- notifications extras
alter table public.notifications
  add column if not exists dismissed_at               timestamptz;

-- workflow_tasks extras
alter table public.workflow_tasks
  add column if not exists priority                   text default 'Medium';


-- =============================================================================
-- END OF FILE
-- =============================================================================
-- After running this file, apply:
--   002_rls_supplement.sql
--   rls_hardening_v1.sql (if not already applied)
--   payment_holding_v1.sql
--   payment_ledger_v1.sql
--   release_settlements_v1.sql
--   claim_reserves_v1.sql
--   go_live_readiness_v1.sql (seeds checklist data)
-- =============================================================================
