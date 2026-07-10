# Nexum SecureFlow — Production Roadmap

A 4-phase plan to move Nexum SecureFlow from MVP/pilot to a production-grade commercial platform.

> **Current state:** Controlled pilot MVP. All infrastructure decisions are reversible at this stage.

---

## Phase 1 — Productionize SecureFlow Core

**Goal:** Make the foundational secured-job workflow safe, stable, and compliant enough to onboard real paying customers.

**Estimated duration:** 8–12 weeks with a 2–3 engineer team

### 1.1 Security & Access Hardening
- [ ] Complete Row Level Security (RLS) audit across all 24 tables
- [ ] Add integration tests that assert cross-role data isolation (provider cannot read other providers' jobs, customer cannot read other customers' documents)
- [ ] Remove any overly permissive policies introduced during pilot speed
- [ ] Audit all API routes for missing auth checks, broad `service_role` usage, and input validation gaps
- [ ] Add rate limiting to all public-facing API routes (recommend Upstash Rate Limit)
- [ ] Implement CSRF protection on mutating endpoints
- [ ] Replace `any` TypeScript types with proper interfaces across the codebase

### 1.2 Code Quality & Reliability
- [ ] Penetration test against OWASP Top 10 (especially JSONB injection, file upload abuse, auth bypass)
- [ ] Refactor repeated patterns (readiness pages, job fetch patterns) into shared hooks
- [ ] Add comprehensive unit tests for all `lib/` helper functions
- [ ] Add E2E tests for critical paths: login → create job → upload document → confirm payment
- [ ] Fix 3 pre-existing TypeScript errors in `companies/[companyId]/page.tsx`
- [ ] Set up CI/CD pipeline (GitHub Actions or Vercel) with lint + typecheck + test gates

### 1.3 Payment Infrastructure
- [ ] Integrate a payment gateway for the relevant target markets:
  - Southeast Asia: Xendit, Stripe, or iPay88
  - Global: Stripe or Adyen
- [ ] Build real payment confirmation flow (webhook-based, not manual proof upload)
- [ ] Add payment reconciliation report for admins

### 1.4 Legal & Compliance Foundation
- [ ] Engage legal counsel to review "Secured Job" messaging — ensure no implied escrow claim
- [ ] Add Terms of Service and Privacy Policy pages
- [ ] Implement data residency controls if operating in regulated jurisdictions
- [ ] Add GDPR/PDPA-compliant data deletion flow for user data

### 1.5 Operational Readiness
- [ ] Set up error monitoring (Sentry or similar) on both client and API routes
- [ ] Set up uptime monitoring (Better Uptime, Checkly)
- [ ] Configure Supabase point-in-time recovery (PITR) on the production database
- [ ] Write incident response runbook

---

## Phase 2 — Productionize Intelligence, Document & Shipment Modules

**Goal:** Make the AI-powered modules reliable, auditable, and production-grade.

**Estimated duration:** 6–10 weeks (can run in parallel with Phase 1 after Phase 1.1 is done)

### 2.1 Document Intelligence
- [ ] Harden OpenAI extraction prompt with structured output (`json_mode`) and output schema validation
- [ ] Add human review queue for documents with confidence score < 0.7
- [ ] Store raw extracted JSON alongside processed fields for auditability
- [ ] Add document type classification before field extraction
- [ ] Implement retry logic for OpenAI API failures
- [ ] Add virus/malware scanning on file upload (e.g., ClamAV, VirusTotal API)
- [ ] Enforce file type and size limits on upload endpoints

### 2.2 Shipment Tracking
- [ ] Integrate at least one real carrier API or tracking aggregator (Project44, Portcast, or Vizion recommended)
- [ ] Move API credentials out of the database into a secrets manager (AWS Secrets Manager, Doppler, or Vercel env)
- [ ] Implement reliable background sync jobs (Vercel Cron Jobs or a queue worker)
- [ ] Add alerting when tracking sync fails for > 2 consecutive attempts

### 2.3 AI Modules (Business Context, Ontology, Nexum Brain)
- [ ] Evaluate whether GPT-4o is the right model for each module — consider cost vs. quality trade-offs
- [ ] Implement prompt versioning so AI output changes are traceable
- [ ] Add caching for AI-generated content that doesn't change frequently (ontology, decision briefs)
- [ ] Build a feedback loop: admins can flag incorrect AI outputs, improving future prompts

### 2.4 Company Intelligence
- [ ] Define the scoring model formally (what inputs drive `overall_trust_score`)
- [ ] Connect at least one external data source (credit bureau API, trade registry, customs data)
- [ ] Add data freshness indicators — show when intelligence was last updated

---

