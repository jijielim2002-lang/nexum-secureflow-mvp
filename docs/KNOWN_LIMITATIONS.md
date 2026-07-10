# Nexum SecureFlow — Known Limitations

This document lists current gaps, workarounds, and MVP-scope decisions that must be addressed before production or any real commercial deployment.

> **Pilot Disclaimer:** This MVP is a controlled pilot tool. Nothing in this system constitutes a regulated financial product, legal escrow service, or binding financial commitment. All capital offers and credit packs are for decision-support and simulation purposes only.

---

## 1. AI Extraction — Fallback / Simulated Mode

**Severity:** Medium

**Description:**
Document intelligence (invoice extraction, Bill of Lading parsing, etc.) requires `OPENAI_API_KEY` to be set. Without it, the system returns simulated extraction data — plausible-looking but not derived from the actual document.

**Behaviour:**
- `extraction_status` is set to `"simulated"` in the `documents` table
- `DataConfidenceCard` shows a "Simulated" badge
- No real OCR or AI parsing occurs

**Workaround:** Set `OPENAI_API_KEY` in `.env.local` to enable real GPT-4o extraction.

**Production fix required:** Evaluate and harden the extraction prompt; add structured output validation; implement human review queue for low-confidence extractions.

---

## 2. Shipment Tracking — Mock / Manual Only

**Severity:** Medium

**Description:**
Real-time shipment tracking from carriers (Maersk, COSCO, etc.) requires valid API credentials in configured `tracking_connectors` rows. Without them:
- The mock adapter (`/api/mock-tracking`) generates simulated events
- Manual entry by admin/provider is the only real data source

**Workaround:** Admin or provider can manually add shipment events via the job detail page.

**Production fix required:** Contract with a carrier API or tracking aggregator (e.g., Project44, Portcast); securely store API credentials outside the DB (e.g., secrets manager); implement real sync with error handling and retry logic.

---

## 3. No Payment Gateway Integration

**Severity:** High

**Description:**
The payment ledger tracks obligations and confirmation status, but **no real payment processing occurs**. Payment "proof" is simply a file upload (PDF/image) that an admin manually reviews and confirms.

The system does NOT:
- Process card payments
- Initiate bank transfers
- Connect to any payment network (SWIFT, SEPA, etc.)
- Verify funds received

**Workaround:** Manual bank transfer by customer → upload proof → admin confirms.

**Production fix required:** Integrate a payment gateway (Stripe, Adyen, Xendit, or similar) and/or bank API for real-time confirmation.

---

## 4. No Legal Escrow or Fund Holding

**Severity:** Critical

**Description:**
The "Secured Job" concept implies escrow-like protection, but **this system holds no funds**. There is no escrow account, trust account, or legally protected fund pool.

The "security" is procedural (admin confirmation gates) and operational (milestone workflow), not financial or legal.

**Production fix required:** Engage a licensed financial institution or escrow service provider before advertising any fund-protection capabilities to end users.

---

## 5. Financing Offers Are Simulated Only

**Severity:** High

**Description:**
Financing offers generated at `/admin/financing-offers` are:
- Algorithmically generated based on assessment scores
- Stored in the `financing_offers` table
- **Not connected to any real lender, bank, or financial institution**
- Not legally binding in any way

**Workaround:** Use offers as internal discussion documents or preliminary term sheets only.

**Production fix required:** Partner with licensed lenders; implement a real offer workflow with legal review, KYC/AML compliance, and binding term sheet generation.

---

## 6. Credit Packs Are Decision-Support Only

**Severity:** High

**Description:**
Credit packs at `/admin/credit-packs` are:
- Structured summaries of assessment data
- Exported as reference documents for capital partner conversations
- **Not credit reports, not regulatory-compliant credit assessments**
- Not issued by a licensed credit bureau or financial regulator

**Workaround:** Explicitly label all credit pack exports as "Internal Decision Support — Not a Credit Report."

**Production fix required:** Engage a licensed credit assessment body or obtain appropriate regulatory licences before presenting packs as credit assessments.

---

## 7. Row Level Security (RLS) — Requires Production Audit

**Severity:** Critical

**Description:**
RLS policies were designed for pilot speed and may be more permissive than required for production. Specific risks:
- Some tables may not have RLS enabled
- Policies may grant broader access than the stated role matrix
- `capital_partner` role access to PII fields has not been formally audited
- Service-role API routes bypass RLS entirely — any API route bug could expose data

