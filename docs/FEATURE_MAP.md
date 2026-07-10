# Nexum SecureFlow — Feature Map

All modules, their current implementation status, primary files, and which user roles can access them.

---

## Status Key

| Status | Meaning |
|---|---|
| ✅ Live | Fully implemented with real Supabase reads/writes |
| 🟡 Partial | Core functionality works; some features use fallbacks or are incomplete |
| 🔵 Simulated | UI and logic complete; underlying data is mocked or uses fallback AI |

---

## Module Map

### 1. Authentication & Role-Based Access

**Status:** ✅ Live

| Item | Details |
|---|---|
| Provider | Supabase Auth (email + password) |
| Session management | `AuthContext.tsx` — React context, wraps entire app |
| Role enforcement | `AuthGuard.tsx` — wraps page-level components; redirects on mismatch |
| Roles | `admin`, `provider`, `customer`, `capital_partner` |
| Key files | `contexts/AuthContext.tsx`, `components/AuthGuard.tsx`, `app/login/page.tsx` |
| DB tables | `profiles` (role column), `auth.users` (Supabase built-in) |

---

### 2. Companies & Profiles

**Status:** ✅ Live

| Item | Details |
|---|---|
| Description | Business entity management — companies and user profiles |
| Admin access | Full CRUD via `/admin/companies` and `/admin/users` |
| Provider/Customer | Read-only profile via account settings |
| Key files | `app/admin/companies/page.tsx`, `app/admin/companies/[companyId]/page.tsx` |
| DB tables | `companies`, `profiles` |
| Relationships | Each `profile` optionally linked to one `company` |

---

### 3. Secured Jobs

**Status:** ✅ Live

| Item | Details |
|---|---|
| Description | Core workflow — create, manage, and track B2B secured trade jobs |
| Admin | Full lifecycle view + management at `/admin/jobs` and `/admin/jobs/[jobId]` |
| Provider | Job execution view at `/provider/jobs/[jobId]` |
| Customer | Customer view at `/customer/jobs/[jobId]` |
| Job statuses | `Awaiting Customer Acceptance` → `In Progress` → `Delivered` → `Completed` |
| Key files | `app/admin/jobs/`, `app/provider/jobs/`, `app/customer/jobs/`, `lib/jobStore.ts` |
| DB tables | `jobs`, `audit_logs` |
| Components | `JobFlowTracker.tsx`, `WorkflowTaskPanel.tsx` |

---

### 4. Payment Obligation Ledger

**Status:** ✅ Live

| Item | Details |
|---|---|
| Description | Tracks deposit + balance payment milestones, proof uploads, confirmations |
| Accessed via | Job detail pages (all roles) |
| Payment flow | Customer uploads proof → Admin confirms → Status advances |
| Key files | `components/PaymentLedgerCard.tsx`, `lib/paymentLedger.ts` |
| API routes | `/api/payment-obligations` |
| DB tables | `payment_obligations` |
| Storage | Payment proof files stored in `documents` bucket |

---

### 5. Document Intelligence

**Status:** 🟡 Partial (Live UI + AI extraction; falls back to simulated if no OpenAI key)

| Item | Details |
|---|---|
| Description | Upload trade documents; AI extracts structured fields (invoice amounts, BL numbers, dates) |
| Supported types | Invoice, Bill of Lading, Packing List, Certificate of Origin, Payment Proof |
| AI provider | OpenAI GPT-4o (requires `OPENAI_API_KEY`) |
| Fallback | Simulated extraction with plausible dummy data |
| Key files | `components/DocumentIntelligencePanel.tsx`, `components/DocumentUpload.tsx`, `components/DocumentList.tsx`, `lib/documentExtraction.ts` |
| API routes | `/api/document-extract` |
| DB tables | `documents` |
| Confidence indicator | `DataConfidenceCard.tsx` shows extraction confidence score |

---

### 6. Shipment Tracking

