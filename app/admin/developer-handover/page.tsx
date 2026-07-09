"use client";
import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { AuthGuard } from "@/components/AuthGuard";
import { LogoutButton } from "@/components/LogoutButton";
import { NotificationBell } from "@/components/NotificationBell";

// ─── Types ────────────────────────────────────────────────────────────────────

interface PilotStatus {
  appEnv:           "local" | "staging" | "production";
  appUrl:           string | null;
  supabaseUrl:      boolean;
  supabaseUrlHost:  string | null;
  supabaseAnonKey:  boolean;
  serviceRoleKey:   boolean;
  storageBucket:    string | null;
  emailProvider:    string | null;
  openAiConfigured: boolean;
  trackingApiConfigured: boolean;
  inviteLinkBase:   string | null;
}

// ─── Content constants ────────────────────────────────────────────────────────

const ROLES: { role: string; color: string; icon: string; path: string; capabilities: string[]; restrictions: string[] }[] = [
  {
    role: "Admin (Nexum)",
    color: "blue",
    icon: "🛡",
    path: "/admin",
    capabilities: [
      "Full read/write on all tables via service role API routes",
      "Verify payment proofs and advance job milestones",
      "Run capital readiness assessments and generate financing simulations",
      "Generate credit packs and share with capital partners",
      "Manage company intelligence, exceptions, memberships",
      "Access Command Center, QA, Pilot Readiness, Staging Readiness, Handover Pack",
    ],
    restrictions: [
      "Service role key must never leave server-side API routes",
      "Should not impersonate other roles for data operations",
    ],
  },
  {
    role: "Service Provider",
    color: "purple",
    icon: "🚚",
    path: "/provider",
    capabilities: [
      "Create secured jobs assigned to a specific customer company",
      "Mark milestone actions: Pickup Completed, Delivered, Submit POD",
      "Upload job documents (POD, receipts, pickups)",
      "View own company's jobs and audit trail",
      "Interact with exception panel for job-level issues",
    ],
    restrictions: [
      "Cannot see jobs from other provider companies",
      "Cannot verify payments (admin only)",
      "Cannot access capital readiness or financing flows",
    ],
  },
  {
    role: "Customer",
    color: "emerald",
    icon: "🏢",
    path: "/customer",
    capabilities: [
      "Accept jobs assigned to their company",
      "Upload deposit and balance payment proof",
      "Track job milestones and shipment status",
      "View job documents and audit trail",
    ],
    restrictions: [
      "Cannot see jobs belonging to other customer companies",
      "Cannot create jobs or advance milestones",
      "Cannot access financial intelligence modules",
    ],
  },
  {
    role: "Capital Partner",
    color: "amber",
    icon: "🏦",
    path: "/capital",
    capabilities: [
      "View financing opportunities shared by admin",
      "Review credit packs: trade evidence, risk summary, company intel",
      "Mark interest, request more info, or decline per opportunity",
    ],
    restrictions: [
      "Can only see opportunities explicitly shared with their company",
      "No write access to any job, payment, or document data",
      "No disbursement, no legal binding — assessment only",
    ],
  },
];

const WORKFLOW_STEPS: { step: string; actor: string; color: string; detail: string; tables: string[] }[] = [
  { step: "Provider creates job",        actor: "Provider", color: "purple", detail: "POST /api/jobs — inserts into secured_jobs, creates audit_log, triggers workflow_task + notification for customer.", tables: ["secured_jobs", "audit_logs", "workflow_tasks", "notifications"] },
  { step: "Customer accepts",            actor: "Customer", color: "emerald", detail: "PATCH /api/jobs/[ref]/accept — updates job_status to 'Awaiting Deposit', logs audit entry.", tables: ["secured_jobs", "audit_logs"] },
  { step: "Customer uploads deposit",    actor: "Customer", color: "emerald", detail: "POST /api/jobs/[ref]/payment — uploads file to Supabase Storage, updates payment_status, inserts payment_obligation.", tables: ["job_documents", "payment_obligations", "secured_jobs"] },
  { step: "Admin verifies deposit",      actor: "Admin",    color: "blue",   detail: "PATCH /api/jobs/[ref]/verify — confirms payment, advances job_status to 'Ready for Execution'.", tables: ["secured_jobs", "audit_logs", "notifications"] },
  { step: "Provider executes shipment",  actor: "Provider", color: "purple", detail: "PATCH milestones: Pickup Completed, Delivered. Shipment tracking data ingested from connectors or manual.", tables: ["secured_jobs", "shipment_trackings", "audit_logs"] },
  { step: "Provider submits POD",        actor: "Provider", color: "purple", detail: "File upload to Supabase Storage. document_extraction triggered if OpenAI configured, else simulated.", tables: ["job_documents", "document_extractions", "audit_logs"] },
  { step: "Customer uploads balance",    actor: "Customer", color: "emerald", detail: "Same as deposit upload flow, updates payment_obligation record.", tables: ["job_documents", "payment_obligations"] },
  { step: "Admin verifies balance",      actor: "Admin",    color: "blue",   detail: "Final payment confirm → job_status = 'Completed'.", tables: ["secured_jobs", "audit_logs"] },
  { step: "Intelligence layers update",  actor: "System",   color: "slate",  detail: "Admin triggers: company_intelligence update, trade_intelligence_profile scoring, capital_readiness_assessment, exception checks.", tables: ["company_intelligence_profiles", "trade_intelligence_profiles", "capital_readiness_assessments", "job_exceptions"] },
];