**Workaround:** During pilot, keep access restricted to known test users only.

**Production fix required:**
1. Run `SELECT tablename, rowsecurity FROM pg_tables WHERE schemaname = 'public';` to confirm RLS is ON for every table
2. Audit every RLS policy against the role matrix
3. Add integration tests that verify cross-role data isolation
4. Remove any `service_role` usage from client-side code paths

---

## 8. AI-Generated Code Requires Refactor & Security Review

**Severity:** High

**Description:**
Significant portions of this codebase were generated with AI assistance during rapid MVP development. This means:
- Some code may not follow best practices for security, performance, or maintainability
- Error handling may be inconsistent across modules
- Input validation on API routes is minimal
- Some TypeScript types use `any` or are overly broad
- Duplicate logic may exist across similar pages (capital-readiness, financing-offers, staging-readiness, etc.)

**Known pre-existing TypeScript errors:**
- `app/admin/companies/[companyId]/page.tsx` — 3x `TS18047: possibly 'null'` errors on `intel.overall_trust_score`

**Production fix required:**
1. Security audit of all API routes (input validation, auth checks, SQL injection surface via JSONB)
2. Refactor repeated patterns into shared hooks/utilities
3. Replace `any` types with proper interfaces
4. Add comprehensive unit and integration tests
5. Penetration test before any real user data is stored

---

## 9. localStorage for Checklist State

**Severity:** Low

**Description:**
Pilot readiness, staging readiness, and developer handover checklist states are persisted in browser `localStorage`, not the database. This means:
- Checklist state is per-browser, per-device
- Clearing browser storage loses all checklist progress
- No multi-admin synchronisation

**Workaround:** Export checklist state (JSON export button) before clearing browser storage.

**Production fix required:** Persist checklist state to the database if shared admin state is needed.

---

## 10. Email Delivery Is Optional

**Severity:** Low

**Description:**
Without `RESEND_API_KEY`, invite emails and communication emails are silently skipped. The `communication_logs` row is still written with `status = "simulated"`.

**Workaround:** Manually share invite links from `/admin/users` using the copy link function.

---

## 11. WhatsApp Not Connected

**Severity:** Low (MVP scope)

**Description:**
WhatsApp is listed as a communication channel in the UI and database (`channel = "whatsapp"`), but no WhatsApp API (Twilio, Meta Cloud API, etc.) is connected. Messages are logged as `status = "simulated"`.

**Production fix required:** Integrate Meta Cloud API or a WhatsApp Business API provider.

---

## 12. No Rate Limiting or DDOS Protection

**Severity:** Medium (for staging/production)

**Description:**
API routes have no rate limiting. In a production environment, endpoints like `/api/document-extract` (AI calls), `/api/send-communication` (email), and `/api/pilot-demo/clear` (destructive) must be rate-limited.

**Production fix required:** Add middleware-level rate limiting (e.g., Upstash Rate Limit with Redis) or use a WAF/API gateway.

---

## 13. No Audit Log for Admin Actions on Admin Tools

**Severity:** Low

**Description:**
Pilot readiness, staging readiness, and developer handover pages do not write to `audit_logs`. Admin actions on these internal tools are untracked.

---

## Summary Table

| # | Limitation | Severity | Blocks Production? |
|---|---|---|---|
| 1 | AI extraction fallback | Medium | No (degrades gracefully) |
| 2 | Tracking is mock/manual | Medium | No (manual workaround) |
| 3 | No payment gateway | High | Yes (if real payments needed) |
| 4 | No legal escrow | **Critical** | Yes (legal/regulatory) |
| 5 | Financing offers simulated | High | Yes (if lender integration needed) |
| 6 | Credit packs not regulatory credit reports | High | Yes (regulatory risk) |
| 7 | RLS must be audited | **Critical** | Yes (data security) |
| 8 | AI-generated code needs review | High | Yes (security) |
| 9 | localStorage checklist state | Low | No |
| 10 | Email delivery optional | Low | No (degrades gracefully) |
| 11 | WhatsApp not connected | Low | No |
| 12 | No rate limiting | Medium | Yes (for public staging) |
| 13 | Admin tool actions unaudited | Low | No |