**Status:** 🟡 Partial (Live UI; tracking events are manual or mock unless connector configured)

| Item | Details |
|---|---|
| Description | Per-job shipment event timeline with location and status |
| Event sources | Manual entry (admin/provider), tracking connector API sync, mock data |
| Key files | `components/ShipmentTrackingPanel.tsx`, `lib/shipmentTracking.ts` |
| DB tables | `shipment_tracking` |

---

### 7. Tracking Connectors

**Status:** 🔵 Simulated (UI + config management live; real API sync requires connector credentials)

| Item | Details |
|---|---|
| Description | Configure external carrier/tracking API integrations (Maersk, COSCO, custom) |
| Admin access | `/admin/tracking-connectors` |
| Sync behavior | Polls configured API endpoint on schedule; logs results |
| Key files | `app/admin/tracking-connectors/page.tsx`, `lib/trackingConnector.ts`, `lib/trackingAdapter.ts` |
| API routes | `/api/mock-tracking` (mock sync), connectors call external endpoints |
| DB tables | `tracking_connectors`, `tracking_sync_logs` |

---

### 8. Business Context

**Status:** 🟡 Partial (Live AI analysis; simulated if no OpenAI key)

| Item | Details |
|---|---|
| Description | Extracts and displays structured business context for each job — trade relationship, payment terms, risks |
| Key files | `components/BusinessContextPanel.tsx`, `lib/businessContext.ts` |
| DB tables | `business_context` |

---

### 9. Trade Ontology Graph

**Status:** 🔵 Simulated (graph renders; node generation is AI or mock)

| Item | Details |
|---|---|
| Description | Visual knowledge graph of trade concepts, entities, risks, and regulations extracted from job context |
| Key files | `components/TradeOntologyGraph.tsx`, `components/OntologySuggestionsPanel.tsx`, `lib/tradeOntology.ts`, `lib/ontologySuggestions.ts` |
| DB tables | `ontology_nodes`, `ontology_edges` |

---

### 10. Decision Brief / Nexum Brain

**Status:** 🔵 Simulated (UI complete; AI generation requires OpenAI key)

| Item | Details |
|---|---|
| Description | AI-generated decision brief per job — risk rating, recommended action, summary |
| Nexum Brain | Aggregated AI insights panel combining document, tracking, and context data |
| Key files | `components/NexumBrainPanel.tsx`, `lib/nexumBrain.ts`, `lib/delayImpact.ts` |
| Components | `DelayImpactCard.tsx` |
| DB tables | `decision_briefs` |

---

### 11. Exceptions & Rescue Plans

**Status:** ✅ Live

| Item | Details |
|---|---|
| Description | Log and manage job exceptions (delays, disputes, compliance failures, force majeure) |
| Admin | Full CRUD + filter view at `/admin/exceptions` |
| Provider | Can report and update status of own-job exceptions |
| Customer | Simplified view of exceptions on their jobs |
| Key files | `app/admin/exceptions/page.tsx`, `components/ExceptionPanel.tsx`, `lib/exceptions.ts` |
| DB tables | `exceptions` |

---

### 12. Notifications

**Status:** ✅ Live

| Item | Details |
|---|---|
| Description | In-app notification inbox with unread count badge |
| Key files | `components/NotificationBell.tsx`, `components/NotificationInbox.tsx`, `app/admin/notifications/page.tsx`, `lib/notifications.ts` |
| API routes | `/api/notifications` |
| DB tables | `notifications` |

---

### 13. Workflow Tasks

**Status:** ✅ Live

| Item | Details |
|---|---|
| Description | Actionable task panel per job — assigned to specific users with due dates |
| Key files | `components/WorkflowTaskPanel.tsx`, `app/admin/tasks/page.tsx`, `lib/workflowTasks.ts` |
| API routes | `/api/workflow` |
| DB tables | `workflow_tasks` |

---

### 14. Communications