const MODULES: {
  name: string; path: string; status: "live" | "simulated" | "partial";
  description: string; mainTables: string[]; apiRoutes: string[];
}[] = [
  { name: "Auth & RLS",              path: "Supabase Auth + API routes",             status: "live",      description: "Supabase email/password auth. AuthGuard client component enforces role-based redirects. API routes validate Bearer tokens via svc.auth.getUser(). RLS on all tables is configured but should be reviewed before production.", mainTables: ["profiles"], apiRoutes: ["/api/*"] },
  { name: "Companies / Profiles",    path: "/admin/companies",                        status: "live",      description: "companies and profiles tables linked by company_id. Multi-role company types: service_provider, customer, capital_partner. Admin manages all companies.", mainTables: ["companies", "profiles"], apiRoutes: ["/api/companies", "/api/companies/[id]"] },
  { name: "Secured Jobs",            path: "/admin/jobs, /provider/jobs, /customer/jobs", status: "live", description: "Core workflow entity. NSF-XXXX references auto-generated. 9-step milestone lifecycle. All state transitions logged to audit_logs.", mainTables: ["secured_jobs", "audit_logs"], apiRoutes: ["/api/jobs", "/api/jobs/[ref]"] },
  { name: "Payment Obligation Ledger", path: "/admin/jobs/[ref]",                    status: "live",      description: "payment_obligations tracks deposit, balance, and other obligations per job. Status lifecycle: Pending → Proof Uploaded → Verified → Overdue.", mainTables: ["payment_obligations"], apiRoutes: ["/api/payment-obligations"] },
  { name: "Document Upload",         path: "All job detail pages",                    status: "live",      description: "Files uploaded to Supabase Storage. job_documents records URL, role, type, job_reference. Signed URLs generated server-side. Public URLs used for some document types.", mainTables: ["job_documents"], apiRoutes: ["/api/documents"] },
  { name: "AI Document Extraction",  path: "/admin/jobs/[ref]",                       status: "simulated", description: "document_extractions table stores extraction results. If OPENAI_API_KEY is set, real extraction runs. Otherwise, simulated confidence scores are inserted. Human verification always required.", mainTables: ["document_extractions"], apiRoutes: ["/api/extractions"] },
  { name: "Ontology Update Suggestions", path: "/admin/command-center",              status: "partial",   description: "ontology_update_suggestions captures AI-suggested corrections to job data fields. Pending/accepted/rejected lifecycle. Not yet connected to a live knowledge graph.", mainTables: ["ontology_update_suggestions"], apiRoutes: ["/api/ontology-suggestions"] },
  { name: "Shipment Tracking",       path: "/admin/jobs/[ref], /provider/jobs/[ref]", status: "partial",  description: "shipment_trackings stores latest tracking event per job. data_source field identifies mock vs live. Delay engine computes delay_days and eta.", mainTables: ["shipment_trackings"], apiRoutes: ["/api/shipment-tracking"] },
  { name: "Tracking Connectors",     path: "/admin/command-center",                   status: "partial",  description: "tracking_connectors defines API connector configs. tracking_sync_logs stores sync history. Real carrier APIs not connected unless TRACKING_API_KEY is set.", mainTables: ["tracking_connectors", "tracking_sync_logs"], apiRoutes: ["/api/tracking-connectors"] },
  { name: "Track-Trace Manual Check", path: "/admin/jobs/[ref]",                     status: "live",      description: "Admin can manually trigger a tracking sync for any job. Returns latest tracking result from configured connector or mock.", mainTables: ["shipment_trackings"], apiRoutes: ["/api/tracking-check"] },
  { name: "Delay Impact Engine",     path: "Computed in TIP",                         status: "partial",  description: "Computes delay_days from eta vs actual. Integrates into trade_intelligence_profile. supply_disruption_risk and inventory_urgency derived from business_context + shipment data.", mainTables: ["shipment_trackings", "trade_intelligence_profiles"], apiRoutes: [] },
  { name: "Exceptions / Rescue Plans", path: "/admin/exceptions",                    status: "live",      description: "job_exceptions tracks open issues per job. Severity: Low/Medium/High/Critical. Rescue plans stored as free text. Role-aware panel: admin full CRUD, provider update, customer simplified.", mainTables: ["job_exceptions"], apiRoutes: ["/api/exceptions"] },
  { name: "Business Context",        path: "/admin/jobs/[ref]",                       status: "live",      description: "business_context_profiles stores per-job context: margin, supply disruption risk, inventory cover, confirmed orders, precaution plan, delay impact.", mainTables: ["business_context_profiles"], apiRoutes: ["/api/business-context"] },
  { name: "Trade Intelligence",      path: "/admin/jobs/[ref]",                       status: "live",      description: "trade_intelligence_profiles aggregates risk scores: payment_risk_level, route_risk_level, document_risk_level, inventory_urgency, overall_trade_risk, estimated_margin.", mainTables: ["trade_intelligence_profiles"], apiRoutes: ["/api/trade-intelligence"] },
  { name: "Decision Brief",          path: "/admin/jobs/[ref]",                       status: "live",      description: "Synthesises TIP, exceptions, business context, and company intel into a human-readable decision brief. Used by admin and Nexum Brain.", mainTables: ["trade_intelligence_profiles", "job_exceptions"], apiRoutes: [] },
  { name: "Nexum Brain",             path: "Components/NexumBrainPanel",              status: "live",      description: "Client-side Q&A engine. Classifies question intent (24+ QuestionKey types), builds BrainContext from parallel Supabase fetches, returns structured answers. No external AI model — all logic is deterministic TypeScript in lib/nexumBrain.ts.", mainTables: ["secured_jobs", "job_exceptions", "shipment_trackings", "simulated_financing_offers"], apiRoutes: [] },
  { name: "Notifications",           path: "/admin/notifications",                    status: "live",      description: "notifications table with priority, recipient_role, status (Unread/Read), action_url. NotificationBell component polls for unread count. Email delivery if provider configured.", mainTables: ["notifications"], apiRoutes: ["/api/notifications"] },
  { name: "Workflow Tasks",          path: "/admin/tasks",                             status: "live",      description: "workflow_tasks auto-generated on key job events. Assigned to role (admin/provider/customer). Priority, due_at, action_url. WorkflowTaskPanel component for role-aware display.", mainTables: ["workflow_tasks"], apiRoutes: ["/api/workflow-tasks"] },
  { name: "Communications",          path: "/admin/command-center",                   status: "simulated", description: "communication_logs records all email/WhatsApp/SMS sends. Status: Sent/Simulated/Failed. Simulated when no real provider key is set.", mainTables: ["communication_logs"], apiRoutes: ["/api/communications"] },
  { name: "Membership",              path: "/admin/memberships",                      status: "live",      description: "memberships table links company to a plan (Starter/Growth/Enterprise/Trial). used_jobs counter, included_jobs quota. Membership upgrade capital readiness assessment type.", mainTables: ["memberships"], apiRoutes: ["/api/memberships"] },
  { name: "Company Intelligence",    path: "/admin/companies/[id]",                   status: "live",      description: "company_intelligence_profiles stores composite trust scores: overall_trust_score, payment_behavior_score, operational_reliability_score. Risk level, trend, financing_readiness computed.", mainTables: ["company_intelligence_profiles"], apiRoutes: ["/api/company-intelligence"] },
  { name: "Command Center",          path: "/admin/command-center",                   status: "live",      description: "18-section admin dashboard. 19 parallel Supabase queries on load. Sections: Jobs, Action Queue, Risk Radar, TIP, Exceptions, Documents, Shipment, Connectors, Payments, Notifications, Workflow Tasks, Comms, Data Sources, Capital Readiness, Financing Offers, Credit Packs, Membership, Nexum Brain.", mainTables: ["all"], apiRoutes: [] },
  { name: "Capital Readiness",       path: "/admin/capital-readiness",                status: "live",      description: "capital_readiness_assessments table. Scoring: Priority/Eligible/Monitor/Not Ready. max_recommended_amount computed. Used to gate financing simulation.", mainTables: ["capital_readiness_assessments"], apiRoutes: ["/api/capital-readiness"] },
  { name: "Financing Simulation",    path: "/admin/financing-offers",                 status: "simulated", description: "simulated_financing_offers: product_type, offer_amount, tenure_days, estimated_fee, repayment_source. Partner interest lifecycle. No lender connected.", mainTables: ["simulated_financing_offers"], apiRoutes: ["/api/financing-offers", "/api/financing-offers/[id]"] },
  { name: "Capital Partner Portal",  path: "/capital",                                status: "simulated", description: "capital_partner_access links partner company to offer. CapitalPartnerGuard allows capital_partner + admin roles. Partner views credit pack, marks interest. No disbursement.", mainTables: ["capital_partner_access", "simulated_financing_offers"], apiRoutes: ["/api/capital-partner-access", "/api/capital-partner-access/[id]"] },
  { name: "Credit Packs",            path: "/admin/credit-packs",                     status: "simulated", description: "credit_packs stores JSONB sections: credit_summary, evidence_summary, risk_summary. Generated at time of request from 9 parallel data fetches. Print/PDF via window.print(). Decision-support only.", mainTables: ["credit_packs"], apiRoutes: ["/api/credit-packs", "/api/credit-packs/[pack_id]"] },
  { name: "QA / Pilot / Staging / Handover", path: "/admin/pilot-readiness, /admin/staging-readiness, /admin/developer-handover", status: "live", description: "Static + interactive admin tools. No DB writes. All state in localStorage. pilot-status API returns env flags without exposing secrets.", mainTables: [], apiRoutes: ["/api/pilot-status", "/api/pilot-demo/clear"] },
];

