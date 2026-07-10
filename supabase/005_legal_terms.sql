-- =============================================================================
-- NEXUM SECUREFLOW — 005_legal_terms.sql
-- Pilot Terms, Customer Agreement & Provider Agreement — Phase 4
--
-- SAFE TO RE-RUN: CREATE TABLE IF NOT EXISTS, DROP POLICY IF EXISTS,
-- idempotent seed via DO block.
--
-- IMPORTANT: This is system acceptance capture only.
-- Final legal wording must be reviewed by a qualified lawyer before full
-- public launch. Do not describe as legal escrow, trust, or guaranteed payment.
--
-- CREATES:
--   1. legal_terms_templates
--   2. legal_terms_acceptances
--   3. RLS for both tables
--   4. Indexes
--   5. Seeded pilot templates (5 types)
--   6. Go-live readiness items for Phase 4
-- =============================================================================

-- =============================================================================
-- 1. LEGAL_TERMS_TEMPLATES
-- Admin-managed templates for pilot customer/provider terms.
-- =============================================================================

create table if not exists public.legal_terms_templates (
  id                  uuid      primary key default gen_random_uuid(),
  template_reference  text      unique not null,
  template_type       text      check (template_type in (
                        'Customer Pilot Terms',
                        'Provider Pilot Terms',
                        'Payment Holding Terms',
                        'Release Terms',
                        'Dispute Terms',
                        'Privacy Notice',
                        'General Platform Terms',
                        'Other'
                      )) not null,
  template_title      text      not null,
  version_number      text      default '1.0',
  language            text      default 'English',
  content             text      not null,
  status              text      check (status in ('Draft','Active','Archived')) default 'Draft',
  effective_date      date,
  created_by          uuid      references auth.users(id),
  created_at          timestamptz default now(),
  updated_at          timestamptz default now()
);

drop trigger if exists trg_ltt_updated_at on public.legal_terms_templates;
create trigger trg_ltt_updated_at
  before update on public.legal_terms_templates
  for each row execute function public.set_updated_at();

-- =============================================================================
-- 2. LEGAL_TERMS_ACCEPTANCES
-- Immutable acceptance records — no user-level UPDATE or DELETE allowed.
-- =============================================================================

create table if not exists public.legal_terms_acceptances (
  id                  uuid      primary key default gen_random_uuid(),
  template_id         uuid      references public.legal_terms_templates(id),
  template_reference  text,
  template_type       text,
  version_number      text,
  company_id          uuid      references public.companies(id),
  user_id             uuid      references auth.users(id),
  user_email          text,
  user_name           text,
  job_reference       text,
  acceptance_status   text      check (acceptance_status in (
                        'Accepted',
                        'Rejected',
                        'Withdrawn',
                        'Superseded'
                      )) default 'Accepted',
  accepted_at         timestamptz default now(),
  ip_address          text,
  user_agent          text,
  acceptance_method   text      check (acceptance_method in (
                        'Checkbox',
                        'Button Click',
                        'Digital Signature',
                        'Admin Recorded',
                        'Other'
                      )) default 'Checkbox',
  acceptance_note     text,
  created_at          timestamptz default now()
  -- No updated_at — acceptances are immutable records
);

-- =============================================================================
-- 3. INDEXES
-- =============================================================================

create index if not exists idx_ltt_type_status
  on public.legal_terms_templates (template_type, status);

create index if not exists idx_lta_user_id
  on public.legal_terms_acceptances (user_id);

create index if not exists idx_lta_company_id
  on public.legal_terms_acceptances (company_id);

create index if not exists idx_lta_job_reference
  on public.legal_terms_acceptances (job_reference);

create index if not exists idx_lta_template_id
  on public.legal_terms_acceptances (template_id);

create index if not exists idx_lta_template_type
  on public.legal_terms_acceptances (template_type, acceptance_status);

-- =============================================================================
-- 4. ROW LEVEL SECURITY
-- =============================================================================

