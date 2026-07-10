-- ─── Terms Acceptance / User Agreement v1 ────────────────────────────────────
-- Tables: terms_versions, user_terms_acceptances
-- Run after: compliance_wording_v1.sql (nexum_is_admin() must exist)

-- ── terms_versions ────────────────────────────────────────────────────────────

create table if not exists terms_versions (
  id             uuid  primary key default gen_random_uuid(),
  terms_type     text  not null,
  version        text  not null default 'v1.0',
  title          text  not null,
  content        text  not null,
  is_active      boolean  default true,
  effective_date date,
  created_at     timestamptz default now()
);

create index if not exists idx_tv_type_active on terms_versions (terms_type, is_active) where is_active = true;

-- ── Seed terms content ────────────────────────────────────────────────────────

insert into terms_versions (terms_type, version, title, content, effective_date) values

('Pilot Terms', 'v1.0', 'Pilot Programme Terms & Disclaimer',
$$Nexum SecureFlow Pilot Terms — v1.0

1. PILOT STATUS
Nexum SecureFlow is operating in a controlled pilot phase. All features, data, and workflows are for internal coordination and record-keeping only. This platform is not a production financial service.

2. NO REAL FUND HOLDING
Nexum SecureFlow does not hold, receive, transfer, or disburse funds. All "payment holding" references describe workflow state records only. Actual funds remain under the control of the payer, recipient, or a separately arranged bank or licensed payment partner.

3. NO LEGAL ESCROW
Nothing on this platform constitutes legal escrow, a regulated payment service, or licensed financial advice. Workflow records are not legally binding instruments unless confirmed separately through appropriate legal channels.

4. WORKFLOW RECORDS ONLY
All compliance checks, approvals, and status records on this platform are internal workflow tracking. They do not constitute regulatory compliance, legal due diligence, or regulated financial certification.

5. PILOT LIMITATIONS
- Data and workflows are internal records only.
- Features may change without notice during the pilot phase.
- No automated fund disbursement occurs on this platform.
- AI-generated content requires human verification before any action.

6. ACKNOWLEDGEMENT
By using Nexum SecureFlow during the pilot phase, you acknowledge that this is a workflow coordination tool, not a regulated financial service, and that all financial and legal arrangements must be handled through appropriate external channels.$$,
current_date),

('Payment Workflow Terms', 'v1.0', 'Payment Workflow — Disclaimer & Terms',
$$Nexum SecureFlow Payment Workflow Terms — v1.0

1. WORKFLOW RECORDING ONLY
The payment holding and controlled release features record workflow states and coordination records. The platform does not receive, hold, transfer, or disburse funds.

2. DESIGNATED HOLDING ARRANGEMENT
Where a "designated holding arrangement" or "controlled holding workflow" is referenced, this refers to a separately agreed arrangement using an approved bank, licensed payment partner, or legally constituted account arrangement.

3. RELEASE INSTRUCTIONS
A "release instruction" is a workflow record indicating that agreed conditions have been met. It is not a direct fund transfer instruction and does not constitute a payment guarantee.

4. PAYMENT SECURITY
"Payment secured" means a workflow record has been created and agreed conditions have been acknowledged. Actual security of funds depends on the underlying banking or legal arrangement.

5. COMPLIANCE CHECKS
Compliance checks are internal workflow records. They are not regulatory compliance certifications or legal due diligence.

6. NO PAYMENT GUARANTEE
Payment is subject to verification, the agreed workflow, and the underlying contractual arrangement between the parties. Nexum SecureFlow does not guarantee payment outcomes.$$,
current_date),

('Controlled Release Terms', 'v1.0', 'Controlled Release — Workflow Terms',
$$Nexum SecureFlow Controlled Release Terms — v1.0

1. RELEASE PROCESS
The controlled release workflow records payment release instructions after maker-checker approval. All releases are workflow records only.

2. MAKER-CHECKER APPROVAL
Release instructions require dual approval as a workflow control. This is an internal process record and does not constitute a legally binding release instruction unless confirmed separately.

3. NO AUTOMATIC RELEASES
No funds are automatically released by Nexum SecureFlow. All release instructions must be confirmed through the appropriate banking or payment partner channel.

4. RELEASE ELIGIBILITY
"Release eligible" means the workflow criteria have been met based on recorded conditions. Actual fund release depends on the underlying payment arrangement.

5. RECONCILIATION
Reconciliation records on this platform match workflow records to bank statement data. They do not constitute audited financial statements.

6. PILOT LIMITATION
All release workflow features are pilot workflow tools. No real funds are held or released by this platform.$$,
current_date),

('Financing Simulation Terms', 'v1.0', 'Financing Simulation — Disclaimer',
$$Nexum SecureFlow Financing Simulation Terms — v1.0

1. SIMULATION ONLY
All financing offers, credit assessments, credit packs, and capital readiness scores are simulated assessments for internal reference only. They are not loan approvals, credit decisions, or commitments to provide financing.

2. NOT A LOAN APPROVAL
"Financing offer" means a simulated assessment generated for workflow tracking. No funds will be disbursed and no credit facility will be established based on any offer on this platform.

3. INDICATIVE FIGURES
All rates, fees, tenures, and amounts are indicative only. Actual financing terms, if any, will be determined by a licensed partner through their own assessment process.

4. SUBJECT TO LENDER APPROVAL
Any indication of financing availability is subject to full credit review by a licensed lender. Nexum SecureFlow does not provide, fund, or guarantee any financing.

5. CREDIT PACK DISCLAIMER
Credit packs are workflow summary documents for sharing with potential financing partners. They are not prospectuses or regulated financial documents.

6. NOT FINANCIAL ADVICE
Nexum SecureFlow is not a licensed financial institution, credit provider, or regulated financial advisor.$$,
current_date),