## Phase 3 — Real APIs, Payments, Remittance & WhatsApp

**Goal:** Connect Nexum SecureFlow to real external services for a fully automated trade workflow.

**Estimated duration:** 12–16 weeks

### 3.1 Payment & Remittance
- [ ] Integrate cross-border payment/remittance provider (Wise Business API, Currencycloud, or regional equivalent)
- [ ] Build automated payment status webhook handling
- [ ] Implement multi-currency payment obligation tracking with real FX rates
- [ ] Add payment failure recovery flows (retry, notify, escalate)

### 3.2 WhatsApp Business API
- [ ] Integrate Meta Cloud API or a BSP (Twilio, 360dialog, MessageBird)
- [ ] Build WhatsApp notification templates for key job milestones (payment received, document ready, exception raised)
- [ ] Implement two-way WhatsApp communication (customer can reply to update job status)
- [ ] Store WhatsApp message receipts and delivery status in `communication_logs`

### 3.3 Email Infrastructure
- [ ] Move from Resend to a transactional email platform with domain authentication (SPF, DKIM, DMARC)
- [ ] Build email templates for: job confirmation, payment reminder, exception alert, credit pack share
- [ ] Implement email bounce/unsubscribe handling

### 3.4 Regulatory & Compliance APIs
- [ ] Integrate KYB (Know Your Business) verification for companies (Jumio, Onfido, or regional provider)
- [ ] Integrate sanctions screening (Refinitiv, Dow Jones, or equivalent) before onboarding new companies
- [ ] Add AML (Anti-Money Laundering) transaction monitoring hooks on payment confirmations

---

## Phase 4 — Capital Marketplace, Lender Integration & Blockchain Proof

**Goal:** Build a real capital marketplace connecting creditworthy trade businesses with institutional lenders, with optional immutable audit trail.

**Estimated duration:** 16–24 weeks (regulatory licensing may extend this significantly)

### 4.1 Lender Integration
- [ ] Productionize capital readiness scoring model with actuarial data validation
- [ ] Build secure lender API (credit pack delivery, offer submission, acceptance/decline workflow)
- [ ] Implement legally-reviewed credit pack format compliant with target jurisdiction
- [ ] Add lender KYB/onboarding workflow for capital partners
- [ ] Build deal room functionality — secure document sharing between borrower and lender

### 4.2 Capital Marketplace
- [ ] Launch a marketplace layer where multiple lenders can bid on a single credit pack
- [ ] Implement offer comparison view for admin/borrower
- [ ] Build automated deal matching based on lender criteria (sector, deal size, geography, product type)
- [ ] Add yield/pricing calculation engine with configurable risk premiums

### 4.3 Regulatory Licensing
- [ ] Obtain appropriate licences for the target market (e.g., MAS Capital Markets Services Licence in Singapore, SC licence in Malaysia, FCA authorisation in UK)
- [ ] Engage external compliance counsel to review all credit-related user-facing messaging
- [ ] Implement full audit trail for all capital-related actions (regulatory requirement in most markets)

### 4.4 Blockchain Proof of Trade (Optional)
- [ ] Evaluate whether blockchain anchoring adds verifiable value over Supabase audit logs for this use case
- [ ] If proceeding: anchor key job milestones (contract hash, payment confirmation, document hash) to a public or permissioned chain
- [ ] Implement verifiable credential issuance for completed trade transactions
- [ ] Build proof-of-trade export for customs/financing eligibility evidence

---

## Phase Summary

| Phase | Focus | Duration | Key Unlock |
|---|---|---|---|
| **Phase 1** | Core security, payments, legal foundation | 8–12 weeks | Safe to onboard real customers |
| **Phase 2** | AI reliability, real tracking, data quality | 6–10 weeks | Trustworthy intelligence modules |
| **Phase 3** | Real payment rails, WhatsApp, KYB/AML | 12–16 weeks | Fully automated trade workflow |
| **Phase 4** | Capital marketplace, lender API, regulatory | 16–24 weeks | Licensed capital matchmaking platform |

---

## Current Status Baseline (MVP Pilot)

| Capability | Status |
|---|---|
| Core job workflow | ✅ Operational |
| Payment ledger (manual) | ✅ Operational |
| Document upload + AI extraction | 🟡 Functional with fallback |
| Shipment tracking | 🟡 Manual / mock |
| Capital readiness assessment | ✅ Operational (scoring model to be validated) |
| Financing simulation | 🔵 Simulated |
| Credit packs | 🔵 Decision support only |
| RLS / Security | ⚠️ Pilot-grade — must audit before production |
| Payment gateway | ❌ Not connected |
| Real lender integration | ❌ Not built |
| Regulatory licences | ❌ Not obtained |
