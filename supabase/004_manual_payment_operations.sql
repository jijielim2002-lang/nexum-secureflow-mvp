-- =============================================================================
-- NEXUM SECUREFLOW — 004_manual_payment_operations.sql
-- Manual Payment Operating Model & SOP — Phase 3
--
-- SAFE TO RE-RUN: Uses CREATE TABLE IF NOT EXISTS, ADD COLUMN IF NOT EXISTS,
-- DROP POLICY IF EXISTS before CREATE POLICY, and idempotent seed block.
--
-- CREATES:
--   1. manual_payment_operations
--   2. payment_operating_sop_items
--   3. RLS policies for both tables
--   4. Indexes
--   5. Seeded SOP steps (A–F)
--   6. Go-live readiness items for Phase 3
-- =============================================================================

-- =============================================================================
-- 1. MANUAL_PAYMENT_OPERATIONS
-- Records every manual payment lifecycle event for a job.
-- All money movement is manual — no bank API connected.
-- =============================================================================

create table if not exists public.manual_payment_operations (
  id                        uuid        primary key default gen_random_uuid(),
  operation_reference       text        unique not null,
  job_reference             text        not null,
  company_id                uuid        references public.companies(id),
  payer_company_id          uuid        references public.companies(id),
  payee_company_id          uuid        references public.companies(id),
  payment_obligation_id     uuid        references public.payment_obligations(id),
  held_payment_id           uuid        references public.held_payments(id),

  operation_type            text        check (operation_type in (
                              'Customer Collection',
                              'Payment Verification',
                              'Payment Secured',
                              'Release Approval',
                              'Manual Payout',
                              'Settlement Reconciliation',
                              'Refund',
                              'Dispute Hold',
                              'Claim Reserve',
                              'Other'
                            )) not null,

  operation_status          text        check (operation_status in (
                              'Pending',
                              'In Review',
                              'Verified',
                              'Rejected',
                              'Secured',
                              'Approved for Release',
                              'Paid Out',
                              'Reconciled',
                              'On Hold',
                              'Disputed',
                              'Cancelled'
                            )) default 'Pending',

  amount                    numeric     not null,
  currency                  text        default 'RM',

  -- Payer bank details (customer → designated account)
  bank_account_name         text,
  bank_name                 text,
  bank_account_last4        text,

  payment_method            text        check (payment_method in (
                              'Manual Bank Transfer',
                              'DuitNow Transfer',
                              'DuitNow QR',
                              'FPX',
                              'Cheque',
                              'Cash Deposit',
                              'Other'
                            )) default 'Manual Bank Transfer',

  payment_reference         text,
  payer_reference           text,
  proof_file_url            text,
  bank_statement_reference  text,

  -- Verification fields (admin only)
  verified_by               uuid        references auth.users(id),
  verified_at               timestamptz,
  verification_note         text,

  -- Payout fields (finance/admin)
  payout_bank_name          text,
  payout_account_name       text,
  payout_account_last4      text,
  payout_reference          text,
  payout_processed_by       uuid        references auth.users(id),
  payout_processed_at       timestamptz,
  payout_note               text,

  -- Second approver (dual-control for payouts above threshold)
  second_approver_id        uuid        references auth.users(id),
  second_approved_at        timestamptz,
  second_approval_note      text,

  -- Reconciliation
  reconciliation_status     text        check (reconciliation_status in (
                              'Not Required',
                              'Pending',
                              'Matched',
                              'Mismatch',
                              'Exception',
                              'Reconciled'
                            )) default 'Pending',
  reconciliation_note       text,

  -- Risk flags
  risk_flag                 text        check (risk_flag in (
                              'None',
                              'Amount Mismatch',
                              'Currency Mismatch',
                              'Duplicate Reference',
                              'Unclear Proof',
                              'Third Party Payment',
                              'Late Payment',
                              'Suspicious',
                              'Other'
                            )) default 'None',

  -- Audit
  created_by                uuid        references auth.users(id),
  created_at                timestamptz default now(),
  updated_at                timestamptz default now()
);

-- updated_at trigger
drop trigger if exists trg_mpo_updated_at on public.manual_payment_operations;
create trigger trg_mpo_updated_at
  before update on public.manual_payment_operations
  for each row execute function public.set_updated_at();

-- =============================================================================
-- 2. PAYMENT_OPERATING_SOP_ITEMS
-- Standard Operating Procedure steps for manual payment operations.
-- Admin-curated. Reviewed before go-live.
-- =============================================================================