alter table public.legal_terms_templates    enable row level security;
alter table public.legal_terms_acceptances  enable row level security;

-- ── legal_terms_templates ────────────────────────────────────────────────────
-- Admin: full access. Authenticated: read Active templates only.

drop policy if exists "ltt_admin_all"            on public.legal_terms_templates;
drop policy if exists "ltt_authenticated_select" on public.legal_terms_templates;

create policy "ltt_admin_all"
  on public.legal_terms_templates for all
  to authenticated
  using  (public.nexum_is_admin())
  with check (public.nexum_is_admin());

create policy "ltt_authenticated_select"
  on public.legal_terms_templates for select
  to authenticated
  using (status = 'Active');

-- ── legal_terms_acceptances ──────────────────────────────────────────────────
-- Admin: full read access + can update status (supersede/withdraw).
-- Authenticated: can insert own acceptance, read own acceptances.
-- NO user-level DELETE.

drop policy if exists "lta_admin_all"        on public.legal_terms_acceptances;
drop policy if exists "lta_own_select"       on public.legal_terms_acceptances;
drop policy if exists "lta_own_insert"       on public.legal_terms_acceptances;

create policy "lta_admin_all"
  on public.legal_terms_acceptances for all
  to authenticated
  using  (public.nexum_is_admin())
  with check (public.nexum_is_admin());

create policy "lta_own_select"
  on public.legal_terms_acceptances for select
  to authenticated
  using (user_id = auth.uid());

create policy "lta_own_insert"
  on public.legal_terms_acceptances for insert
  to authenticated
  with check (user_id = auth.uid());

-- =============================================================================
-- 5. SEED PILOT TEMPLATES
-- Idempotent: skips each template if its template_reference already exists.
-- =============================================================================

do $seed$
declare
  v_customer_id  uuid;
  v_provider_id  uuid;
  v_holding_id   uuid;
  v_release_id   uuid;
  v_dispute_id   uuid;