**Status:** 🟡 Partial (Log + preview live; real email/WhatsApp delivery requires API keys)

| Item | Details |
|---|---|
| Description | Compose and log email, WhatsApp, and in-app communications per job |
| Email delivery | Via Resend (`RESEND_API_KEY`) — simulated if not configured |
| WhatsApp | Not connected — logged as simulated |
| Key files | `app/admin/communications/page.tsx`, `components/CommunicationLogCard.tsx`, `components/EmailPreviewModal.tsx`, `components/SendInviteEmail.tsx`, `lib/communications.ts` |
| API routes | `/api/send-communication`, `/api/invite-email` |
| DB tables | `communication_logs` |

---

### 15. Membership

**Status:** ✅ Live

| Item | Details |
|---|---|
| Description | Company membership tiers, usage limits, renewal tracking |
| Admin access | `/admin/memberships` |
| Key files | `app/admin/memberships/page.tsx` |
| DB tables | `memberships` |

---

### 16. Company Intelligence

**Status:** 🔵 Simulated (structured display live; scoring data is manual or AI-generated)

| Item | Details |
|---|---|
| Description | Trust score, payment reliability, trade volume, key risk summary per company |
| Key files | `components/CompanyIntelligenceCard.tsx`, `components/TradeIntelligencePanel.tsx`, `lib/companyIntelligence.ts` |
| DB tables | `company_intelligence` |

---

### 17. Admin Command Center

**Status:** ✅ Live

| Item | Details |
|---|---|
| Description | Single-page live dashboard with 18 sections covering all data domains |
| Sections | Jobs, Tips, Users, Companies, Documents, Shipments, Connectors, Tracking Logs, Business Context, Decisions, Exceptions, Notifications, Tasks, Communications, Memberships, Assessments, Financing Offers, Credit Packs |
| Key files | `app/admin/command-center/page.tsx` |
| DB tables | Reads from all 24 tables in parallel |

---

### 18. Capital Readiness

**Status:** ✅ Live

| Item | Details |
|---|---|
| Description | Capital readiness assessment per company — scored 0–100, risk-rated |
| Admin access | `/admin/capital-readiness` |
| Key files | `app/admin/capital-readiness/page.tsx`, `components/CapitalReadinessCard.tsx`, `lib/capitalReadiness.ts` |
| API routes | `/api/capital-readiness` |
| DB tables | `capital_readiness_assessments` |

---

### 19. Financing Simulation

**Status:** 🔵 Simulated (offers generated and stored; no real lender integration)

| Item | Details |
|---|---|
| Description | Simulated financing offer generation — product type, amount, rate, tenor |
| Admin access | `/admin/financing-offers` |
| Key files | `app/admin/financing-offers/page.tsx`, `components/FinancingOfferCard.tsx`, `lib/financingOffers.ts` |
| API routes | `/api/financing-offers` |
| DB tables | `financing_offers` |

---

### 20. Capital Partner Portal

**Status:** 🟡 Partial (Auth + read-only credit pack view live; deal flow management not built)

| Item | Details |
|---|---|
| Description | Separate portal for capital partners to review credit packs and readiness assessments |
| Access | `capital_partner` role only via `CapitalPartnerGuard.tsx` |
| Key files | `app/capital/page.tsx`, `components/CapitalPartnerGuard.tsx`, `lib/capitalPartner.ts` |
| DB tables | `credit_packs`, `capital_readiness_assessments`, `financing_offers` |

---

### 21. Credit Packs

**Status:** ✅ Live

| Item | Details |
|---|---|
| Description | Generate, view, and share credit decision-support packs for capital partner review |
| Admin access | `/admin/credit-packs`, `/admin/credit-packs/[pack_id]` |
| Generation | Triggered from capital readiness or financing offer pages ("📄 Pack" button) |
| Key files | `app/admin/credit-packs/page.tsx`, `app/admin/credit-packs/[pack_id]/page.tsx`, `lib/creditPack.ts` |
| API routes | `/api/credit-packs` |
| DB tables | `credit_packs`, `v_credit_packs_summary` (view) |