create table if not exists public.payment_operating_sop_items (
  id                uuid        primary key default gen_random_uuid(),
  sop_category      text        not null,
  step_number       integer     not null,
  step_name         text        not null,
  step_description  text,
  responsible_role  text        check (responsible_role in (
                      'Admin',
                      'Finance',
                      'Provider',
                      'Customer',
                      'System',
                      'Management'
                    )),
  control_check     text,
  required_evidence text,
  status            text        check (status in (
                      'Draft',
                      'Approved',
                      'Active',
                      'Needs Review',
                      'Disabled'
                    )) default 'Draft',
  created_at        timestamptz default now(),
  updated_at        timestamptz default now(),
  unique (sop_category, step_number)
);

-- updated_at trigger
drop trigger if exists trg_sop_updated_at on public.payment_operating_sop_items;
create trigger trg_sop_updated_at
  before update on public.payment_operating_sop_items
  for each row execute function public.set_updated_at();

-- =============================================================================
-- 3. INDEXES
-- =============================================================================

create index if not exists idx_mpo_job_reference
  on public.manual_payment_operations (job_reference);

create index if not exists idx_mpo_operation_type
  on public.manual_payment_operations (operation_type);

create index if not exists idx_mpo_operation_status
  on public.manual_payment_operations (operation_status);

create index if not exists idx_mpo_payer_company_id
  on public.manual_payment_operations (payer_company_id);

create index if not exists idx_mpo_payee_company_id
  on public.manual_payment_operations (payee_company_id);

create index if not exists idx_mpo_created_at
  on public.manual_payment_operations (created_at desc);

create index if not exists idx_sop_category
  on public.payment_operating_sop_items (sop_category, step_number);

-- =============================================================================
-- 4. ROW LEVEL SECURITY
-- manual_payment_operations: admin all, provider select own jobs, customer select own jobs
-- payment_operating_sop_items: admin all, authenticated select
-- =============================================================================

alter table public.manual_payment_operations      enable row level security;
alter table public.payment_operating_sop_items    enable row level security;

-- ── manual_payment_operations ────────────────────────────────────────────────

drop policy if exists "mpo_admin_all"           on public.manual_payment_operations;
drop policy if exists "mpo_provider_select"     on public.manual_payment_operations;
drop policy if exists "mpo_customer_select"     on public.manual_payment_operations;

-- Admin: full access
create policy "mpo_admin_all"
  on public.manual_payment_operations for all
  to authenticated
  using  (public.nexum_is_admin())
  with check (public.nexum_is_admin());

-- Provider: read only for their own jobs
create policy "mpo_provider_select"
  on public.manual_payment_operations for select
  to authenticated
  using (
    public.nexum_my_role() = 'service_provider'
    and exists (
      select 1 from public.secured_jobs sj
      where sj.job_reference = manual_payment_operations.job_reference
        and sj.service_provider_company_id = public.nexum_my_company_id()
    )
  );

-- Customer: read only for their own jobs (collection + verification status only)
create policy "mpo_customer_select"
  on public.manual_payment_operations for select
  to authenticated
  using (
    public.nexum_my_role() = 'customer'
    and exists (
      select 1 from public.secured_jobs sj
      where sj.job_reference = manual_payment_operations.job_reference
        and sj.customer_company_id = public.nexum_my_company_id()
    )
  );

-- ── payment_operating_sop_items ──────────────────────────────────────────────

drop policy if exists "sop_admin_all"            on public.payment_operating_sop_items;
drop policy if exists "sop_authenticated_select" on public.payment_operating_sop_items;

create policy "sop_admin_all"
  on public.payment_operating_sop_items for all
  to authenticated
  using  (public.nexum_is_admin())
  with check (public.nexum_is_admin());

-- Authenticated (provider/customer) can read active SOP steps for transparency
create policy "sop_authenticated_select"
  on public.payment_operating_sop_items for select
  to authenticated
  using (status in ('Approved', 'Active'));

-- =============================================================================
-- 5. SEED SOP ITEMS
-- Idempotent: skips if any rows exist for each category.
-- =============================================================================