begin

  -- ── 1. Customer Pilot Terms ─────────────────────────────────────────────────
  if not exists (select 1 from public.legal_terms_templates where template_reference = 'TMPL-CUS-PILOT-1.0') then
    insert into public.legal_terms_templates
      (template_reference, template_type, template_title, version_number, language, status, effective_date, content)
    values (
      'TMPL-CUS-PILOT-1.0',
      'Customer Pilot Terms',
      'Nexum SecureFlow — Customer Pilot Payment Terms',
      '1.0',
      'English',
      'Active',
      current_date,
      $content$NEXUM SECUREFLOW — CUSTOMER PILOT PAYMENT TERMS
Version 1.0 | Pilot Programme

IMPORTANT NOTICE
This is a pilot programme. Final commercial terms are subject to full legal review before general availability. This document captures your acceptance of the controlled payment workflow for pilot use only.

1. PILOT SCOPE
1.1 These terms apply to logistics fee payments processed through the Nexum SecureFlow pilot controlled payment workflow.
1.2 This pilot currently covers local Malaysia (MYR) logistics fee transactions only.
1.3 Cargo value, supplier payments, financing disbursement, and foreign currency settlement are not within this pilot scope unless separately confirmed in writing.

2. DESIGNATED PAYMENT HOLDING WORKFLOW
2.1 When you make payment under a secured job, your payment is received into a designated payment account for workflow management purposes.
2.2 This is not described as legal escrow, trust, or a bank account held in your name.
2.3 Payment is only treated as "Payment Secured" after Nexum verifies actual receipt against the uploaded proof and bank account records.
2.4 You must not treat the upload of payment proof as confirmation of payment secured. Nexum will notify you when payment is confirmed as secured.

3. PAYMENT INSTRUCTIONS
3.1 You must transfer the exact amount shown in the payment obligation to the designated payment account.
3.2 You must include your job reference in the payment remarks/reference field.
3.3 Payment method must be Manual Bank Transfer or DuitNow as instructed.
3.4 You must upload clear payment proof (screenshot or PDF) through the Nexum platform.
3.5 Nexum is not responsible for delays caused by: incorrect payment reference, third-party payment, bank processing delay, incomplete proof, or currency mismatch.

4. RELEASE CONDITIONS
4.1 Release of payment to the service provider is subject to all of the following:
    (a) Payment secured status confirmed by Nexum;
    (b) Provider has uploaded Proof of Delivery (POD) and required evidence;
    (c) You have confirmed delivery, or the confirmation window has expired without dispute;
    (d) No active dispute exists against this job;
    (e) Admin has approved release under the controlled release workflow.
4.2 Release is not automatic. All releases are processed manually under admin approval.

5. DISPUTES
5.1 You must raise any dispute through the Nexum platform before the release window expires.
5.2 Disputes raised after release has been approved cannot block payout.
5.3 Nexum will review evidence from both parties and may: hold release, approve partial release, arrange refund, or maintain hold pending further review.
5.4 Nexum does not determine legal liability. Dispute resolution under this pilot is limited to the workflow outcome (release, hold, refund).

6. LIMITATIONS
6.1 Nexum's obligation is to operate the payment holding workflow. Nexum is not liable for service delivery quality, cargo condition, logistics delay, or provider performance.
6.2 In the event of a technical error, Nexum will make reasonable efforts to restore correct status. Nexum's liability is limited to the transaction amount held under the workflow.
6.3 This pilot may be terminated or modified with reasonable notice.

7. YOUR ACCEPTANCE
By clicking "I Accept", you confirm you have read, understood, and agree to these Customer Pilot Payment Terms, Version 1.0.$content$
    );
  end if;

  -- ── 2. Provider Pilot Terms ─────────────────────────────────────────────────
  if not exists (select 1 from public.legal_terms_templates where template_reference = 'TMPL-PRV-PILOT-1.0') then
    insert into public.legal_terms_templates
      (template_reference, template_type, template_title, version_number, language, status, effective_date, content)
    values (
      'TMPL-PRV-PILOT-1.0',
      'Provider Pilot Terms',
      'Nexum SecureFlow — Provider Pilot Payment Terms',
      '1.0',
      'English',
      'Active',
      current_date,
      $content$NEXUM SECUREFLOW — PROVIDER PILOT PAYMENT TERMS
Version 1.0 | Pilot Programme

IMPORTANT NOTICE
This is a pilot programme. Final commercial terms are subject to full legal review before general availability. This document captures your acceptance as a service provider operating within the Nexum SecureFlow pilot.

1. PILOT SCOPE
1.1 These terms apply to logistics fee receipts processed through the Nexum SecureFlow pilot controlled payment workflow.
1.2 This pilot currently covers local Malaysia (MYR) logistics fee transactions only.
1.3 Cargo payment, supplier payments, financing disbursement, and foreign currency settlement are not within this pilot scope unless separately confirmed.

2. UNDERSTANDING PAYMENT SECURED STATUS
2.1 "Payment Secured" means Nexum has verified actual receipt under the designated payment holding workflow. It does not mean payment has been automatically released or paid out to you.
2.2 You must not treat unverified payment proof from the customer as confirmation that payment is secured.
2.3 Nexum will notify you when payment status changes. Do not proceed on the basis of customer verbal confirmation alone.

3. YOUR OBLIGATIONS
3.1 You must confirm your service scope, quotation, and liability terms are accurate before the customer accepts the job.
3.2 You must upload clear Proof of Delivery (POD) and any required evidence through the Nexum platform before release can be approved.
3.3 You must maintain accurate payout bank account details in your provider profile.

4. RELEASE CONDITIONS
4.1 Release of payment to you is subject to all of the following:
    (a) Payment secured status confirmed by Nexum;
    (b) You have uploaded POD and required evidence;
    (c) Customer has confirmed delivery, or the confirmation window has expired without dispute;
    (d) No active dispute exists;
    (e) Admin has approved release and finance has processed payout.
4.2 Release is processed manually. Payout timing is subject to: admin approval, finance processing, bank transfer, and reconciliation.

5. PAYOUT DELAYS
5.1 Payout may be delayed if any of the following occur:
    (a) Customer raises a dispute before release;
    (b) Payment amount or reference mismatch identified;
    (c) Bank processing issue;
    (d) Compliance review required;
    (e) Claim reserve applied pending dispute resolution.
5.2 Nexum will notify you of any delay and the reason where disclosure is appropriate.

6. DISPUTES
6.1 If a customer raises a dispute, Nexum will notify you and request evidence.
6.2 You must respond to dispute requests within the timeframe stated in the notification.
6.3 Nexum may apply claim reserve, partial release, or hold pending dispute resolution.

7. LIMITATIONS
7.1 Nexum's obligation is to operate the payment holding and release workflow. Nexum is not liable for customer non-payment beyond reasonable verification steps, or for delays outside Nexum's control.
7.2 In the event of payment mismatch or technical error, Nexum will make reasonable efforts to resolve the issue promptly.
7.3 This pilot may be terminated or modified with reasonable notice.

8. YOUR ACCEPTANCE
By clicking "I Accept", you confirm you have read, understood, and agree to these Provider Pilot Payment Terms, Version 1.0.$content$
    );
  end if;

  -- ── 3. Payment Holding Terms ────────────────────────────────────────────────
  if not exists (select 1 from public.legal_terms_templates where template_reference = 'TMPL-PHT-1.0') then
    insert into public.legal_terms_templates
      (template_reference, template_type, template_title, version_number, language, status, effective_date, content)
    values (
      'TMPL-PHT-1.0',
      'Payment Holding Terms',
      'Nexum SecureFlow — Designated Payment Holding Workflow Terms',
      '1.0',
      'English',
      'Active',
      current_date,
      $content$NEXUM SECUREFLOW — DESIGNATED PAYMENT HOLDING WORKFLOW TERMS
Version 1.0 | Pilot Programme

1. NATURE OF THE WORKFLOW
1.1 Nexum SecureFlow operates a designated payment holding workflow for pilot transactions.
1.2 Customer payments are received into a designated payment account managed by Nexum for workflow coordination purposes.
1.3 This workflow is not described as, and does not constitute, legal escrow, trust, or bank custody unless a separate legal arrangement has been entered into with the applicable regulatory authority.
1.4 Nexum is a technology-enabled workflow operator, not a financial institution, licensed escrow agent, or trustee for this pilot.

2. PAYMENT RECEIPT AND VERIFICATION
2.1 Funds received are matched against the payment obligation for the specific job.
2.2 Payment secured status is subject to: actual bank receipt confirmation, amount matching, currency matching, payer identity check, and reference matching.
2.3 Nexum may reject, hold, request clarification, or initiate refund for: amount mismatch, currency mismatch, duplicate reference, unclear proof, third-party payment, or suspicious transaction.
2.4 All payment verification is performed manually during the pilot phase.

3. RECONCILIATION
3.1 Each transaction is reconciled against bank records manually.
3.2 A settlement record is generated after payout is confirmed and reconciled.
3.3 Manual reconciliation means payout timing may vary.

4. NO AUTOMATIC RELEASE
4.1 Funds are not automatically released under any circumstances during this pilot.
4.2 All releases require explicit admin approval under the controlled release workflow.
4.3 Release timing depends on: payment verification, POD submission, customer confirmation, dispute status, and admin action.

5. REFUNDS
5.1 Refunds may be initiated by admin where: payment is rejected, dispute is resolved in customer's favour, or technical error occurred.
5.2 Refund processing is manual and subject to bank transfer timing.

6. CHANGES
6.1 Nexum may update these terms with reasonable notice. Continued use after notice constitutes acceptance of updated terms.$content$
    );
  end if;

  -- ── 4. Release Terms ────────────────────────────────────────────────────────
  if not exists (select 1 from public.legal_terms_templates where template_reference = 'TMPL-REL-1.0') then
    insert into public.legal_terms_templates
      (template_reference, template_type, template_title, version_number, language, status, effective_date, content)
    values (
      'TMPL-REL-1.0',
      'Release Terms',
      'Nexum SecureFlow — Controlled Release Workflow Terms',
      '1.0',
      'English',
      'Active',
      current_date,
      $content$NEXUM SECUREFLOW — CONTROLLED RELEASE WORKFLOW TERMS
Version 1.0 | Pilot Programme

1. RELEASE CONDITIONS
1.1 A release instruction can only be issued when all of the following conditions are met:
    (a) Payment secured — Nexum has verified actual receipt and amount matches the obligation;
    (b) Provider evidence — Provider has uploaded Proof of Delivery and any required supporting documents;
    (c) Delivery acknowledgement — Customer has confirmed delivery, or the confirmation window has expired without a dispute being raised;
    (d) No active dispute — No dispute in "Open" or "Under Review" status exists for this job;
    (e) No active claim reserve — No claim reserve blocks the full release amount;
    (f) Admin approval — A Nexum admin has reviewed and approved release.

2. CLAIM RESERVE
2.1 If a dispute is raised, Nexum may record a claim reserve against part or all of the payment amount.
2.2 Claim reserve protects the customer's portion pending dispute resolution.
2.3 Release of the non-reserved portion may proceed at admin discretion.

3. PARTIAL RELEASE
3.1 Where a claim reserve applies, Nexum may approve partial release of the undisputed amount.
3.2 The reserved portion is released, refunded, or held according to dispute resolution outcome.

4. PAYOUT PROCESSING
4.1 Once release is approved, finance processes the manual payout to the provider's registered bank account.
4.2 A payout reference is recorded on the settlement record.
4.3 Reconciliation is completed after bank confirmation.

5. TIMING
5.1 Release and payout timing during the pilot is indicative and subject to manual processing, bank transfer, and reconciliation.
5.2 Nexum will notify all parties of release approval and payout completion.

6. SETTLEMENT RECORD
6.1 A settlement record is generated for each completed transaction, documenting: payment obligation, proof submission, verification, release approval, payout reference, and reconciliation status.
6.2 Settlement records are maintained for audit and evidence pack purposes.$content$
    );
  end if;

  -- ── 5. Dispute Terms ────────────────────────────────────────────────────────
  if not exists (select 1 from public.legal_terms_templates where template_reference = 'TMPL-DIS-1.0') then
    insert into public.legal_terms_templates
      (template_reference, template_type, template_title, version_number, language, status, effective_date, content)
    values (
      'TMPL-DIS-1.0',
      'Dispute Terms',
      'Nexum SecureFlow — Dispute Handling Terms',
      '1.0',
      'English',
      'Active',
      current_date,
      $content$NEXUM SECUREFLOW — DISPUTE HANDLING TERMS
Version 1.0 | Pilot Programme

1. RAISING A DISPUTE
1.1 A customer may raise a dispute through the Nexum platform before the release window expires.
1.2 Disputes raised after release has been approved and payout initiated cannot block payout.
1.3 The dispute window is defined per job and shown on the job detail page.
1.4 Disputes must include: reason for dispute and supporting evidence (photos, documents, communications).

2. EFFECT OF DISPUTE
2.1 When a dispute is raised, Nexum will immediately block release pending review.
2.2 The operation status will be set to "Disputed" and no payout will proceed without admin instruction.
2.3 Nexum will notify both the provider and customer that a dispute has been raised.

3. DISPUTE REVIEW PROCESS
3.1 Both parties must provide evidence within the timeframe requested by Nexum.
3.2 Nexum will review: Proof of Delivery, delivery confirmation or absence, payment proof, dispute reason, and party responses.
3.3 Nexum may record a claim reserve against part or all of the disputed amount during review.

4. DISPUTE OUTCOMES
4.1 Nexum admin may decide one of the following outcomes:
    (a) Full Release — payment released to provider (provider's position accepted);
    (b) Partial Release — undisputed portion released, reserved portion refunded or held;
    (c) Full Refund — payment returned to customer (customer's position accepted);
    (d) Hold — further evidence required; matter held pending resolution.
4.2 All outcomes are recorded in the audit log and evidence pack.

5. LIMITATIONS
5.1 Nexum's dispute management is limited to the workflow outcome (release, hold, refund).
5.2 Nexum does not determine legal liability between parties beyond what the workflow outcome reflects.
5.3 Parties retain their right to pursue separate legal remedies for underlying disputes about service quality, damage, or breach of contract.
5.4 This pilot dispute process is not a substitute for formal arbitration or legal proceedings.

6. AUDIT TRAIL
6.1 All dispute actions, evidence submissions, and decisions are recorded in the audit log.
6.2 The evidence pack for a disputed job includes all dispute records.$content$
    );
  end if;

end $seed$;

-- =============================================================================
-- 6. GO-LIVE READINESS ITEMS — PHASE 4
-- =============================================================================

do $gl_phase4$
begin
  if not exists (
    select 1 from public.go_live_readiness_items
    where item_name = 'Customer pilot terms template Active'
  ) then
    insert into public.go_live_readiness_items
      (category, item_name, priority, owner_name, evidence_note)
    values
      ('J. Legal/Compliance', 'Customer pilot terms template Active',                     'Critical', 'Compliance / Legal', 'TMPL-CUS-PILOT-1.0 status = Active'),
      ('J. Legal/Compliance', 'Provider pilot terms template Active',                     'Critical', 'Compliance / Legal', 'TMPL-PRV-PILOT-1.0 status = Active'),
      ('J. Legal/Compliance', 'Payment holding terms template Active',                   'Critical', 'Compliance / Legal', 'TMPL-PHT-1.0 status = Active'),
      ('J. Legal/Compliance', 'Release terms template Active',                           'Critical', 'Compliance / Legal', 'TMPL-REL-1.0 status = Active'),
      ('J. Legal/Compliance', 'Dispute terms template Active',                           'Critical', 'Compliance / Legal', 'TMPL-DIS-1.0 status = Active'),
      ('J. Legal/Compliance', 'Customer acceptance capture tested end-to-end',           'Critical', 'Admin / QA',         'legal_terms_acceptances record created for customer with job_reference'),
      ('J. Legal/Compliance', 'Provider acceptance capture tested end-to-end',           'Critical', 'Admin / QA',         'legal_terms_acceptances record created for provider'),
      ('J. Legal/Compliance', 'Evidence pack includes terms acceptance',                 'High',     'Admin / QA',         'evidence_pack_items includes acceptance reference and version'),
      ('J. Legal/Compliance', 'No "escrow" or "guaranteed payment" language in UI',     'Critical', 'Compliance',         'Full UI text review completed — zero forbidden terms found'),
      ('J. Legal/Compliance', 'Legal wording reviewed by qualified lawyer (pre-launch)', 'Critical', 'Management / Legal', 'Lawyer sign-off obtained before full public launch'),
      ('I. User Acceptance Testing', 'Customer sees and accepts terms before job acceptance', 'Critical', 'QA', 'Terms modal shown and acceptance recorded in UAT'),
      ('I. User Acceptance Testing', 'Provider sees and accepts terms before first pilot job', 'Critical', 'QA', 'Terms modal shown and acceptance recorded in UAT'),
      ('I. User Acceptance Testing', 'Re-acceptance not required if same version already accepted', 'High', 'QA', 'Version check logic tested');
  end if;
end $gl_phase4$;

-- =============================================================================
-- 7. VERIFICATION QUERIES
-- =============================================================================

select template_reference, template_type, status
from public.legal_terms_templates
order by created_at;

select tablename, count(*) as policy_count
from pg_policies
where schemaname = 'public'
  and tablename in ('legal_terms_templates','legal_terms_acceptances')
group by tablename;
