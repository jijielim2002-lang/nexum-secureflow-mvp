-- ─── Operating SOP / Internal Control Matrix v1 ──────────────────────────────
-- Defines required checks, maker-checker rules, approval roles, evidence
-- requirements, and audit requirements for sensitive Nexum workflows.
--
-- This is internal control and SOP visibility only.
-- Does NOT connect external compliance/legal systems.
-- Does NOT auto-release money.

-- ── Tables ────────────────────────────────────────────────────────────────────

create table if not exists public.internal_control_rules (
  id                          uuid        primary key default gen_random_uuid(),
  control_name                text        not null,
  workflow_area               text        check (workflow_area in (
    'Job Creation',
    'Quotation',
    'RFQ',
    'Payment Holding',
    'Payment Reconciliation',
    'Release Approval',
    'Settlement Reconciliation',
    'Delivery Confirmation',
    'Dispute',
    'Liability Review',
    'Claim Reserve',
    'Supplier Payment Protection',
    'Supplier Milestone Release',
    'Procurement Readiness',
    'Credit Pack',
    'Financing Simulation',
    'Accounting Export',
    'Other'
  )),
  trigger_event               text,
  required_evidence           text,
  maker_role                  text,
  checker_role                text,
  approver_role               text,
  requires_dual_approval      boolean     default false,
  same_user_restricted        boolean     default true,
  requires_audit_log          boolean     default true,
  requires_terms_acceptance   boolean     default false,
  requires_compliance_check   boolean     default false,
  requires_dispute_check      boolean     default false,
  requires_reconciliation     boolean     default false,
  is_active                   boolean     default true,
  control_note                text,
  created_at                  timestamptz default now(),
  updated_at                  timestamptz default now()
);

create table if not exists public.internal_control_checks (
  id                  uuid        primary key default gen_random_uuid(),
  job_reference       text,
  procurement_reference text,
  control_rule_id     uuid        references public.internal_control_rules(id),
  workflow_area       text,
  check_status        text        check (check_status in (
    'Not Checked',
    'Passed',
    'Failed',
    'Warning',
    'Overridden'
  )) default 'Not Checked',
  checked_by          uuid        references auth.users(id),
  checked_at          timestamptz,
  failure_reason      text,
  override_reason     text,
  evidence_summary    text,
  created_at          timestamptz default now(),
  updated_at          timestamptz default now()
);

create index if not exists icc_job_reference_idx          on public.internal_control_checks (job_reference);
create index if not exists icc_procurement_reference_idx  on public.internal_control_checks (procurement_reference);
create index if not exists icc_status_idx                 on public.internal_control_checks (check_status);
create index if not exists icc_workflow_area_idx          on public.internal_control_checks (workflow_area);
create index if not exists icc_control_rule_id_idx        on public.internal_control_checks (control_rule_id);
create index if not exists icr_workflow_area_idx          on public.internal_control_rules (workflow_area);

-- ── RLS ───────────────────────────────────────────────────────────────────────

alter table public.internal_control_rules  enable row level security;
alter table public.internal_control_checks enable row level security;

-- Control rules: admin full access; others read only
create policy "icr_select_all_authenticated"
  on public.internal_control_rules for select
  to authenticated using (true);

-- Control checks: admin full access; others see own job checks
create policy "icc_select_admin"
  on public.internal_control_checks for select
  to authenticated
  using (
    exists (
      select 1 from public.profiles
      where id = auth.uid() and role = 'admin'
    )
  );

create policy "icc_select_own_job"
  on public.internal_control_checks for select
  to authenticated
  using (
    job_reference in (
      select job_reference from public.secured_jobs
      where customer_company_id = (
        select company_id from public.profiles where id = auth.uid()
      )
    )
  );

-- INSERT/UPDATE/DELETE: service role only via API routes

-- ── Seed control rules ────────────────────────────────────────────────────────