const DB_TABLES: { table: string; description: string; keyColumns: string[]; usedBy: string }[] = [
  { table: "profiles",                       description: "One row per auth user. Stores role, full_name, company_id. Linked to auth.users by id.", keyColumns: ["id (auth.users ref)", "role", "company_id", "full_name"], usedBy: "Auth, all role guards, admin user management" },
  { table: "companies",                       description: "Company accounts for providers, customers, and capital partners.", keyColumns: ["id", "name", "company_type", "created_at"], usedBy: "Jobs, capital partner access, memberships, intelligence" },
  { table: "secured_jobs",                    description: "Core job lifecycle entity. NSF-XXXX reference. Full milestone and payment status state machine.", keyColumns: ["job_reference (PK)", "service_provider_company_id", "customer_company_id", "job_status", "payment_status", "current_milestone"], usedBy: "Provider/Customer/Admin job pages, Command Center, all intelligence layers" },
  { table: "audit_logs",                      description: "Immutable event log for every action. actor_id, actor_role, action, description, metadata JSONB.", keyColumns: ["id", "job_reference", "actor_id", "actor_role", "action", "created_at"], usedBy: "All job state transitions, credit pack views, partner access events" },
  { table: "job_documents",                   description: "Document records per job. file_url points to Supabase Storage. Signed URLs generated server-side.", keyColumns: ["id", "job_reference", "document_type", "file_url", "uploaded_by_role"], usedBy: "Document panels on all job pages, document extraction" },
  { table: "document_extractions",            description: "AI extraction results per document. confidence_score, extracted_data JSONB.", keyColumns: ["id", "job_reference", "document_type", "extraction_status", "confidence_score"], usedBy: "AI extraction module, Command Center, credit packs" },
  { table: "ontology_update_suggestions",     description: "AI-suggested corrections to job data fields. target_field, suggested_value, status lifecycle.", keyColumns: ["id", "job_reference", "target_field", "suggested_value", "status"], usedBy: "Command Center ontology section" },
  { table: "shipment_trackings",              description: "Latest tracking event per job. transport_mode, tracking_status, delay_days, eta, bl_number, data_source.", keyColumns: ["id", "job_reference", "tracking_status", "delay_days", "data_source"], usedBy: "Shipment panels, Nexum Brain, credit packs, trade intelligence" },
  { table: "tracking_connectors",             description: "Named API connectors for carrier tracking. connector_type, status, auth config (server-side only).", keyColumns: ["id", "name", "connector_type", "status", "provider_name"], usedBy: "Tracking sync, Command Center connectors section" },
  { table: "tracking_sync_logs",              description: "History of every connector sync attempt. sync_status, error_message, response_payload JSONB.", keyColumns: ["id", "job_reference", "connector_id", "sync_status", "created_at"], usedBy: "Command Center sync log section" },
  { table: "trade_intelligence_profiles",     description: "Per-job risk intelligence: payment/route/document risk levels, inventory urgency, margin estimate.", keyColumns: ["id", "job_reference", "payment_risk_level", "overall_trade_risk", "estimated_margin"], usedBy: "TIP panel, Command Center, Nexum Brain, credit packs" },
  { table: "business_context_profiles",       description: "Per-job operational context: supply disruption risk, inventory cover, margin %, precaution plan.", keyColumns: ["id", "job_reference", "supply_disruption_risk", "margin_percentage", "confirmed_order"], usedBy: "Business context panel, TIP computation, credit packs" },
  { table: "job_exceptions",                  description: "Open issues per job. severity: Low/Medium/High/Critical. rescue_plan, resolved_at, resolution_note.", keyColumns: ["id", "job_reference", "exception_type", "severity", "status", "due_date"], usedBy: "Exceptions panel (all roles), Command Center risk, credit packs" },
  { table: "payment_obligations",             description: "Deposit/balance/other obligations per job. amount, currency, due_date, status ledger.", keyColumns: ["id", "job_reference", "obligation_type", "amount", "status", "due_date"], usedBy: "Payment ledger, Command Center payment intelligence, credit packs" },
  { table: "notifications",                   description: "In-app notifications. recipient_role, priority, read_at, action_url.", keyColumns: ["id", "job_reference", "recipient_role", "title", "status", "read_at"], usedBy: "NotificationBell, /admin/notifications, workflow automation" },
  { table: "workflow_tasks",                  description: "Auto-generated tasks on job events. assigned_role, priority, due_at, action_url.", keyColumns: ["id", "job_reference", "assigned_role", "task_type", "priority", "status"], usedBy: "WorkflowTaskPanel, /admin/tasks, Command Center" },
  { table: "communication_logs",              description: "Email/WhatsApp/SMS delivery record. channel, status: Sent/Simulated/Failed.", keyColumns: ["id", "job_reference", "channel", "subject", "status", "provider"], usedBy: "Command Center communications section" },
  { table: "memberships",                     description: "Company plan subscription. plan, annual_fee, included_jobs, used_jobs, start_date, end_date.", keyColumns: ["id", "company_id", "plan", "status", "used_jobs", "included_jobs"], usedBy: "/admin/memberships, Command Center membership section" },
  { table: "company_intelligence_profiles",   description: "Composite trust/risk scores per company. Scoring inputs: payment behavior, ops reliability, exceptions, completed jobs.", keyColumns: ["id", "company_id", "overall_trust_score", "risk_level", "trend", "financing_readiness"], usedBy: "Company detail page, capital readiness, credit packs, Nexum Brain" },
  { table: "data_sources",                    description: "Named data source configurations: carrier APIs, exchange rate feeds, etc. status, last_sync_at.", keyColumns: ["id", "name", "source_type", "status", "last_sync_at"], usedBy: "Command Center data sources section" },
  { table: "capital_readiness_assessments",   description: "Per-job/company readiness scoring. readiness_status: Priority/Eligible/Monitor/Not Ready. max_recommended_amount.", keyColumns: ["id", "job_reference", "company_id", "readiness_status", "readiness_score", "max_recommended_amount"], usedBy: "/admin/capital-readiness, financing simulation, credit packs" },
  { table: "simulated_financing_offers",      description: "Simulated product offers. product_type, offer_amount, tenure_days, estimated_fee. partner_interest_status lifecycle.", keyColumns: ["id", "job_reference", "company_id", "offer_status", "offer_amount", "partner_interest_status"], usedBy: "/admin/financing-offers, capital partner portal, credit packs, Nexum Brain" },
  { table: "capital_partner_access",          description: "Links capital_partner company to a specific offer. access_status: Invited/Active/Revoked/Expired.", keyColumns: ["id", "capital_partner_company_id", "financing_offer_id", "access_status", "access_expires_at"], usedBy: "/capital portal, /admin/capital-partners" },
  { table: "credit_packs",                    description: "Lender information packs. JSONB columns: credit_summary, evidence_summary, risk_summary. Snapshot at generation time.", keyColumns: ["id", "offer_id", "assessment_id", "pack_status", "credit_summary", "evidence_summary", "risk_summary"], usedBy: "/admin/credit-packs, capital partner pack view" },
];

const ENV_VARS: { name: string; scope: "public" | "server"; required: boolean; description: string; defaultOrFallback: string }[] = [
  { name: "NEXT_PUBLIC_SUPABASE_URL",    scope: "public", required: true,  description: "Supabase project REST API URL. Must point to staging/production project — not local.",    defaultOrFallback: "None — app will not start without this" },
  { name: "NEXT_PUBLIC_SUPABASE_ANON_KEY", scope: "public", required: true, description: "Supabase public anon key. Safe to expose — RLS enforces access control.",                  defaultOrFallback: "None — app will not start without this" },
  { name: "SUPABASE_SERVICE_ROLE_KEY",   scope: "server", required: true,  description: "Bypasses ALL RLS. Used only in /api/* server routes. NEVER prefix with NEXT_PUBLIC_.",     defaultOrFallback: "API write routes will fail (403/500)" },
  { name: "NEXT_PUBLIC_APP_URL",         scope: "public", required: true,  description: "Full deployment URL. Used in invite links, email templates, and auth redirects.",           defaultOrFallback: "Invite links will be malformed" },
  { name: "NEXT_PUBLIC_STORAGE_BUCKET",  scope: "public", required: false, description: "Supabase Storage bucket name for job documents.",                                           defaultOrFallback: "Falls back to 'job-documents'" },
  { name: "NEXT_PUBLIC_INVITE_BASE_URL", scope: "public", required: false, description: "Base URL for pilot user invite links. Separate from app URL if using a custom invite domain.", defaultOrFallback: "Falls back to NEXT_PUBLIC_APP_URL" },
  { name: "RESEND_API_KEY",              scope: "server", required: false, description: "Resend email delivery. If absent, all emails are simulated and logged as status='Simulated'.", defaultOrFallback: "Email simulated — no messages sent" },
  { name: "SENDGRID_API_KEY",            scope: "server", required: false, description: "SendGrid alternative. Only one email provider should be active.",                          defaultOrFallback: "Falls back to RESEND_API_KEY or simulated" },
  { name: "OPENAI_API_KEY",              scope: "server", required: false, description: "For live AI document extraction. If absent, confidence scores are simulated.",              defaultOrFallback: "Extraction simulated with placeholder scores" },
  { name: "TRACKING_API_KEY",            scope: "server", required: false, description: "Generic carrier tracking API key. If absent, tracking data is mock.",                      defaultOrFallback: "Shipment data is mock/manual only" },
  { name: "PILOT_DEPLOYMENT_NOTE",       scope: "server", required: false, description: "Short text shown in Pilot Readiness environment panel. Use for deployment version notes.", defaultOrFallback: "No note shown" },
  { name: "NODE_ENV",                    scope: "server", required: true,  description: "Set to 'production' by hosting provider in staging/prod. 'development' enables verbose Next.js errors.", defaultOrFallback: "Set by Next.js — do not set manually in hosting" },
];