do $seed$
begin

  -- A. Customer Collection SOP
  if not exists (
    select 1 from public.payment_operating_sop_items where sop_category = 'A. Customer Collection'
  ) then
    insert into public.payment_operating_sop_items
      (sop_category, step_number, step_name, step_description, responsible_role, control_check, required_evidence, status)
    values
      ('A. Customer Collection', 1,
       'Confirm job accepted by customer',
       'Verify that the customer has signed and accepted the job terms before generating payment instruction.',
       'Admin', 'Job status = Awaiting Deposit or Ready for Execution',
       'Job terms snapshot, customer acceptance timestamp', 'Draft'),
      ('A. Customer Collection', 2,
       'Confirm payment obligation generated',
       'System must have created a payment_obligations record for this job. Verify amount and currency match the accepted job value.',
       'System', 'payment_obligations record exists, status = Pending',
       'Payment obligation record', 'Draft'),
      ('A. Customer Collection', 3,
       'Send designated payment instructions',
       'Provide customer with: designated account name, bank name, account number, reference code (job_reference). '
       || 'Wording: "Please transfer the required amount to the designated payment account. Payment will be treated as secured only after Nexum verifies receipt."',
       'Admin', 'Payment instruction sent via notification or email',
       'Notification record or email confirmation', 'Draft'),
      ('A. Customer Collection', 4,
       'Customer transfers payment',
       'Customer makes manual bank transfer or DuitNow to designated account. Payment method and reference must match instruction.',
       'Customer', 'Transfer reference includes job_reference',
       'Bank transfer receipt from customer side', 'Draft'),
      ('A. Customer Collection', 5,
       'Customer uploads payment proof',
       'Customer uploads screenshot or PDF of transfer confirmation to payment-proofs storage bucket.',
       'Customer', 'payment_proof_uploads record exists',
       'Uploaded proof file URL', 'Draft'),
      ('A. Customer Collection', 6,
       'Admin checks amount, currency, reference, payer name',
       'Compare uploaded proof against: (a) obligation amount, (b) obligation currency, (c) job reference in transfer remarks, (d) payer company name.',
       'Admin', 'All 4 checks passed',
       'Verification note recording each check', 'Draft'),
      ('A. Customer Collection', 7,
       'Admin checks bank account receipt',
       'Admin verifies actual credit to designated bank account via manual bank statement check. Confirms bank_statement_reference.',
       'Admin', 'Bank statement shows matching credit',
       'Bank statement reference number', 'Draft'),
      ('A. Customer Collection', 8,
       'Admin marks payment verified',
       'Admin updates manual_payment_operations status to Verified and records bank_statement_reference and verification_note.',
       'Admin', 'operation_status = Verified, verified_by set',
       'Audit log entry: payment_proof_verified', 'Draft'),
      ('A. Customer Collection', 9,
       'System marks payment secured',
       'Admin action triggers: held_payment.holding_status = Payment Secured, job payment_status = Payment Secured. '
       || 'Wording shown to provider: "Payment secured means Nexum has verified receipt under the designated payment holding workflow."',
       'Admin', 'holding_status = Payment Secured',
       'Audit log entry: payment_marked_secured', 'Draft');
  end if;

  -- B. Payment Verification SOP
  if not exists (
    select 1 from public.payment_operating_sop_items where sop_category = 'B. Payment Verification'
  ) then
    insert into public.payment_operating_sop_items
      (sop_category, step_number, step_name, step_description, responsible_role, control_check, required_evidence, status)
    values
      ('B. Payment Verification', 1,
       'Compare payment proof to obligation amount',
       'Proof amount must exactly match payment_obligations.amount. Any mismatch → flag risk_flag = Amount Mismatch, do not verify.',
       'Admin', 'Amounts match to 2 decimal places', 'Proof screenshot + obligation record', 'Draft'),
      ('B. Payment Verification', 2,
       'Compare actual bank receipt to proof',
       'Admin checks own bank account statement for matching credit. If bank receipt is absent or amount differs → do not verify.',
       'Admin', 'Bank credit confirmed', 'Bank statement reference', 'Draft'),
      ('B. Payment Verification', 3,
       'Check payer company name',
       'Payer name on transfer must match customer company name in Nexum. Mismatch → risk_flag = Third Party Payment. Admin may request clarification.',
       'Admin', 'Payer name matches customer company', 'Customer company name vs bank transfer sender name', 'Draft'),
      ('B. Payment Verification', 4,
       'Check duplicate reference',
       'Search manual_payment_operations for same payment_reference. Duplicate → risk_flag = Duplicate Reference. Do not verify until resolved.',
       'Admin', 'No duplicate payment_reference exists', 'Query result', 'Draft'),
      ('B. Payment Verification', 5,
       'Check amount mismatch',
       'Flag risk_flag = Amount Mismatch if proof amount ≠ obligation amount. Record discrepancy in verification_note.',
       'Admin', 'Document mismatch clearly', 'Verification note', 'Draft'),
      ('B. Payment Verification', 6,
       'Check currency mismatch',
       'Flag risk_flag = Currency Mismatch if currency in proof differs from obligation currency (MYR). Do not verify across currencies.',
       'Admin', 'Currency matches obligation', 'Proof currency confirmed', 'Draft'),
      ('B. Payment Verification', 7,
       'Check third-party payment',
       'Flag risk_flag = Third Party Payment if payer account holder differs from customer. Reject or request explanation.',
       'Admin', 'Document third-party payer details', 'Explanation from customer if accepted', 'Draft'),
      ('B. Payment Verification', 8,
       'Approve, reject, or request clarification',
       'Decision: Verified (all checks pass) / Rejected (irreparable mismatch) / In Review (awaiting clarification from customer).',
       'Admin', 'Decision recorded in operation_status and verification_note', 'Audit log entry', 'Draft'),
      ('B. Payment Verification', 9,
       'Audit log created',
       'System records payment_proof_verified or payment_proof_rejected in audit_logs.',
       'System', 'audit_logs entry exists', 'Audit log record', 'Draft');
  end if;

  -- C. Release Approval SOP
  if not exists (
    select 1 from public.payment_operating_sop_items where sop_category = 'C. Release Approval'
  ) then
    insert into public.payment_operating_sop_items
      (sop_category, step_number, step_name, step_description, responsible_role, control_check, required_evidence, status)
    values
      ('C. Release Approval', 1,
       'Confirm payment secured',
       'held_payment.holding_status must be Payment Secured or Release Eligible. Do not proceed if Pending or Disputed.',
       'Admin', 'holding_status ∈ {Payment Secured, Release Eligible}', 'held_payment record', 'Draft'),
      ('C. Release Approval', 2,
       'Confirm POD uploaded',
       'Provider must have uploaded Proof of Delivery document to pod-documents bucket.',
       'Admin', 'POD file URL exists on secured_job', 'POD document URL', 'Draft'),
      ('C. Release Approval', 3,
       'Confirm customer acceptance or auto-confirm',
       'Customer confirmation received, OR dispute window expired (default 48h), OR admin waived.',
       'Admin', 'delivery_confirmations record OR dispute_window_expired_at < now()', 'Confirmation record or timestamp', 'Draft'),
      ('C. Release Approval', 4,
       'Check claim reserve',
       'Query claim_reserves for this job. If any active claim reserve exists, block release until resolved.',
       'Admin', 'No active claim reserves', 'claim_reserves query result', 'Draft'),
      ('C. Release Approval', 5,
       'Check admin release instruction',
       'Release instruction must be issued by authorised admin. Check release_instructions record.',
       'Admin', 'release_instructions record exists', 'Release instruction record', 'Draft'),
      ('C. Release Approval', 6,
       'Management review if above threshold',
       'If payout amount > RM 50,000 → require management/second approver sign-off before proceeding.',
       'Management', 'second_approver_id set on manual_payment_operations', 'Second approval record', 'Draft'),
      ('C. Release Approval', 7,
       'Mark approved for payout',
       'Admin marks operation_status = Approved for Release. Provider is notified that payment is approved for payout.',
       'Admin', 'operation_status = Approved for Release', 'Audit log: release_approved', 'Draft'),
      ('C. Release Approval', 8,
       'Audit log created',
       'System records release_approved or release_put_on_hold in audit_logs.',
       'System', 'audit_logs entry exists', 'Audit log record', 'Draft');
  end if;

  -- D. Manual Payout SOP
  if not exists (
    select 1 from public.payment_operating_sop_items where sop_category = 'D. Manual Payout'
  ) then
    insert into public.payment_operating_sop_items
      (sop_category, step_number, step_name, step_description, responsible_role, control_check, required_evidence, status)
    values
      ('D. Manual Payout', 1,
       'Confirm payee bank details',
       'Verify provider payout account details from provider_payout_profiles table. Do not pay to unregistered account.',
       'Finance', 'payout_account matches provider_payout_profiles', 'provider_payout_profiles record', 'Draft'),
      ('D. Manual Payout', 2,
       'Confirm payout amount',
       'Payout amount = job_value − platform_fee − any claim_reserve deductions. Confirm net settlement amount.',
       'Finance', 'Amount verified against net_settlement record', 'net_settlement record or calculation sheet', 'Draft'),
      ('D. Manual Payout', 3,
       'Confirm deductions: platform fee and claim reserve',
       'Document any Nexum platform fee deducted. If claim reserve applies, deduct from payout. Record in payout_note.',
       'Finance', 'Deductions documented in payout_note', 'Payout note', 'Draft'),
      ('D. Manual Payout', 4,
       'Finance processes manual transfer or DuitNow',
       'Finance initiates bank transfer or DuitNow to payee account. Dual-control required if above RM 10,000.',
       'Finance', 'Transfer initiated, reference obtained', 'Bank transfer confirmation', 'Draft'),
      ('D. Manual Payout', 5,
       'Upload or enter payout reference',
       'Record payout_reference (bank transaction reference) in manual_payment_operations.',
       'Finance', 'payout_reference field populated', 'Bank transaction reference', 'Draft'),
      ('D. Manual Payout', 6,
       'Admin records payout',
       'Admin marks operation_status = Paid Out. Sets payout_processed_by, payout_processed_at, payout_note.',
       'Admin', 'operation_status = Paid Out', 'Audit log: manual_payout_recorded', 'Draft'),
      ('D. Manual Payout', 7,
       'Settlement marked paid out',
       'release_settlements record updated to paid out status.',
       'System', 'release_settlements.status = Paid Out', 'release_settlements record', 'Draft'),
      ('D. Manual Payout', 8,
       'Reconciliation pending',
       'reconciliation_status set to Pending. Await bank statement matching.',
       'System', 'reconciliation_status = Pending', 'record state', 'Draft');
  end if;

  -- E. Settlement Reconciliation SOP
  if not exists (
    select 1 from public.payment_operating_sop_items where sop_category = 'E. Settlement Reconciliation'
  ) then
    insert into public.payment_operating_sop_items
      (sop_category, step_number, step_name, step_description, responsible_role, control_check, required_evidence, status)
    values
      ('E. Settlement Reconciliation', 1,
       'Check payout bank record',
       'Admin retrieves bank statement and locates the payout debit entry for this job.',
       'Finance', 'Bank statement entry located', 'Bank statement (redacted where needed)', 'Draft'),
      ('E. Settlement Reconciliation', 2,
       'Match payout reference',
       'payout_reference in manual_payment_operations must match bank statement transaction reference.',
       'Finance', 'References match exactly', 'Matching entries side-by-side', 'Draft'),
      ('E. Settlement Reconciliation', 3,
       'Match amount and payee',
       'Payout amount and payee account name must match. Any mismatch → reconciliation_status = Mismatch → escalate.',
       'Finance', 'Amount and payee confirmed', 'Bank statement + payout record comparison', 'Draft'),
      ('E. Settlement Reconciliation', 4,
       'Mark reconciled',
       'Admin marks reconciliation_status = Reconciled. Records reconciliation_note.',
       'Admin', 'reconciliation_status = Reconciled', 'Audit log: settlement_reconciled', 'Draft'),
      ('E. Settlement Reconciliation', 5,
       'Evidence pack updated',
       'Reconciliation note and payout reference added to evidence pack for this job.',
       'System', 'evidence_pack_items includes reconciliation record', 'Evidence pack record', 'Draft');
  end if;

  -- F. Dispute / Hold SOP
  if not exists (
    select 1 from public.payment_operating_sop_items where sop_category = 'F. Dispute / Hold'
  ) then
    insert into public.payment_operating_sop_items
      (sop_category, step_number, step_name, step_description, responsible_role, control_check, required_evidence, status)
    values
      ('F. Dispute / Hold', 1,
       'Customer raises dispute before release',
       'Customer submits dispute via Nexum UI before release is approved. Dispute must be on record before release instruction is processed.',
       'Customer', 'disputes record created', 'Dispute submission timestamp', 'Draft'),
      ('F. Dispute / Hold', 2,
       'System blocks release',
       'Release approval is blocked automatically while disputes.status ∈ {Open, Under Review}. API returns error if release attempted.',
       'System', 'Release blocked, manual_payment_operations.operation_status = Disputed', 'API error log', 'Draft'),
      ('F. Dispute / Hold', 3,
       'Admin reviews evidence',
       'Admin reviews: POD, delivery confirmation (or absence), customer dispute reason, provider response.',
       'Admin', 'All evidence reviewed', 'Evidence pack', 'Draft'),
      ('F. Dispute / Hold', 4,
       'Claim reserve recorded if needed',
       'If partial liability determined, admin creates claim_reserves record to protect customer portion of payment.',
       'Admin', 'claim_reserves record if applicable', 'Claim reserve record', 'Draft'),
      ('F. Dispute / Hold', 5,
       'Provider and customer response recorded',
       'Both parties'' responses recorded in dispute.resolution_notes or audit_logs.',
       'Admin', 'Responses documented', 'Dispute record notes', 'Draft'),
      ('F. Dispute / Hold', 6,
       'Admin decides outcome',
       'Outcome options: Full Release (provider wins), Partial Release (split), Full Refund (customer wins), Hold (pending further action).',
       'Admin', 'Decision documented', 'Audit log: dispute_hold_created or release_approved or refund_recorded', 'Draft'),
      ('F. Dispute / Hold', 7,
       'Audit log created',
       'System records dispute_hold_created, release_approved, or refund_recorded in audit_logs.',
       'System', 'audit_logs entry exists', 'Audit log record', 'Draft');
  end if;