---

### 22. Data Sources

**Status:** 🔵 Simulated (registry UI; no live external data feeds)

| Item | Details |
|---|---|
| Description | Registry of connected external data providers (tracking, credit, trade, regulatory) |
| Key files | `app/admin/data-sources/page.tsx`, `lib/dataSource.ts` |
| DB tables | `data_sources` |

---

### 23. QA / System Tests

**Status:** ✅ Live

| Item | Details |
|---|---|
| Description | In-app automated test runner for system health checks |
| Admin access | `/admin/system-tests` |
| Tests | Supabase connectivity, auth flow, storage, API routes |

---

### 24. Pilot / Staging / Developer Handover Tools

**Status:** ✅ Live

| Page | Purpose |
|---|---|
| `/admin/pilot-readiness` | Live pilot readiness checklist with health checks and readiness score |
| `/admin/staging-readiness` | Pre-staging deployment checklist with env var status and deployment notes |
| `/admin/developer-handover` | Full architecture document with module map, DB map, tech risks, export |
| `/admin/demo-reset` | Pilot demo data management and reset tool |
| `/admin/pilot-demo-script` | Guided pilot walkthrough script |
| `/admin/db-health` | Live Supabase table health check dashboard |

---

## Component Library

| Component | Used By |
|---|---|
| `AuthGuard` | All admin, provider, customer, capital pages |
| `BusinessContextPanel` | Job detail pages |
| `CapitalPartnerGuard` | `/capital` pages |
| `CapitalReadinessCard` | Capital readiness page |
| `CommunicationLogCard` | Communications, job detail |
| `CompanyIntelligenceCard` | Company detail |
| `DataConfidenceCard` | Job detail (document section) |
| `DelayImpactCard` | Job detail |
| `DocumentIntelligencePanel` | Job detail |
| `DocumentList` | Job detail |
| `DocumentUpload` | Job detail |
| `EmailPreviewModal` | Communications |
| `ExceptionPanel` | Job detail pages (all roles) |
| `FinancingOfferCard` | Financing offers page |
| `InviteLink` | Admin user management |
| `JobFlowTracker` | Job detail pages |
| `LogoutButton` | All layout headers |
| `NexumBrainPanel` | Job detail |
| `NotificationBell` | All layout headers |
| `NotificationInbox` | Notifications page |
| `OntologySuggestionsPanel` | Job detail |
| `PaymentLedgerCard` | Job detail |
| `PilotBanner` | Admin pages (pilot mode indicator) |
| `SendInviteEmail` | Admin user management |
| `ShipmentTrackingPanel` | Job detail |
| `TradeIntelligencePanel` | Company detail |
| `TradeOntologyGraph` | Job detail |
| `WorkflowTaskPanel` | Job detail |

---

## API Route Map

| Route | Method | Purpose |
|---|---|---|
| `/api/admin` | POST | Admin-privileged operations |
| `/api/capital-partner-access` | GET/POST | Capital partner auth and access |
| `/api/capital-readiness` | POST | Create/update assessments |
| `/api/credit-packs` | POST | Generate credit packs |
| `/api/document-extract` | POST | AI document extraction |
| `/api/financing-offers` | POST | Create financing offers |
| `/api/invite-email` | POST | Send invite emails via Resend |
| `/api/mock-tracking` | POST | Simulate tracking sync |
| `/api/notifications` | GET/POST | Read/create notifications |
| `/api/payment-obligations` | GET/POST/PATCH | Ledger management |
| `/api/pilot-demo/clear` | POST | Reset pilot demo table data |
| `/api/pilot-status` | GET | Environment config flags (no secrets) |
| `/api/send-communication` | POST | Send/log communications |
| `/api/workflow` | GET/POST/PATCH | Workflow task management |