const INTEGRATIONS: { name: string; icon: string; status: "live" | "simulated" | "partial" | "not-connected"; detail: string; condition: string }[] = [
  { name: "Email Delivery",         icon: "📧", status: "partial",       detail: "Resend or SendGrid when API key is configured. Falls back to 'Simulated' status — no email sent, just logged.", condition: "Live if RESEND_API_KEY or SENDGRID_API_KEY is set" },
  { name: "AI Document Extraction", icon: "🤖", status: "partial",       detail: "OpenAI API extracts text/fields from uploaded documents. Fallback inserts simulated confidence scores. Human review always required.", condition: "Live if OPENAI_API_KEY is set" },
  { name: "Shipment Tracking",      icon: "🚢", status: "partial",       detail: "tracking_connectors table defines API sources. sync_logs record results. Real carrier APIs not connected unless TRACKING_API_KEY is set.", condition: "Mock by default; live if TRACKING_API_KEY is set" },
  { name: "Payment Gateway",        icon: "💳", status: "not-connected", detail: "No FPX, DuitNow, Stripe, or SWIFT integration. Payment proof is manual upload verified by admin. Real payment rails require licensing.", condition: "Not connected — requires MSB licence or PSP partnership" },
  { name: "WhatsApp / SMS",         icon: "💬", status: "simulated",     detail: "WhatsApp notifications are logged in communication_logs with status='Simulated'. No Twilio or Meta API key connected.", condition: "Simulated — no messages sent" },
  { name: "Capital Partner API",    icon: "🏦", status: "simulated",     detail: "Capital partner portal is read-only decision support. No lender API, disbursement, or credit bureau connected.", condition: "Portal only — no real lender integration" },
  { name: "Supabase Auth",          icon: "🔑", status: "live",          detail: "Email/password auth via Supabase Auth. JWT-based sessions. Role stored in profiles table, not in JWT claims.", condition: "Always live (core dependency)" },
  { name: "Supabase Storage",       icon: "📁", status: "live",          detail: "Supabase Storage for job documents. Signed URLs generated server-side (api/documents). Public URLs for some types.", condition: "Live when storage bucket is configured" },
];

const TECH_RISKS: { title: string; severity: "critical" | "high" | "medium" | "low"; detail: string; mitigation: string }[] = [
  { severity: "critical", title: "Service role key must never reach the browser", detail: "Any route using the service role client (svc = createClient(URL, SERVICE_ROLE_KEY)) must be a Next.js API route (app/api/*). If accidentally prefixed NEXT_PUBLIC_, it will be bundled into the client bundle.", mitigation: "Audit all uses of SUPABASE_SERVICE_ROLE_KEY. Grep for it — it must only appear in app/api/ files." },
  { severity: "critical", title: "RLS policies need production review", detail: "Development RLS may be permissive ('allow all' or admin-only). Production requires per-role, per-company isolation verified by Supabase RLS tests. Capital partner access must be scoped to only their shared opportunities.", mitigation: "Run Supabase RLS policy tests with test accounts for each role before staging go-live." },
  { severity: "high",     title: "AI-generated code may contain duplicated logic", detail: "Large modules built in iterative sessions may have duplicated type definitions, repeated fetch patterns, or inconsistent error handling across pages.", mitigation: "Audit lib/ shared utilities. Consolidate repeated supabase fetch patterns into reusable hooks. Run a dead-code analysis." },
  { severity: "high",     title: "Supabase Storage signed URL security", detail: "Signed URLs expire but the time window should be reviewed. Public bucket policies (if any) could expose documents without auth. URL patterns with job_reference in path could be guessable.", mitigation: "Confirm all document buckets use private access. Signed URLs should be generated server-side with short TTL. Add RLS to storage objects if supported." },
  { severity: "high",     title: "Financial and legal language must be controlled", detail: "Any UI string mentioning 'escrow', 'payment guarantee', 'credit approval', or 'loan offer' could create regulatory liability. Disclaimer banners exist but must be reviewed by legal before external user access.", mitigation: "Review all UI strings in financing, credit pack, and capital partner flows. Ensure 'simulated', 'decision-support only', and disclaimers are prominent and cannot be dismissed." },
  { severity: "medium",   title: "Mock and simulated flows must be clearly labelled", detail: "Tracking data_source field, email status, AI confidence scores, and financing offer amounts all have simulated fallback paths. If not clearly labelled, pilot users may misunderstand them as live data.", mitigation: "Add 'Mock', 'Simulated', or 'Fallback' labels wherever a non-live data path is active. The environment status panel in pilot-readiness shows this for admin." },
  { severity: "medium",   title: "Nexum Brain is deterministic TypeScript, not an LLM", detail: "lib/nexumBrain.ts classifies questions with regex and returns structured answers from Supabase data. It cannot handle arbitrary questions. Unexpected question patterns return a generic fallback.", mitigation: "Expand QuestionKey coverage for common edge cases. Add a visible 'limitations' note to the Brain panel UI so users know it is not a general-purpose AI." },
  { severity: "low",      title: "localStorage state across sessions", detail: "Pilot readiness, staging readiness, and handover checklists are stored in browser localStorage. If a user clears browser data or switches machines, state is lost.", mitigation: "For production operations tooling, consider persisting checklist state to a settings table in Supabase instead of localStorage." },
];

const ROADMAP: { phase: string; label: string; color: string; items: string[] }[] = [
  {
    phase: "Phase 1",
    label: "SecureFlow Core (Current MVP)",
    color: "emerald",
    items: [
      "Three-role auth: Admin, Service Provider, Customer",
      "Job lifecycle: creation → acceptance → payment proof → execution → POD → closure",
      "Document upload (Supabase Storage) + audit log",
      "Admin payment verification gate at deposit and balance",
      "Manual notifications (in-app) + simulated email",
      "Company and user management",
      "Membership plan tracking",
      "Command Center: platform-wide admin view",
    ],
  },
  {
    phase: "Phase 2",
    label: "Intelligence + Automation",
    color: "blue",
    items: [
      "Live AI document extraction (OpenAI API) with human review workflow",
      "Real shipment tracking via carrier API connectors",
      "Ontology knowledge graph: auto-update job data from extraction results",
      "Exceptions and rescue plans with SLA tracking",
      "Business context + Trade Intelligence Profile scoring",
      "Automated email + WhatsApp notifications on all state transitions",
      "Full Command Center with live data across all intelligence layers",
    ],
  },
  {
    phase: "Phase 3",
    label: "Capital Partner Infrastructure",
    color: "purple",
    items: [
      "Real payment/remittance partner (FPX, DuitNow) — requires Bank Negara licensing or PSO partnership",
      "Live carrier API integrations (e.g. Flexport, project44, CMA CGM)",
      "Capital partner workflow: formal expression of interest → term sheet → credit decision",
      "Structured dispute resolution with evidence and mediation log",
      "Analytics dashboard: on-time delivery, payment velocity, exception frequency",
    ],
  },
  {
    phase: "Phase 4",
    label: "Financing Products + Legal Layer",
    color: "amber",
    items: [
      "Licensed financing products: supply chain finance, receivable factoring",
      "Risk-based pricing engine connected to company intelligence scores",
      "External lender API integration for automated credit decisions",
      "Digital Letter of Undertaking generated from job/company data",
      "Legal e-signature and RFC 3161 certified timestamps for audit log standing",
      "Blockchain proof layer anchoring audit records (post-workflow validation)",
    ],
  },
];

const DEV_CHECKLIST: { id: string; label: string; critical: boolean; hint: string }[] = [
  { id: "schema_review",       label: "Review full database schema and table relationships",                critical: true,  hint: "Check all foreign keys, nullable fields, and JSONB column structures. Cross-reference with DB Map in this document." },
  { id: "rls_review",          label: "Review and test all RLS policies per role",                         critical: true,  hint: "Test with dedicated accounts for each role. Confirm capital_partner cannot see non-shared offers. Confirm providers cannot see other companies' jobs." },
  { id: "api_route_review",    label: "Audit all API routes for auth validation and role checks",           critical: true,  hint: "Every /api/* route must validate the Bearer token and check role before performing any DB operation. Service role usage must stay server-side." },
  { id: "file_upload_security",label: "Review file upload and storage security",                           critical: true,  hint: "Confirm storage bucket is private. Signed URLs must be short-lived. No guessable public URL patterns for sensitive documents." },
  { id: "auth_guard_review",   label: "Review AuthGuard and CapitalPartnerGuard components",               critical: true,  hint: "Check that all admin pages are wrapped in AuthGuard(requiredRole='admin'). Capital partner pages use CapitalPartnerGuard (allows admin + capital_partner)." },
  { id: "role_permissions",    label: "Verify role permissions across all UI pages",                       critical: true,  hint: "Each page should only show actions available to that role. Provider should not see admin controls. Customer should not see financial intelligence." },
  { id: "simulated_modules",   label: "Identify and clearly label all simulated modules",                  critical: false, hint: "Email, AI extraction, tracking, financing offers, and credit packs all have simulated fallback paths. Ensure data_source, status labels, and disclaimer banners are visible." },
  { id: "env_vars",            label: "Confirm all environment variables are set in hosting provider",     critical: true,  hint: "Especially SUPABASE_SERVICE_ROLE_KEY (server-only), NEXT_PUBLIC_APP_URL, and any email/AI provider keys. Run the Staging Readiness page." },
  { id: "qa_tests",            label: "Run full QA test suite on staging environment",                     critical: true,  hint: "All checks on /admin/system-tests must return green against the staging Supabase project with staging data." },
  { id: "staging_deploy",      label: "Complete Staging Readiness checklist",                              critical: true,  hint: "Both environment checklist and data setup checklist on /admin/staging-readiness must be completed before pilot user invites." },
  { id: "rollback_plan",       label: "Prepare rollback plan before pilot user go-live",                   critical: false, hint: "Document the git commit, Supabase snapshot, and steps to revert if a critical bug is found after pilot users begin. Record in Staging Readiness deployment notes." },
];

