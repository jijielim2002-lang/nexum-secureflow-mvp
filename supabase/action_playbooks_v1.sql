-- ─── Exception-to-Action Playbook v1 ─────────────────────────────────────────
-- Playbook templates + per-job/procurement recommendations.
-- Detection is advisory. Admin must review before any action is taken.
-- Do NOT auto-resolve blockers. Do NOT auto-release payment.

-- ── Tables ────────────────────────────────────────────────────────────────────

create table if not exists public.action_playbooks (
  id                uuid        primary key default gen_random_uuid(),
  playbook_name     text        not null,
  trigger_type      text        check (trigger_type in (
    'Procurement Gate Blocked',
    'Payment Blocked',
    'Supplier Milestone Blocked',
    'Shipment Delay',
    'Document Missing',
    'Discrepancy Detected',
    'Delivery Dispute',
    'Liability Review',
    'Claim Reserve',
    'Release Blocked',
    'Customs / HS Code Issue',
    'Other'
  )),
  condition_key     text,
  recommended_action text,
  assigned_role     text,
  priority          text        check (priority in ('Low', 'Medium', 'High', 'Critical')) default 'Medium',
  due_after_hours   integer     default 24,
  escalation_note   text,
  is_active         boolean     default true,
  created_at        timestamptz default now(),
  updated_at        timestamptz default now()
);

create table if not exists public.action_recommendations (
  id                      uuid        primary key default gen_random_uuid(),
  job_reference           text,
  procurement_reference   text,
  source_type             text,
  source_id               uuid,
  playbook_id             uuid        references public.action_playbooks(id),
  recommendation_status   text        check (recommendation_status in (
    'Suggested',
    'Accepted',
    'Task Created',
    'Dismissed',
    'Completed',
    'Escalated'
  )) default 'Suggested',
  recommended_action      text,
  assigned_role           text,
  priority                text        check (priority in ('Low', 'Medium', 'High', 'Critical')) default 'Medium',
  due_at                  timestamptz,
  rationale               text,
  -- Review fields
  accepted_by             uuid        references auth.users(id),
  accepted_at             timestamptz,
  task_id                 uuid,         -- workflow_tasks.id once created
  dismissed_reason        text,
  escalated_note          text,
  completed_note          text,
  -- Timestamps
  created_at              timestamptz default now(),
  updated_at              timestamptz default now()
);

create index if not exists ar_job_reference_idx          on public.action_recommendations (job_reference);
create index if not exists ar_procurement_reference_idx  on public.action_recommendations (procurement_reference);
create index if not exists ar_status_idx                 on public.action_recommendations (recommendation_status);
create index if not exists ar_priority_idx               on public.action_recommendations (priority);
create index if not exists ar_playbook_id_idx            on public.action_recommendations (playbook_id);
create index if not exists ap_trigger_type_idx           on public.action_playbooks (trigger_type);

-- ── RLS ───────────────────────────────────────────────────────────────────────

alter table public.action_playbooks       enable row level security;
alter table public.action_recommendations enable row level security;

-- action_playbooks: all authenticated users can SELECT
create policy "action_playbooks_select"
  on public.action_playbooks for select
  to authenticated using (true);

-- action_recommendations: admin sees all; others see own role
create policy "action_recs_select_admin"
  on public.action_recommendations for select
  to authenticated
  using (
    exists (
      select 1 from public.profiles
      where id = auth.uid() and role = 'admin'
    )
  );

create policy "action_recs_select_own_role"
  on public.action_recommendations for select
  to authenticated
  using (
    assigned_role = (
      select role from public.profiles where id = auth.uid()
    )
  );

-- INSERT/UPDATE/DELETE: service role only (via API routes)

-- ── Seed data: 10 active playbooks ───────────────────────────────────────────

insert into public.action_playbooks
  (playbook_name, trigger_type, condition_key, recommended_action, assigned_role, priority, due_after_hours, escalation_note)
values
  (
    'Missing HS Code',
    'Customs / HS Code Issue',
    'hs_code_missing',
    'Request HS Code confirmation from supplier/customer and upload supporting invoice or customs classification.',
    'customer',
    'High',
    24,
    'If HS Code not confirmed within 24h, escalate to admin for customs review.'
  ),
  (
    'DDP Missing Duty/Tax Estimate',
    'Procurement Gate Blocked',
    'ddp_duty_tax_missing',
    'Request duty/tax estimate and permit requirement review before release.',
    'admin',
    'High',
    24,
    'DDP shipments cannot proceed without duty/tax estimate. Block payment release until resolved.'
  ),
  (
    'Payment Proof Uploaded but Not Reconciled',
    'Payment Blocked',
    'payment_proof_not_reconciled',
    'Reconcile payment proof against holding account/bank statement.',
    'admin',
    'High',
    24,
    'Do not release balance or advance until payment proof is fully reconciled.'
  ),
  (
    'Supplier Milestone Evidence Missing',
    'Supplier Milestone Blocked',
    'milestone_evidence_missing',
    'Request milestone evidence from buyer/supplier before release eligibility.',
    'customer',
    'High',
    48,
    'Release milestone payment is blocked until evidence is uploaded and verified.'
  ),
  (
    'BL/AWB Missing Before Shipment Release',
    'Document Missing',
    'bl_awb_missing',
    'Request BL/AWB or shipment evidence before shipment release.',
    'service_provider',
    'High',
    24,
    'Shipment cannot be released without BL/AWB. Escalate to admin if not received within 24h.'
  ),
  (
    'Shipment Delayed Beyond ETA',
    'Shipment Delay',
    'shipment_delayed',
    'Create shipment delay exception and prepare rescue plan.',
    'admin',
    'High',
    12,
    'Notify customer and provider of delay. Prepare rescue plan if delay exceeds 3 days.'
  ),
  (
    'Customer Delivery Dispute',
    'Delivery Dispute',
    'delivery_dispute_open',
    'Open dispute review, request evidence from customer and provider, block release pending review.',
    'admin',
    'Critical',
    6,
    'Dispute blocks all balance payment release. Do not release until admin resolves dispute.'
  ),
  (
    'Liability Review Blocking Release',
    'Liability Review',
    'liability_review_blocking',
    'Request liability evidence and insurance/policy information before release decision.',
    'admin',
    'Critical',
    6,
    'Release is blocked pending liability review outcome. No payment release without admin approval.'
  ),
  (
    'Active Claim Reserve',
    'Claim Reserve',
    'claim_reserve_active',
    'Review claim reserve and net settlement before approving release.',
    'admin',
    'High',
    24,
    'Active claim reserve reduces net release eligible amount. Review and approve net settlement first.'
  ),
  (
    'Procurement Discrepancy High/Critical',
    'Discrepancy Detected',
    'discrepancy_high_critical',
    'Review conflicting document fields and resolve/override discrepancy before release.',
    'admin',
    'High',
    24,
    'Do not release advance or payments on affected procurement orders until discrepancy is resolved or overridden.'
  )
on conflict do nothing;