insert into public.internal_control_rules
  (control_name, workflow_area, trigger_event, required_evidence,
   maker_role, checker_role, approver_role,
   requires_dual_approval, same_user_restricted, requires_audit_log,
   requires_reconciliation, requires_compliance_check, requires_dispute_check,
   control_note)
values
  (
    'Payment Secured Control',
    'Payment Reconciliation',
    'payment_status_change_to_secured',
    'Payment proof document uploaded; holding account or bank reconciliation matched and verified; payment amount matches obligation.',
    'admin',
    'admin',
    null,
    false,
    true,
    true,
    true,
    false,
    false,
    'Payment cannot be marked as Secured without payment proof and reconciliation confirmation. Maker and checker must be different admin users.'
  ),
  (
    'Release Approval Control',
    'Release Approval',
    'release_instruction_approval',
    'Delivery confirmed or auto-confirmed; no open dispute; payout profile verified; net settlement calculated and not disputed; release instruction created by maker and approved by different admin (checker).',
    'admin',
    'admin',
    'admin',
    true,
    true,
    true,
    false,
    false,
    true,
    'Dual approval required for all release instructions. Same user cannot be maker and checker. Open disputes block release. Admin override requires written justification.'
  ),
  (
    'Settlement Reconciliation Control',
    'Settlement Reconciliation',
    'release_settlement_creation',
    'Release instruction approved by two separate admins; release reference number recorded; bank transaction reference matched; settlement amount reconciled against release instruction.',
    'admin',
    'admin',
    null,
    false,
    true,
    true,
    true,
    false,
    false,
    'Settlement reconciliation must match the approved release instruction. Bank reference required. Same user cannot reconcile and verify.'
  ),
  (
    'Supplier Milestone Release Control',
    'Supplier Milestone Release',
    'supplier_milestone_release_approval',
    'Milestone evidence uploaded and verified by admin; no High/Critical procurement discrepancy open on this supplier; supplier not blocked or on watchlist; associated payment is Secured.',
    'admin',
    'admin',
    null,
    false,
    true,
    true,
    false,
    true,
    false,
    'Supplier milestone payment cannot be released without verified evidence and clean discrepancy check. Supplier risk status is reviewed before release.'
  ),
  (
    'Claim Reserve Control',
    'Claim Reserve',
    'claim_reserve_approval',
    'Active dispute or liability review on record; claimed amount specified; reserve amount does not exceed job value; admin approval with written justification.',
    'admin',
    null,
    'admin',
    false,
    false,
    true,
    false,
    false,
    false,
    'Claim reserves must reference an active dispute or liability review. Admin must provide written justification. Reserve reduces net release eligible amount.'
  ),
  (
    'Dispute Resolution Control',
    'Dispute',
    'dispute_status_change_to_resolved',
    'Customer evidence uploaded; provider response submitted; admin review note recorded; resolution type and amount confirmed.',
    'admin',
    null,
    'admin',
    false,
    false,
    true,
    false,
    false,
    false,
    'Disputes cannot be marked Resolved without all party evidence reviewed and admin resolution note. Resolving a dispute may unblock balance release.'
  ),
  (
    'Procurement Readiness Control',
    'Procurement Readiness',
    'procurement_advance_release',
    'PO and PI verified on record; supplier profile exists and is not blocked; no Critical procurement discrepancy open; HS Code and Incoterm reviewed and confirmed.',
    'admin',
    'admin',
    null,
    false,
    true,
    true,
    false,
    true,
    false,
    'Advance payment cannot be released to supplier without procurement readiness gate passing. Critical discrepancies must be resolved or overridden with reason before advance release.'
  ),
  (
    'Credit Pack Control',
    'Credit Pack',
    'credit_pack_assessment_completion',
    'Capital readiness assessment completed; company intelligence profile exists; payment history evidence reviewed; disclaimer acknowledged by admin.',
    'admin',
    'admin',
    null,
    false,
    true,
    true,
    false,
    true,
    false,
    'Credit pack assessment is advisory only. It does not constitute credit approval. Dual admin review required before sharing assessment with customer.'
  )
on conflict do nothing;