const PRINT_CSS = `
@media print {
  .no-print { display: none !important; }
  body { background: #fff !important; color: #111 !important; font-size: 11pt; }
  .dev-card { border: 1px solid #d1d5db !important; background: #fff !important; break-inside: avoid; margin-bottom: 1rem; }
  .dev-card-header { background: #f3f4f6 !important; border-bottom: 1px solid #e5e7eb !important; }
  h1, h2, h3 { color: #111 !important; }
  a { color: #1d4ed8 !important; }
  code { background: #f3f4f6 !important; color: #111 !important; }
}
`;

const CHECKLIST_KEY = "dev_handover_checklist";

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function DeveloperHandoverPage() {
  return (
    <AuthGuard requiredRole="admin">
      <HandoverInner />
    </AuthGuard>
  );
}

function HandoverInner() {
  const [pilotStatus,   setPilotStatus]   = useState<PilotStatus | null>(null);
  const [checklist,     setChecklist]     = useState<Record<string, boolean>>({});
  const [copiedMd,      setCopiedMd]      = useState(false);
  const [copiedJson,    setCopiedJson]    = useState(false);

  const loadStatus = useCallback(async () => {
    try {
      const res = await fetch("/api/pilot-status");
      if (res.ok) setPilotStatus(await res.json() as PilotStatus);
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    void loadStatus();
    try {
      const saved = localStorage.getItem(CHECKLIST_KEY);
      if (saved) setChecklist(JSON.parse(saved) as Record<string, boolean>);
    } catch { /* ignore */ }
  }, [loadStatus]);

  function toggleCheck(id: string) {
    setChecklist((prev) => {
      const next = { ...prev, [id]: !prev[id] };
      try { localStorage.setItem(CHECKLIST_KEY, JSON.stringify(next)); } catch { /* ignore */ }
      return next;
    });
  }

  // Score
  const checked  = DEV_CHECKLIST.filter((c) => checklist[c.id]).length;
  const total    = DEV_CHECKLIST.length;
  const pct      = total === 0 ? 0 : (checked / total) * 100;
  const critPassed = DEV_CHECKLIST.filter((c) => c.critical).every((c) => checklist[c.id]);

  // Markdown export
  function buildMarkdown(): string {
    const lines: string[] = [
      "# Nexum SecureFlow — Developer Handover Pack",
      `Generated: ${new Date().toLocaleString("en-MY")}`,
      "",
      "---",
      "",
      "## 1. Product Overview",
      "",
      "**Nexum SecureFlow** is a structured trade-logistics management platform for Malaysian SME freight forwarders.",
      "It digitises the job lifecycle from provider quotation to customer payment closure, adding verification, document management, and a financial intelligence layer.",
      "",
      "### What is simulated in this MVP",
      ...MODULES.filter((m) => m.status === "simulated").map((m) => `- ${m.name}: ${m.description}`),
      "",
      "---",
      "",
      "## 2. User Roles",
      "",
      ...ROLES.flatMap((r) => [
        `### ${r.role} (${r.path})`,
        "",
        "**Capabilities:**",
        ...r.capabilities.map((c) => `- ${c}`),
        "",
        "**Restrictions:**",
        ...r.restrictions.map((r2) => `- ${r2}`),
        "",
      ]),
      "---",
      "",
      "## 3. Core Workflow",
      "",
      ...WORKFLOW_STEPS.map((s, i) => `${i + 1}. **${s.step}** (${s.actor}) — ${s.detail}`),
      "",
      "---",
      "",
      "## 4. Module Map",
      "",
      "| Module | Status | Key Tables | Description |",
      "|--------|--------|-----------|-------------|",
      ...MODULES.map((m) => `| ${m.name} | ${m.status.toUpperCase()} | ${m.mainTables.join(", ") || "—"} | ${m.description.substring(0, 100)}… |`),
      "",
      "---",
      "",
      "## 5. Database Map",
      "",
      "| Table | Description | Key Columns |",
      "|-------|-------------|-------------|",
      ...DB_TABLES.map((t) => `| \`${t.table}\` | ${t.description.substring(0, 80)} | ${t.keyColumns.join(", ")} |`),
      "",
      "---",
      "",
      "## 6. Environment Variables",
      "",
      "| Variable | Scope | Required | Fallback |",
      "|----------|-------|----------|---------|",
      ...ENV_VARS.map((v) => `| \`${v.name}\` | ${v.scope} | ${v.required ? "Yes" : "No"} | ${v.defaultOrFallback} |`),
      "",
      "---",
      "",
      "## 7. External Integrations",
      "",
      ...INTEGRATIONS.map((i) => `- **${i.name}** (${i.status.toUpperCase()}): ${i.detail} Condition: ${i.condition}`),
      "",
      "---",
      "",
      "## 8. Known Technical Risks",
      "",
      ...TECH_RISKS.map((r) => `### [${r.severity.toUpperCase()}] ${r.title}\n${r.detail}\n\n**Mitigation:** ${r.mitigation}\n`),
      "---",
      "",
      "## 9. Productionization Roadmap",
      "",
      ...ROADMAP.flatMap((p) => [
        `### ${p.phase} — ${p.label}`,
        ...p.items.map((i) => `- ${i}`),
        "",
      ]),
      "---",
      "",
      "## 10. Developer Checklist",
      "",
      ...DEV_CHECKLIST.map((c) => `- [${checklist[c.id] ? "x" : " "}] ${c.label}${c.critical ? " *(Required)*" : ""}`),
      "",
      `Progress: ${checked}/${total} (${Math.round(pct)}%)`,
      "",
      "---",
      "",
      "*This document is auto-generated from the Nexum SecureFlow Admin — Developer Handover Pack page.*",
    ];
    return lines.join("\n");
  }

  function buildJson() {
    return JSON.stringify({
      exportedAt: new Date().toISOString(),
      environment: pilotStatus,
      modules: MODULES.map((m) => ({ name: m.name, status: m.status, tables: m.mainTables })),
      dbTables: DB_TABLES.map((t) => ({ table: t.table, description: t.description })),
      envVars: ENV_VARS.map((v) => ({ name: v.name, scope: v.scope, required: v.required })),
      integrations: INTEGRATIONS.map((i) => ({ name: i.name, status: i.status, condition: i.condition })),
      techRisks: TECH_RISKS.map((r) => ({ title: r.title, severity: r.severity })),
      checklist: DEV_CHECKLIST.map((c) => ({ ...c, checked: !!checklist[c.id] })),
      checklistProgress: { checked, total, pct: Math.round(pct), criticalPassed: critPassed },
    }, null, 2);
  }

  function handleCopyMd() {
    try {
      void navigator.clipboard.writeText(buildMarkdown());
      setCopiedMd(true);
      setTimeout(() => setCopiedMd(false), 3000);
    } catch { /* ignore */ }
  }

  function handleCopyJson() {
    try {
      void navigator.clipboard.writeText(buildJson());
      setCopiedJson(true);
      setTimeout(() => setCopiedJson(false), 3000);
    } catch { /* ignore */ }
  }

  const statusColor: Record<string, string> = {
    live:          "border-emerald-500/30 bg-emerald-500/10 text-emerald-400",
    simulated:     "border-amber-500/30 bg-amber-500/10 text-amber-400",
    partial:       "border-blue-500/30 bg-blue-500/10 text-blue-400",
    "not-connected": "border-slate-700 bg-slate-800 text-slate-500",
  };

  const severityColor: Record<string, string> = {
    critical: "border-red-500/30 bg-red-950/15",
    high:     "border-amber-500/25 bg-amber-950/10",
    medium:   "border-blue-500/20 bg-blue-950/10",
    low:      "border-slate-700 bg-slate-900/40",
  };
  const severityBadge: Record<string, string> = {
    critical: "border-red-500/40 bg-red-500/15 text-red-400",
    high:     "border-amber-500/40 bg-amber-500/15 text-amber-400",
    medium:   "border-blue-500/40 bg-blue-500/15 text-blue-400",
    low:      "border-slate-700 bg-slate-800 text-slate-500",
  };
  const roleColor: Record<string, string> = {
    blue:    "border-blue-500/25 bg-blue-500/5",
    purple:  "border-purple-500/25 bg-purple-500/5",
    emerald: "border-emerald-500/25 bg-emerald-500/5",
    amber:   "border-amber-500/25 bg-amber-500/5",
  };
  const roleTitle: Record<string, string> = {
    blue:    "text-blue-400",
    purple:  "text-purple-400",
    emerald: "text-emerald-400",
    amber:   "text-amber-400",
  };
  const phaseColor: Record<string, { border: string; text: string; bg: string }> = {
    emerald: { border: "border-emerald-500/30", text: "text-emerald-400", bg: "bg-emerald-500/10" },
    blue:    { border: "border-blue-500/30",    text: "text-blue-400",    bg: "bg-blue-500/10" },
    purple:  { border: "border-purple-500/30",  text: "text-purple-400",  bg: "bg-purple-500/10" },
    amber:   { border: "border-amber-500/30",   text: "text-amber-400",   bg: "bg-amber-500/10" },
  };
  const workflowActor: Record<string, string> = {
    Provider: "text-purple-400",
    Customer: "text-emerald-400",
    Admin:    "text-blue-400",
    System:   "text-slate-500",
  };

  return (
    <>
      <style>{PRINT_CSS}</style>
      <div className="min-h-screen bg-slate-950 text-slate-100 font-sans">

        {/* Header */}
        <header className="no-print border-b border-slate-800 bg-slate-950/80 sticky top-0 z-50">
          <div className="mx-auto flex h-14 max-w-7xl items-center justify-between px-6">
            <Link href="/" className="flex items-center gap-2 text-sm font-semibold">
              <span className="text-blue-400">&#9632;</span> Nexum SecureFlow
            </Link>
            <nav className="flex items-center gap-4 text-xs text-slate-400">
              <span className="rounded-full border border-blue-500/30 bg-blue-500/10 px-3 py-1 text-blue-400 font-medium">Admin</span>
              <Link href="/admin"                    className="hover:text-slate-100 transition-colors">Dashboard</Link>
              <Link href="/admin/pilot-readiness"    className="hover:text-slate-100 transition-colors">Pilot Readiness</Link>
              <Link href="/admin/staging-readiness"  className="hover:text-slate-100 transition-colors">Staging Readiness</Link>
              <Link href="/admin/developer-handover" className="text-slate-100 border-b border-slate-500 pb-0.5">Dev Handover</Link>
              <NotificationBell />
              <LogoutButton />
            </nav>
          </div>
        </header>

        <main className="mx-auto w-full max-w-5xl px-6 py-8 space-y-8">

          {/* Title */}
          <div className="flex items-end justify-between gap-4 flex-wrap">
            <div>
              <h1 className="text-2xl font-bold text-slate-50">📦 Developer Handover Pack</h1>
              <p className="mt-1 text-sm text-slate-400">
                Architecture, modules, database, environment, risks, and productionization roadmap for future developers.
              </p>
            </div>
            <div className="no-print flex items-center gap-2 flex-wrap">
              <button type="button" onClick={handleCopyMd}
                className={`rounded-lg border px-3 py-2 text-xs font-semibold transition-colors ${copiedMd ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-400" : "border-slate-700 bg-slate-800 text-slate-300 hover:bg-slate-700"}`}>
                {copiedMd ? "✓ Copied MD" : "⎘ Copy Markdown"}
              </button>
              <button type="button" onClick={handleCopyJson}
                className={`rounded-lg border px-3 py-2 text-xs font-semibold transition-colors ${copiedJson ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-400" : "border-slate-700 bg-slate-800 text-slate-300 hover:bg-slate-700"}`}>
                {copiedJson ? "✓ Copied JSON" : "⎘ Copy JSON"}
              </button>
              <button type="button" onClick={() => window.print()}
                className="rounded-lg border border-blue-600/40 bg-blue-600/15 px-3 py-2 text-xs font-semibold text-blue-400 hover:bg-blue-600/25 transition-colors">
                🖨 Print
              </button>
            </div>
          </div>

          {/* ── SECTION 1 — Product Overview ──────────────────────────────── */}
          <DevCard title="Product Overview" icon="🏗" number={1}>
            <div className="space-y-4">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 mb-1">Purpose</p>
                <p className="text-xs text-slate-300 leading-relaxed">
                  <strong className="text-slate-100">Nexum SecureFlow</strong> is a structured trade-logistics management platform for Malaysian SME freight forwarders. It digitises the job lifecycle from provider quotation to customer payment closure, replacing informal agreements with verified milestones, tamper-evident audit logs, and a financial intelligence layer for capital access.
                </p>
              </div>
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 mb-1">Core Problem Solved</p>
                <p className="text-xs text-slate-400 leading-relaxed">
                  Freight forwarders operate on trust and verbal agreements. Payment disputes, missing PODs, and unverified cargo claims create cash-flow crises. SecureFlow provides a structured, verified record of every job event — making financing, dispute resolution, and partner trust computable.
                </p>
              </div>
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 mb-2">Current MVP Scope</p>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  {[
                    { label: "Live / Functional",    cls: "border-emerald-500/25 bg-emerald-500/5 text-emerald-400",  items: MODULES.filter((m) => m.status === "live").map((m) => m.name) },
                    { label: "Partial / Mock-ready", cls: "border-blue-500/25 bg-blue-500/5 text-blue-400",           items: MODULES.filter((m) => m.status === "partial").map((m) => m.name) },
                    { label: "Simulated",             cls: "border-amber-500/25 bg-amber-500/5 text-amber-400",        items: MODULES.filter((m) => m.status === "simulated").map((m) => m.name) },
                  ].map(({ label, cls, items }) => (
                    <div key={label} className={`rounded-lg border px-3 py-3 ${cls}`}>
                      <p className="text-[9px] font-bold uppercase tracking-wider mb-2 opacity-80">{label}</p>
                      <ul className="space-y-0.5">
                        {items.map((i) => <li key={i} className="text-[10px] opacity-70">{i}</li>)}
                      </ul>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </DevCard>

          {/* ── SECTION 2 — User Roles ────────────────────────────────────── */}
          <DevCard title="User Roles" icon="👥" number={2}>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {ROLES.map((r) => (
                <div key={r.role} className={`rounded-xl border ${roleColor[r.color]} p-4`}>
                  <div className="flex items-center gap-2 mb-3">
                    <span className="text-lg">{r.icon}</span>
                    <div>
                      <p className={`text-xs font-bold ${roleTitle[r.color]}`}>{r.role}</p>
                      <code className="text-[9px] text-slate-600">{r.path}</code>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <div>
                      <p className="text-[9px] font-semibold uppercase tracking-wider text-slate-500 mb-1">Can</p>
                      <ul className="space-y-0.5">
                        {r.capabilities.map((c, i) => <li key={i} className="text-[10px] text-slate-400 leading-snug">✓ {c}</li>)}
                      </ul>
                    </div>
                    <div>
                      <p className="text-[9px] font-semibold uppercase tracking-wider text-slate-500 mb-1">Cannot</p>
                      <ul className="space-y-0.5">
                        {r.restrictions.map((c, i) => <li key={i} className="text-[10px] text-slate-500 leading-snug">✗ {c}</li>)}
                      </ul>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </DevCard>

          {/* ── SECTION 3 — Core Workflow ─────────────────────────────────── */}
          <DevCard title="Core Workflow" icon="🔄" number={3}>
            <div className="space-y-2">
              {WORKFLOW_STEPS.map((s, i) => (
                <div key={i} className="flex items-start gap-3">
                  <div className="flex flex-col items-center flex-shrink-0">
                    <div className="flex h-6 w-6 items-center justify-center rounded-full border border-slate-700 bg-slate-800 text-[9px] font-bold text-slate-400">
                      {i + 1}
                    </div>
                    {i < WORKFLOW_STEPS.length - 1 && (
                      <div className="mt-1 h-4 w-px bg-slate-800" />
                    )}
                  </div>
                  <div className="flex-1 pb-3">
                    <div className="flex items-center gap-2 mb-0.5">
                      <p className="text-xs font-semibold text-slate-200">{s.step}</p>
                      <span className={`text-[9px] font-semibold ${workflowActor[s.actor] ?? "text-slate-500"}`}>
                        {s.actor}
                      </span>
                    </div>
                    <p className="text-[10px] text-slate-500 leading-relaxed mb-1">{s.detail}</p>
                    <div className="flex flex-wrap gap-1">
                      {s.tables.map((t) => (
                        <code key={t} className="rounded bg-slate-800 px-1.5 py-0.5 text-[9px] text-blue-300">{t}</code>
                      ))}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </DevCard>

          {/* ── SECTION 4 — Module Map ────────────────────────────────────── */}
          <DevCard title="Module Map" icon="🗺" number={4}>
            <div className="rounded-xl border border-slate-800 overflow-hidden">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-slate-800 bg-slate-900/80">
                    <th className="px-3 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wider text-slate-500">Module</th>
                    <th className="px-3 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wider text-slate-500">Status</th>
                    <th className="px-3 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wider text-slate-500 hidden sm:table-cell">Key Tables</th>
                    <th className="px-3 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wider text-slate-500">Description</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/50">
                  {MODULES.map((m) => (
                    <tr key={m.name} className="hover:bg-slate-800/20 transition-colors">
                      <td className="px-3 py-2.5">
                        <p className="text-xs font-semibold text-slate-200 whitespace-nowrap">{m.name}</p>
                        <code className="text-[9px] text-slate-600">{m.path.length > 40 ? m.path.substring(0, 40) + "…" : m.path}</code>
                      </td>
                      <td className="px-3 py-2.5 whitespace-nowrap">
                        <span className={`rounded-full border px-2 py-0.5 text-[9px] font-semibold ${statusColor[m.status]}`}>
                          {m.status}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 hidden sm:table-cell max-w-[160px]">
                        <div className="flex flex-wrap gap-0.5">
                          {m.mainTables.slice(0, 3).map((t) => (
                            <code key={t} className="rounded bg-slate-800/80 px-1 py-0.5 text-[8px] text-blue-300/80">{t}</code>
                          ))}
                          {m.mainTables.length > 3 && (
                            <span className="text-[8px] text-slate-600">+{m.mainTables.length - 3}</span>
                          )}
                        </div>
                      </td>
                      <td className="px-3 py-2.5 text-[10px] text-slate-500 max-w-[240px] leading-relaxed">
                        {m.description.substring(0, 120)}{m.description.length > 120 ? "…" : ""}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </DevCard>

          {/* ── SECTION 5 — Database Map ──────────────────────────────────── */}
          <DevCard title="Database Map" icon="🗄" number={5}>
            <div className="rounded-xl border border-slate-800 overflow-hidden">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-slate-800 bg-slate-900/80">
                    <th className="px-3 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wider text-slate-500">Table</th>
                    <th className="px-3 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wider text-slate-500">Description</th>
                    <th className="px-3 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wider text-slate-500 hidden md:table-cell">Key Columns</th>
                    <th className="px-3 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wider text-slate-500 hidden lg:table-cell">Used By</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/50">
                  {DB_TABLES.map((t) => (
                    <tr key={t.table} className="hover:bg-slate-800/20 transition-colors">
                      <td className="px-3 py-2.5 whitespace-nowrap">
                        <code className="text-[10px] font-mono text-blue-300">{t.table}</code>
                      </td>
                      <td className="px-3 py-2.5 text-[10px] text-slate-400 max-w-[200px] leading-relaxed">
                        {t.description.substring(0, 90)}{t.description.length > 90 ? "…" : ""}
                      </td>
                      <td className="px-3 py-2.5 hidden md:table-cell">
                        <div className="flex flex-wrap gap-0.5">
                          {t.keyColumns.slice(0, 3).map((c) => (
                            <code key={c} className="rounded bg-slate-800/80 px-1 py-0.5 text-[8px] text-slate-400">{c}</code>
                          ))}
                          {t.keyColumns.length > 3 && (
                            <span className="text-[8px] text-slate-600">+{t.keyColumns.length - 3}</span>
                          )}
                        </div>
                      </td>
                      <td className="px-3 py-2.5 hidden lg:table-cell text-[10px] text-slate-600 max-w-[160px]">
                        {t.usedBy.substring(0, 60)}{t.usedBy.length > 60 ? "…" : ""}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </DevCard>

          {/* ── SECTION 6 — Environment Variables ────────────────────────── */}
          <DevCard title="Environment Variables" icon="⚙" number={6}>
            <div className="mb-3 rounded-lg border border-blue-500/15 bg-blue-950/10 px-4 py-2.5">
              <p className="text-[10px] text-blue-300/70">Variable names only — <strong className="text-blue-300">no secret values are shown or transmitted.</strong> Live status detected from the running server via /api/pilot-status.</p>
            </div>
            <div className="rounded-xl border border-slate-800 overflow-hidden">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-slate-800 bg-slate-900/80">
                    <th className="px-3 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wider text-slate-500">Variable</th>
                    <th className="px-3 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wider text-slate-500">Scope</th>
                    <th className="px-3 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wider text-slate-500">Req</th>
                    <th className="px-3 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wider text-slate-500 hidden sm:table-cell">Status</th>
                    <th className="px-3 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wider text-slate-500 hidden md:table-cell">Fallback</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/50">
                  {ENV_VARS.map((v) => {
                    let liveStatus: "configured" | "missing" | "simulated" = "missing";
                    if (pilotStatus) {
                      if (v.name === "NEXT_PUBLIC_SUPABASE_URL")    liveStatus = pilotStatus.supabaseUrl      ? "configured" : "missing";
                      else if (v.name === "NEXT_PUBLIC_SUPABASE_ANON_KEY") liveStatus = pilotStatus.supabaseAnonKey  ? "configured" : "missing";
                      else if (v.name === "SUPABASE_SERVICE_ROLE_KEY")     liveStatus = pilotStatus.serviceRoleKey   ? "configured" : "missing";
                      else if (v.name === "NEXT_PUBLIC_APP_URL")           liveStatus = pilotStatus.appUrl           ? "configured" : "missing";
                      else if (v.name === "NEXT_PUBLIC_STORAGE_BUCKET")    liveStatus = pilotStatus.storageBucket    ? "configured" : "simulated";
                      else if (v.name === "NEXT_PUBLIC_INVITE_BASE_URL")   liveStatus = pilotStatus.inviteLinkBase   ? "configured" : "simulated";
                      else if (v.name.startsWith("RESEND") || v.name.startsWith("SENDGRID")) liveStatus = pilotStatus.emailProvider ? "configured" : "simulated";
                      else if (v.name === "OPENAI_API_KEY")                liveStatus = pilotStatus.openAiConfigured ? "configured" : "simulated";
                      else if (v.name === "TRACKING_API_KEY")              liveStatus = pilotStatus.trackingApiConfigured ? "configured" : "simulated";
                      else if (v.name === "NODE_ENV")                      liveStatus = pilotStatus.appEnv === "production" ? "configured" : "simulated";
                    }
                    const badgeCls =
                      liveStatus === "configured" ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-400" :
                      liveStatus === "simulated"   ? "border-amber-500/30 bg-amber-500/10 text-amber-400" :
                                                    "border-red-500/30 bg-red-500/10 text-red-400";
                    return (
                      <tr key={v.name} className="hover:bg-slate-800/20 transition-colors">
                        <td className="px-3 py-2.5">
                          <code className="text-[10px] font-mono text-blue-300">{v.name}</code>
                        </td>
                        <td className="px-3 py-2.5">
                          <span className={`rounded-full border px-1.5 py-0 text-[9px] font-semibold ${v.scope === "server" ? "border-purple-500/30 bg-purple-500/10 text-purple-400" : "border-slate-700 bg-slate-800 text-slate-500"}`}>
                            {v.scope}
                          </span>
                        </td>
                        <td className="px-3 py-2.5">
                          <span className={`text-[10px] font-bold ${v.required ? "text-red-400" : "text-slate-700"}`}>
                            {v.required ? "✱" : "—"}
                          </span>
                        </td>
                        <td className="px-3 py-2.5 hidden sm:table-cell">
                          {pilotStatus ? (
                            <span className={`rounded-full border px-1.5 py-0 text-[9px] font-semibold ${badgeCls}`}>
                              {liveStatus}
                            </span>
                          ) : (
                            <span className="text-[9px] text-slate-700 animate-pulse">checking…</span>
                          )}
                        </td>
                        <td className="px-3 py-2.5 hidden md:table-cell text-[10px] text-slate-600 max-w-[200px]">
                          {v.defaultOrFallback.substring(0, 60)}{v.defaultOrFallback.length > 60 ? "…" : ""}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </DevCard>

          {/* ── SECTION 7 — External Integrations ────────────────────────── */}
          <DevCard title="External Integrations Status" icon="🔌" number={7}>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {INTEGRATIONS.map((i) => (
                <div key={i.name} className="flex items-start gap-3 rounded-lg border border-slate-800 bg-slate-900/50 px-3 py-3">
                  <span className="text-lg flex-shrink-0">{i.icon}</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <p className="text-xs font-semibold text-slate-200">{i.name}</p>
                      <span className={`rounded-full border px-1.5 py-0 text-[9px] font-semibold ${statusColor[i.status]}`}>
                        {i.status.replace("-", " ")}
                      </span>
                    </div>
                    <p className="text-[10px] text-slate-500 leading-relaxed mb-1">{i.detail}</p>
                    <p className="text-[9px] text-slate-700 italic">{i.condition}</p>
                  </div>
                </div>
              ))}
            </div>
          </DevCard>

          {/* ── SECTION 8 — Known Technical Risks ────────────────────────── */}
          <DevCard title="Known Technical Risks" icon="⚠" number={8}>
            <div className="space-y-3">
              {TECH_RISKS.map((r) => (
                <div key={r.title} className={`rounded-xl border ${severityColor[r.severity]} px-4 py-3.5`}>
                  <div className="flex items-center gap-2 mb-1.5">
                    <span className={`rounded-full border px-2 py-0.5 text-[9px] font-bold uppercase ${severityBadge[r.severity]}`}>
                      {r.severity}
                    </span>
                    <p className="text-xs font-semibold text-slate-200">{r.title}</p>
                  </div>
                  <p className="text-[10px] text-slate-400 leading-relaxed mb-2">{r.detail}</p>
                  <div className="flex items-start gap-1.5">
                    <span className="text-emerald-500 text-[10px] flex-shrink-0 mt-0.5">→</span>
                    <p className="text-[10px] text-emerald-400/80 leading-relaxed">{r.mitigation}</p>
                  </div>
                </div>
              ))}
            </div>
          </DevCard>

          {/* ── SECTION 9 — Productionization Roadmap ────────────────────── */}
          <DevCard title="Productionization Roadmap" icon="🗓" number={9}>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {ROADMAP.map((p) => {
                const c = phaseColor[p.color];
                return (
                  <div key={p.phase} className={`rounded-xl border ${c.border} p-4`}>
                    <div className="flex items-center gap-2 mb-3">
                      <span className={`rounded-full border px-2 py-0.5 text-[9px] font-bold ${c.border} ${c.bg} ${c.text}`}>
                        {p.phase}
                      </span>
                      <p className={`text-[11px] font-semibold ${c.text}`}>{p.label}</p>
                    </div>
                    <ul className="space-y-1.5">
                      {p.items.map((item, i) => (
                        <li key={i} className="flex items-start gap-1.5 text-[10px] text-slate-400 leading-snug">
                          <span className={`flex-shrink-0 mt-0.5 ${c.text} opacity-60`}>•</span>
                          {item}
                        </li>
                      ))}
                    </ul>
                  </div>
                );
              })}
            </div>
          </DevCard>

          {/* ── SECTION 10 — Developer Checklist ─────────────────────────── */}
          <DevCard title="Developer Checklist" icon="☑" number={10}>
            {/* Progress */}
            <div className="flex items-center gap-3 mb-4">
              <div className="flex-1 h-2 rounded-full bg-slate-800 overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-500 ${pct >= 90 ? "bg-emerald-500" : pct >= 70 ? "bg-blue-500" : pct >= 50 ? "bg-amber-500" : "bg-red-500"}`}
                  style={{ width: `${pct}%` }}
                />
              </div>
              <span className="text-xs font-bold tabular-nums text-slate-300 w-32 text-right flex-shrink-0">
                {checked}/{total} ({Math.round(pct)}%)
              </span>
              <button type="button"
                onClick={() => { setChecklist({}); try { localStorage.removeItem(CHECKLIST_KEY); } catch { /* ignore */ } }}
                className="text-[10px] text-slate-700 hover:text-slate-500 transition-colors"
              >
                Reset
              </button>
            </div>

            <div className="space-y-2">
              {DEV_CHECKLIST.map((item) => {
                const isChecked = !!checklist[item.id];
                return (
                  <label
                    key={item.id}
                    className={`flex items-start gap-3 rounded-lg border px-4 py-3 cursor-pointer transition-colors ${
                      isChecked
                        ? "border-emerald-500/25 bg-emerald-500/5"
                        : item.critical
                        ? "border-red-500/20 bg-red-500/5 hover:bg-red-500/8"
                        : "border-slate-800 bg-slate-900/40 hover:bg-slate-800/40"
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={isChecked}
                      onChange={() => toggleCheck(item.id)}
                      className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 accent-emerald-500"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className={`text-xs font-semibold ${isChecked ? "text-emerald-300" : item.critical ? "text-red-300" : "text-slate-300"}`}>
                          {item.label}
                        </p>
                        {item.critical && !isChecked && (
                          <span className="rounded-full border border-red-500/30 bg-red-500/10 px-1.5 py-0 text-[9px] font-semibold text-red-400">Required</span>
                        )}
                      </div>
                      <p className="mt-0.5 text-[10px] text-slate-600 leading-relaxed">{item.hint}</p>
                    </div>
                  </label>
                );
              })}
            </div>
            {!critPassed && (
              <div className="mt-3 rounded-lg border border-red-500/25 bg-red-950/10 px-4 py-2.5">
                <p className="text-xs text-red-400">
                  ⚠ <strong>{DEV_CHECKLIST.filter((c) => c.critical && !checklist[c.id]).length} required item(s) incomplete.</strong>{" "}
                  Do not hand over to external developers or deploy to production until all Required items are confirmed.
                </p>
              </div>
            )}
          </DevCard>

          {/* ── SECTION 11 — Export Handover Pack ────────────────────────── */}
          <DevCard title="Export Handover Pack" icon="📤" number={11}>
            <p className="mb-4 text-xs text-slate-400">
              Three export formats available. Markdown is best for pasting into Notion, Confluence, or a README. JSON includes full module metadata for tooling. Print opens the browser print dialog for PDF export.
            </p>
            <div className="flex items-center gap-3 flex-wrap">
              <button type="button" onClick={handleCopyMd}
                className={`rounded-lg border px-5 py-2.5 text-sm font-semibold transition-colors ${copiedMd ? "border-emerald-500/40 bg-emerald-500/15 text-emerald-400" : "border-slate-700 bg-slate-800 text-slate-300 hover:bg-slate-700"}`}>
                {copiedMd ? "✓ Markdown Copied!" : "⎘ Copy Markdown"}
              </button>
              <button type="button" onClick={handleCopyJson}
                className={`rounded-lg border px-5 py-2.5 text-sm font-semibold transition-colors ${copiedJson ? "border-emerald-500/40 bg-emerald-500/15 text-emerald-400" : "border-slate-700 bg-slate-800 text-slate-300 hover:bg-slate-700"}`}>
                {copiedJson ? "✓ JSON Copied!" : "⎘ Copy JSON"}
              </button>
              <button type="button" onClick={() => window.print()}
                className="rounded-lg border border-blue-600/40 bg-blue-600/15 px-5 py-2.5 text-sm font-semibold text-blue-400 hover:bg-blue-600/25 transition-colors">
                🖨 Print / PDF
              </button>
            </div>

            {/* Quick stats */}
            <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
              {[
                { label: "Modules",       value: MODULES.length },
                { label: "DB Tables",     value: DB_TABLES.length },
                { label: "Env Variables", value: ENV_VARS.length },
                { label: "Tech Risks",    value: TECH_RISKS.length },
              ].map(({ label, value }) => (
                <div key={label} className="rounded-lg border border-slate-800 bg-slate-900/50 px-4 py-3 text-center">
                  <p className="text-2xl font-bold text-slate-200">{value}</p>
                  <p className="text-[10px] text-slate-500 uppercase tracking-wider">{label}</p>
                </div>
              ))}
            </div>
          </DevCard>

        </main>
      </div>
    </>
  );
}

// ─── Sub-component ────────────────────────────────────────────────────────────

function DevCard({ title, icon, number, children }: {
  title: string; icon: string; number: number; children: React.ReactNode;
}) {
  return (
    <section className="dev-card rounded-xl border border-slate-800 bg-slate-900/60 overflow-hidden">
      <div className="dev-card-header flex items-center gap-3 border-b border-slate-800 bg-slate-900/80 px-5 py-3">
        <span className="flex h-6 w-6 items-center justify-center rounded-full border border-slate-700 bg-slate-800 text-[10px] font-bold text-slate-400 flex-shrink-0">
          {number}
        </span>
        <span className="mr-1">{icon}</span>
        <h2 className="text-[11px] font-bold uppercase tracking-wider text-slate-400">{title}</h2>
      </div>
      <div className="p-5">{children}</div>
    </section>
  );
}