('Capital Partner Terms', 'v1.0', 'Capital Partner Access — Terms',
$$Nexum SecureFlow Capital Partner Terms — v1.0

1. CAPITAL PARTNER ACCESS
Capital partner access allows viewing of credit assessments, financing opportunities, and workflow data shared by Nexum SecureFlow for assessment purposes only.

2. INFORMATION FOR ASSESSMENT
All data provided is for internal assessment and due diligence purposes. It does not constitute a formal credit application, regulated offering, or binding commitment by any party.

3. CONFIDENTIALITY
Information accessed through the capital partner portal is confidential and provided solely for the purpose of assessing potential financing arrangements. It must not be shared with third parties without prior written consent.

4. NO OBLIGATION
Access to credit packs and assessment data creates no obligation on either party to proceed with any financing arrangement.

5. REGULATORY COMPLIANCE
Capital partners are responsible for ensuring their own regulatory compliance when assessing and providing financing.

6. PILOT PHASE
This platform is in a pilot phase. Data accuracy, completeness, and availability are not guaranteed.$$,
current_date),

('Document AI Disclaimer', 'v1.0', 'Document AI Extraction — Disclaimer',
$$Nexum SecureFlow Document AI Disclaimer — v1.0

1. AI EXTRACTION IS DECISION-SUPPORT ONLY
Document extraction and AI-generated assessments are for decision-support purposes only. They are not final determinations and require human verification before any action.

2. ACCURACY NOT GUARANTEED
AI extraction may contain errors, omissions, or misinterpretations. Extracted data should always be verified against the original document.

3. HUMAN VERIFICATION REQUIRED
All AI-generated content, including extracted field values, trade intelligence assessments, and risk scores, must be reviewed and verified by a qualified human before being relied upon.

4. NOT LEGAL ADVICE
Document intelligence features do not provide legal analysis, regulatory compliance certification, or legal document verification.

5. TRAINING DATA
AI models used for extraction may be updated. Extraction accuracy may vary by document type, quality, and language.

6. DISCLAIMER
Nexum SecureFlow accepts no liability for decisions made based solely on AI-extracted content without human verification.$$,
current_date)

on conflict do nothing;

-- ── user_terms_acceptances ────────────────────────────────────────────────────

create table if not exists user_terms_acceptances (
  id                 uuid        primary key default gen_random_uuid(),
  user_id            uuid        references auth.users(id) on delete cascade,
  company_id         uuid        references public.companies(id) on delete set null,
  role               text,
  terms_type         text        check (terms_type in (
    'Pilot Terms', 'Payment Workflow Terms', 'Controlled Release Terms',
    'Financing Simulation Terms', 'Capital Partner Terms', 'Document AI Disclaimer', 'Other'
  )),
  terms_version      text        default 'v1.0',
  accepted_at        timestamptz default now(),
  ip_address         text,
  user_agent         text,
  acceptance_method  text        default 'checkbox',
  created_at         timestamptz default now()
);

-- Unique: one acceptance per user per terms_type per version
create unique index if not exists idx_uta_unique on user_terms_acceptances (user_id, terms_type, terms_version);

create index if not exists idx_uta_user    on user_terms_acceptances (user_id);
create index if not exists idx_uta_company on user_terms_acceptances (company_id);
create index if not exists idx_uta_type    on user_terms_acceptances (terms_type);

-- ── RLS ──────────────────────────────────────────────────────────────────────

alter table terms_versions          enable row level security;
alter table user_terms_acceptances  enable row level security;

-- terms_versions: all authenticated users can read active versions; admins can write
create policy "authenticated_read_tv"  on terms_versions for select using (auth.role() = 'authenticated');
create policy "admin_write_tv"         on terms_versions for all using (nexum_is_admin()) with check (nexum_is_admin());

-- user_terms_acceptances: users read/insert own; admins read all
create policy "user_own_uta"   on user_terms_acceptances for select using (user_id = auth.uid());
create policy "user_insert_uta" on user_terms_acceptances for insert with check (user_id = auth.uid());
create policy "admin_all_uta"   on user_terms_acceptances for select using (nexum_is_admin());

-- ── Done ─────────────────────────────────────────────────────────────────────
-- Files changed:
--   supabase/terms_acceptance_v1.sql          (this file)
--   lib/termsAcceptance.ts
--   app/api/terms/route.ts
--   app/api/terms-acceptances/route.ts
--   app/api/terms-acceptances/admin/route.ts
--   app/terms/page.tsx                        (new index page)
--   app/terms/accept/page.tsx
--   app/account/terms/page.tsx
--   app/admin/terms-acceptances/page.tsx
--   components/TermsGate.tsx
--   app/admin/payment-holding/page.tsx        (TermsGate added)
--   app/admin/release-approvals/page.tsx      (TermsGate added)