end $seed$;

-- =============================================================================
-- 6. GO-LIVE READINESS ITEMS — PHASE 3
-- Appended to go_live_readiness_items if not already seeded.
-- =============================================================================

do $gl_phase3$
begin
  -- Only insert if these items don't exist yet
  if not exists (
    select 1 from public.go_live_readiness_items
    where item_name = 'Manual payment SOP documented and approved'
  ) then
    insert into public.go_live_readiness_items
      (category, item_name, priority, owner_name, evidence_note)
    values
      ('E. Payment Workflow', 'Manual payment SOP documented and approved',            'Critical', 'Finance / Admin', 'All SOP steps Active in payment_sop page'),
      ('E. Payment Workflow', 'Customer payment instruction wording approved',         'Critical', 'Compliance',      'Wording: "payment will be treated as secured only after Nexum verifies receipt"'),
      ('E. Payment Workflow', 'Provider payment-secured wording approved',             'Critical', 'Compliance',      'Wording references designated payment holding workflow'),
      ('E. Payment Workflow', 'Manual payment verification tested end-to-end',         'Critical', 'Admin',           'UAT: customer uploads proof → admin verifies → secured'),
      ('E. Payment Workflow', 'Dual-control threshold configured (RM 10,000 payout)',  'High',     'Finance / Admin', 'Second approver required above threshold tested'),
      ('E. Payment Workflow', 'Management review threshold configured (RM 50,000)',    'High',     'Management',      'Management approval step tested'),
      ('F. Release Workflow', 'Manual payout tested with payout reference recorded',   'Critical', 'Finance',         'Payout recorded in manual_payment_operations'),
      ('F. Release Workflow', 'Settlement reconciliation process tested',              'High',     'Finance',         'Reconciliation status matched, audit log created'),
      ('G. Dispute Workflow', 'Dispute hold blocks release — tested',                  'Critical', 'Admin',           'Release API returns error when dispute is Open'),
      ('G. Dispute Workflow', 'Claim reserve deduction from payout tested',            'High',     'Finance',         'Claim reserve deducted in net payout calculation'),
      ('H. Audit Log',        'All 10 manual payment audit event types verified',      'High',     'Admin',           'audit_logs contains all event types from SOP'),
      ('I. User Acceptance Testing', 'Risk flag auto-detection tested (amount/currency/duplicate)', 'High', 'Admin', 'Risk flags appear correctly in payment-operations page'),
      ('J. Legal/Compliance', 'No "escrow guaranteed" or "guaranteed funding" language used', 'Critical', 'Compliance', 'Full UI text review completed');
  end if;
end $gl_phase3$;

-- =============================================================================
-- 7. VERIFICATION QUERIES
-- =============================================================================

select tablename, count(*) as policy_count
from pg_policies
where schemaname = 'public'
  and tablename in ('manual_payment_operations', 'payment_operating_sop_items')
group by tablename;

select count(*) as sop_steps_seeded from public.payment_operating_sop_items;
