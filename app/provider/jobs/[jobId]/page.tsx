"use client";
import { use, useState, useEffect, useRef, useCallback } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";
import { OPTIONAL_MODULES_DISABLED } from "@/lib/appEnv";
import { insertAuditLog } from "@/lib/auditLog";
import { JobFlowTracker } from "@/components/JobFlowTracker";
import { DocumentUpload } from "@/components/DocumentUpload";
import { DocumentList } from "@/components/DocumentList";
import { LogoutButton } from "@/components/LogoutButton";
import { InviteLink } from "@/components/InviteLink";
import { SendInviteEmail } from "@/components/SendInviteEmail";
import { useAuth } from "@/contexts/AuthContext";
import { PilotBanner } from "@/components/PilotBanner";
import { NexumBrainPanel } from "@/components/NexumBrainPanel";
import { DocumentIntelligencePanel } from "@/components/DocumentIntelligencePanel";
import { TradeDocumentUploadPanel } from "@/components/TradeDocumentUploadPanel";
import { ExceptionPanel } from "@/components/ExceptionPanel";
import { ShipmentTrackingPanel } from "@/components/ShipmentTrackingPanel";
import { DelayImpactCard } from "@/components/DelayImpactCard";
import { NotificationBell } from "@/components/NotificationBell";
import { createNotification } from "@/lib/notifications";
import { WorkflowTaskPanel } from "@/components/WorkflowTaskPanel";
import { JobDocumentPanel } from "@/components/JobDocumentPanel";
import { BusinessContextPanel } from "@/components/BusinessContextPanel";
import { CommunicationLogCard } from "@/components/CommunicationLogCard";
import { PaymentLedgerCard } from "@/components/PaymentLedgerCard";
import { PaymentHoldingCard } from "@/components/PaymentHoldingCard";
import { ReleaseSettlementCard } from "@/components/ReleaseSettlementCard";
import { DeliveryConfirmationCard } from "@/components/DeliveryConfirmationCard";
import { DisputeCaseCard } from "@/components/DisputeCaseCard";
import { PayoutProfileCard } from "@/components/PayoutProfileCard";
import { EvidencePackCard } from "@/components/EvidencePackCard";
import { NetSettlementCard } from "@/components/NetSettlementCard";
import { JobTermsSnapshotCard } from "@/components/JobTermsSnapshotCard";
import { ChangeRequestCard } from "@/components/ChangeRequestCard";
import { HsCodeCard } from "@/components/HsCodeCard";
import { SupplierProfileCard, SupplierProfileEmptyCard } from "@/components/SupplierProfileCard";
import { SupplierPaymentProtectionCard } from "@/components/SupplierPaymentProtectionCard";
import { SupplierMilestoneEvidenceCard } from "@/components/SupplierMilestoneEvidenceCard";
import { ActionRecommendationCard } from "@/components/ActionRecommendationCard";
import type { JobSupplierLink } from "@/lib/supplierProfile";

// ─── Types ────────────────────────────────────────────────────────────────────

interface JobRow {
  job_reference:    string;
  service_provider: string;
  customer:         string;
  service_type:     string;
  route:            string;
  cargo_description: string;
  currency:         string;
  job_value:        number;
  payment_terms:    string;
  required_deposit: number | null;
  balance_terms:    string | null;
  payment_status:   string;
  job_status:       string;
  current_milestone: string;
  risk_level:       string;
  invite_token:     string | null;
  customer_email:   string | null;
  customer_company_id: string | null;
  delivery_confirmation_status: string | null;
  created_at:       string;
  updated_at:       string;
  // Commercial Value
  incoterm?:                    string | null;
  cargo_value_amount?:          number | null;
  cargo_value_currency?:        string | null;
  cargo_value_fx_rate_to_base?: number | null;
  cargo_value_base_amount?:     number | null;
  logistics_fee_amount?:        number | null;
  logistics_fee_currency?:      string | null;
  duty_tax_estimate_amount?:    number | null;
  duty_tax_currency?:           string | null;
  insurance_cost_amount?:       number | null;
  insurance_cost_currency?:     string | null;
  additional_charges_amount?:   number | null;
  additional_charges_currency?: string | null;
  total_secured_amount?:        number | null;
  total_secured_currency?:      string | null;
  base_currency?:               string | null;
  // HS Code / Customs
  hs_code?:                     string | null;
  hs_code_description?:         string | null;
  hs_code_source?:              string | null;
  commodity_category?:          string | null;
  permit_required?:             boolean | null;
  permit_note?:                 string | null;
  customs_risk_level?:          string | null;
  duty_rate_estimate?:          number | null;
  tax_rate_estimate?:           number | null;
  // Added by secured_jobs_scope_complete_v1.sql (type-only; not in SELECT_COLS until migration applied)
  secure_logistics_fee?:          boolean | null;
  secure_cargo_supplier_payment?: boolean | null;
  secure_duty_tax?:               boolean | null;
  secure_insurance?:              boolean | null;
  secure_additional_charges?:     boolean | null;
  payment_scope_note?:            string | null;
  secured_amount_note?:           string | null;
  total_secured_base_amount?:     number | null;
}

interface AuditLogRow {
  id:            string;
  actor_role:    string;
  actor_name:    string;
  action:        string;
  description:   string;
  created_at:    string;
}

type FetchState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "notfound" }
  | { status: "success"; job: JobRow };

type ActionType = "pickup" | "delivered" | "pod";

// ─── Colour maps ──────────────────────────────────────────────────────────────

const paymentColors: Record<string, string> = {
  "Payment Pending":             "bg-amber-500/15 text-amber-400 border-amber-500/30",
  "Deposit Proof Uploaded":      "bg-amber-500/15 text-amber-400 border-amber-500/30",
  "Full Payment Proof Uploaded": "bg-amber-500/15 text-amber-400 border-amber-500/30",
  "Deposit Confirmed":           "bg-blue-500/15 text-blue-400 border-blue-500/30",
  "Balance Pending":             "bg-purple-500/15 text-purple-400 border-purple-500/30",
  "Fully Paid":                  "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
  "Disputed":                    "bg-red-500/15 text-red-400 border-red-500/30",
  "Refunded":                    "bg-slate-500/15 text-slate-400 border-slate-500/30",
};

const jobStatusColors: Record<string, string> = {
  "Awaiting Customer Acceptance": "bg-amber-500/15 text-amber-400 border-amber-500/30",
  "Awaiting Deposit":             "bg-amber-500/15 text-amber-400 border-amber-500/30",
  "Ready for Execution":          "bg-blue-500/15 text-blue-400 border-blue-500/30",
  "In Progress":                  "bg-blue-500/15 text-blue-400 border-blue-500/30",
  "Delivered":                    "bg-purple-500/15 text-purple-400 border-purple-500/30",
  "Completed":                    "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
  "Disputed":                     "bg-red-500/15 text-red-400 border-red-500/30",
  "Cancelled":                    "bg-slate-500/15 text-slate-400 border-slate-500/30",
};

const riskColors: Record<string, string> = {
  Low:    "bg-emerald-500/10 text-emerald-400 border-emerald-500/30",
  Medium: "bg-amber-500/10 text-amber-400 border-amber-500/30",
  High:   "bg-red-500/10 text-red-400 border-red-500/30",
};

const roleColors: Record<string, string> = {
  admin:    "bg-blue-500/15 text-blue-400 border-blue-500/30",
  provider: "bg-purple-500/15 text-purple-400 border-purple-500/30",
  customer: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
};

// ─── Helper ───────────────────────────────────────────────────────────────────

function formatValue(amount: number, currency: string): string {
  return `${currency} ${new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount)}`;
}

const SELECT_COLS =
  "job_reference, service_provider, customer, service_type, route, cargo_description, currency, job_value, payment_terms, required_deposit, balance_terms, payment_status, job_status, current_milestone, risk_level, invite_token, customer_email, customer_company_id, delivery_confirmation_status, created_at, updated_at, incoterm, cargo_value_amount, cargo_value_currency, cargo_value_fx_rate_to_base, cargo_value_base_amount, logistics_fee_amount, logistics_fee_currency, duty_tax_estimate_amount, duty_tax_currency, insurance_cost_amount, insurance_cost_currency, additional_charges_amount, additional_charges_currency, total_secured_amount, total_secured_currency, base_currency, hs_code, hs_code_description, hs_code_source, commodity_category, permit_required, permit_note, customs_risk_level, duty_rate_estimate, tax_rate_estimate";

function isFullPaymentJob(job: { payment_terms: string; required_deposit: number | null; job_value: number }): boolean {
  return (
    job.payment_terms.toLowerCase().includes("full payment") ||
    (job.required_deposit !== null && job.required_deposit >= job.job_value)
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function ProviderJobDetailPage({
  params,
}: {
  params: Promise<{ jobId: string }>;
}) {
  // All useState calls must come before use()
  const { profile } = useAuth();
  const [fetchState, setFetchState]       = useState<FetchState>({ status: "loading" });
  const [actionLoading, setActionLoading] = useState(false);
  const [actionError, setActionError]     = useState("");
  const [lastAction, setLastAction]       = useState<ActionType | null>(null);
  const [showDocModal, setShowDocModal]   = useState(false);
  const [docRefreshKey,      setDocRefreshKey]      = useState(0);
  const [trackingRefreshKey, setTrackingRefreshKey] = useState(0);
  const [logs, setLogs]                   = useState<AuditLogRow[]>([]);
  const [supplierLinks, setSupplierLinks] = useState<JobSupplierLink[]>([]);
  const [pageTimedOut, setPageTimedOut]   = useState(false);
  const [coreOnly, setCoreOnly]           = useState(OPTIONAL_MODULES_DISABLED);
  const [bgLoading, setBgLoading]         = useState(false);
  const timerRef   = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountedRef = useRef(true);
  const [repairLoading, setRepairLoading] = useState(false);
  const [repairResult,  setRepairResult]  = useState<string | null>(null);
  const [repairDetail,  setRepairDetail]  = useState<{
    checklist?:      Record<string, string>;
    errors?:         Record<string, { diagnosis?: string; code?: string; message?: string; details?: string; hint?: string }>;
    optionalErrors?: Record<string, { diagnosis?: string; code?: string; message?: string; details?: string; hint?: string }>;
    optionalSteps?:  string[];
    success?:        boolean;
  } | null>(null);
  // "checking" = GET in-flight (hides banner to avoid flash of warning)
  // "complete"  = all 3 core records exist → soft notice
  // "incomplete" = one or more core records missing → scary warning + repair button
  const [coreSetupStatus, setCoreSetupStatus] = useState<"checking" | "complete" | "incomplete">("checking");
  // Controls the "Show technical details" toggle in the repair result panel.
  // Resets to false each time a new repair is triggered.
  const [showOptionalDetails, setShowOptionalDetails] = useState(false);

  const { jobId } = use(params);

  const loadLogs = useCallback(async () => {
    try {
      const { data } = await supabase
        .from("audit_logs")
        .select("id, actor_role, actor_name, action, description, created_at")
        .eq("job_reference", jobId)
        .order("created_at", { ascending: false })
        .limit(10);
      if (mountedRef.current) setLogs((data as AuditLogRow[]) ?? []);
    } catch { /* non-blocking */ }
  }, [jobId]);

  const loadSupplierLinks = useCallback(async () => {
    try {
      const { data: session } = await supabase.auth.getSession();
      const token = session.session?.access_token;
      if (!token) return;
      const res = await fetch(`/api/job-supplier-links?job_reference=${jobId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok && mountedRef.current) {
        const { data } = (await res.json()) as { data: JobSupplierLink[] };
        setSupplierLinks(data ?? []);
      }
    } catch { /* non-blocking */ }
  }, [jobId]);

  const loadJob = useCallback(async () => {
    timerRef.current = setTimeout(() => {
      if (mountedRef.current) setPageTimedOut(true);
    }, 10000);

    try {
      const { data, error } = await supabase
        .from("secured_jobs")
        .select(SELECT_COLS)
        .eq("job_reference", jobId)
        .eq("service_provider_company_id", profile?.company_id ?? null)
        .maybeSingle();

      if (!mountedRef.current) return;
      if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null; }

      if (error) {
        setFetchState({ status: "error", message: error.message });
      } else if (!data) {
        setFetchState({ status: "notfound" });
      } else {
        setFetchState({ status: "success", job: data as JobRow });
        setBgLoading(true);
        void Promise.all([loadLogs(), loadSupplierLinks()]).finally(() => {
          if (mountedRef.current) setBgLoading(false);
        });
      }
    } catch (err) {
      if (!mountedRef.current) return;
      if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null; }
      setFetchState({ status: "error", message: String(err) });
    }
  }, [jobId, profile?.company_id, loadLogs, loadSupplierLinks]);

  // Calls GET /api/repair-job-setup to check whether the three core records
  // (payment_obligations, held_payments, job_terms_snapshot) already exist.
  // Result drives the banner: "complete" = soft notice, "incomplete" = warning.
  async function checkCoreSetup(jobRef: string) {
    try {
      const res = await fetch(`/api/repair-job-setup?job_reference=${encodeURIComponent(jobRef)}`);
      if (!res.ok) { setCoreSetupStatus("incomplete"); return; }
      const ct = res.headers.get("content-type") ?? "";
      if (!ct.includes("application/json")) { setCoreSetupStatus("incomplete"); return; }
      const body = await res.json() as {
        checklist?: { payment_obligations?: boolean; held_payments?: boolean; job_terms_snapshot?: boolean };
      };
      const cl = body.checklist ?? {};
      setCoreSetupStatus(
        (cl.payment_obligations && cl.held_payments && cl.job_terms_snapshot) ? "complete" : "incomplete",
      );
    } catch {
      setCoreSetupStatus("incomplete");
    }
  }

  useEffect(() => {
    if (!profile) return;
    mountedRef.current = true;
    setFetchState({ status: "loading" });
    setPageTimedOut(false);
    setCoreSetupStatus("checking");
    void loadJob();
    return () => {
      mountedRef.current = false;
      if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null; }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobId, profile?.company_id]);

  // Once the job row is available, check whether core setup records exist.
  // Only relevant on the "Job Created" milestone; ignored for all others.
  const _setupCheckRef       = fetchState.status === "success" ? fetchState.job.job_reference    : null;
  const _setupCheckMilestone = fetchState.status === "success" ? fetchState.job.current_milestone : null;

  useEffect(() => {
    if (!_setupCheckRef || _setupCheckMilestone !== "Job Created") return;
    void checkCoreSetup(_setupCheckRef);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [_setupCheckRef, _setupCheckMilestone]);

  async function handleAction(type: ActionType) {
    setActionLoading(true);
    setActionError("");

    const currentJob = fetchState.status === "success" ? fetchState.job : null;

    // ── Non-POD actions (pickup / delivered) ───────────────────────────────
    if (type !== "pod") {
      const payloadMap: Record<Exclude<ActionType, "pod">, Record<string, string>> = {
        pickup: {
          job_status:        "In Progress",
          current_milestone: "Pickup Completed",
          updated_at:        new Date().toISOString(),
        },
        delivered: {
          job_status:        "Delivered",
          current_milestone: "Delivered",
          updated_at:        new Date().toISOString(),
        },
      };
      const descriptions: Record<Exclude<ActionType, "pod">, string> = {
        pickup:    "Provider marked pickup as completed. Job is now in progress.",
        delivered: "Provider confirmed delivery. Awaiting proof of delivery submission.",
      };
      const { error } = await supabase
        .from("secured_jobs")
        .update(payloadMap[type])
        .eq("job_reference", jobId);
      if (error) { setActionError(error.message); setActionLoading(false); return; }
      await insertAuditLog({
        job_reference: jobId, actor_role: "provider",
        actor_name: profile?.full_name ?? "Service Provider",
        action: type, description: descriptions[type],
      });
      setLastAction(type);
      await loadJob();
      await loadLogs();
      setActionLoading(false);
      return;
    }

    // ── POD action — triggers Delivery Confirmation layer ──────────────────
    // Only update the job to "POD Uploaded" milestone here.
    // The delivery_confirmation route handles the full status transition.
    const { error: jobErr } = await supabase
      .from("secured_jobs")
      .update({
        job_status:        "Delivered",
        current_milestone: "POD Uploaded — Awaiting Customer Confirmation",
        updated_at:        new Date().toISOString(),
      })
      .eq("job_reference", jobId);

    if (jobErr) { setActionError(jobErr.message); setActionLoading(false); return; }

    await insertAuditLog({
      job_reference: jobId,
      actor_role:    "provider",
      actor_name:    profile?.full_name ?? "Service Provider",
      action:        "pod",
      description:   "Provider submitted Proof of Delivery. Delivery confirmation request sent to customer — 48 working hours to confirm or dispute.",
    });

    // Notify admin of POD
    await createNotification({
      jobReference: jobId, recipientRole: "admin",
      notificationType: "Other", priority: "High",
      title: `POD submitted — Job ${jobId} — awaiting customer confirmation`,
      message: "Provider has uploaded Proof of Delivery. Customer has been notified and has 48 working hours to confirm or dispute receipt.",
      actionUrl: `/admin/jobs/${jobId}`,
      actorId: profile?.id, actorName: profile?.full_name ?? "Service Provider", actorRole: "service_provider",
    });

    // Call the delivery confirmation API to create the confirmation row + notify customer + create task
    const { data: { session } } = await supabase.auth.getSession();
    const token = session?.access_token ?? null;

    await fetch("/api/delivery-confirmations", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({
        action:               "request",
        job_reference:        jobId,
        customer_company_id:  currentJob ? (currentJob as JobRow & { customer_company_id?: string }).customer_company_id : null,
        provider_company_id:  profile?.company_id ?? null,
        payment_terms:        currentJob?.payment_terms,
        required_deposit:     currentJob?.required_deposit,
        job_value:            currentJob?.job_value,
      }),
    });

    setLastAction("pod");
    await loadJob();
    await loadLogs();
    setActionLoading(false);
  }

  // ── Shared nav ──────────────────────────────────────────────────────────────
  const nav = (<>
    <header className="border-b border-slate-800 bg-slate-950/80 sticky top-0 z-50">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-6">
        <Link href="/" className="flex items-center gap-2 text-sm font-semibold">
          <span className="text-blue-400">&#9632;</span>
          Nexum SecureFlow
        </Link>
        <nav className="flex items-center gap-4 text-xs text-slate-400">
          <span className="rounded-full border border-purple-500/30 bg-purple-500/10 px-3 py-1 text-purple-400 font-medium">Provider</span>
          <Link href="/provider" className="hover:text-slate-100 transition-colors">Dashboard</Link>
          <Link href="/provider/jobs" className="hover:text-slate-100 transition-colors">My Jobs</Link>
          <Link href="/provider/payout-profile" className="hover:text-slate-100 transition-colors">Payout Profile</Link>
          <Link href="/provider/notifications" className="hover:text-slate-100 transition-colors">Notifications</Link>
          <NotificationBell />
          <LogoutButton />
        </nav>
      </div>
    </header>
    <PilotBanner />
  </>);

  // ── Loading ──────────────────────────────────────────────────────────────────
  if (fetchState.status === "loading") {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100 font-sans flex flex-col">
        {nav}
        <div className="flex flex-1 flex-col items-center justify-center gap-6 px-6 text-center">
          {!pageTimedOut ? (
            <>
              <div className="h-7 w-7 animate-spin rounded-full border-2 border-purple-500 border-t-transparent" />
              <p className="text-sm text-slate-400">Loading job {jobId}…</p>
            </>
          ) : (
            <div className="max-w-md w-full rounded-2xl border border-amber-500/30 bg-amber-500/5 px-6 py-6 text-left">
              <p className="mb-1 text-sm font-semibold text-amber-300">Job core data is taking too long</p>
              <p className="mb-4 text-xs text-slate-400">
                The query for <span className="font-mono text-slate-300">{jobId}</span> did not respond within 10 seconds.
              </p>
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={() => { setPageTimedOut(false); void loadJob(); }}
                  className="rounded-lg border border-purple-500/40 bg-purple-500/15 px-4 py-2 text-xs font-semibold text-purple-300 hover:bg-purple-500/25 active:scale-95 transition-all cursor-pointer"
                >
                  Retry
                </button>
                <button
                  onClick={() => { setCoreOnly(true); setPageTimedOut(false); void loadJob(); }}
                  className="rounded-lg border border-slate-600 bg-slate-800 px-4 py-2 text-xs font-semibold text-slate-300 hover:bg-slate-700 active:scale-95 transition-all cursor-pointer"
                >
                  Load core only
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  // ── Error ────────────────────────────────────────────────────────────────────
  if (fetchState.status === "error") {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100 font-sans flex flex-col">
        {nav}
        <main className="mx-auto w-full max-w-6xl px-6 py-10">
          <div className="mb-6 flex items-center gap-2 text-xs text-slate-500">
            <Link href="/provider/jobs" className="hover:text-slate-300 transition-colors">My Jobs</Link>
            <span>/</span>
            <span className="font-mono text-slate-400">{jobId}</span>
          </div>
          <div className="rounded-xl border border-red-500/30 bg-red-500/5 px-5 py-5">
            <p className="mb-1 text-sm font-semibold text-red-300">Failed to load job</p>
            <p className="font-mono text-xs text-red-400">{fetchState.message}</p>
          </div>
        </main>
      </div>
    );
  }

  // ── Not found ────────────────────────────────────────────────────────────────
  if (fetchState.status === "notfound") {
    return (
      <div className="min-h-screen bg-slate-950 font-sans flex flex-col">
        {nav}
        <div className="flex flex-1 flex-col items-center justify-center gap-4 px-6 text-center">
          <p className="font-mono text-6xl font-bold text-slate-800">404</p>
          <p className="text-slate-400">
            Job <span className="font-mono text-slate-300">{jobId}</span> was not found in your account.
          </p>
          <Link href="/provider/jobs" className="text-sm text-purple-400 hover:text-purple-300 transition-colors">
            ← Back to My Jobs
          </Link>
        </div>
      </div>
    );
  }

  // ── Repair handler (shared by both the warning button and the re-run link) ──
  async function runRepair() {
    if (fetchState.status !== "success") return;
    const jobRef = fetchState.job.job_reference;
    setRepairLoading(true);
    setRepairResult(null);
    setRepairDetail(null);
    setShowOptionalDetails(false);  // collapse tech details on each new run
    try {
      const res = await fetch("/api/repair-job-setup", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({
          job_reference: jobRef,
          actor_name:    profile?.full_name ?? "Provider",
        }),
      });

      type RepairJson = {
        success?:        boolean;
        message?:        string;
        repaired?:       string[];
        skipped?:        string[];
        errors?:         Record<string, { diagnosis?: string; code?: string; message?: string; details?: string; hint?: string }>;
        optionalErrors?: Record<string, { diagnosis?: string; code?: string; message?: string; details?: string; hint?: string }>;
        optionalSteps?:  string[];
        checklist?:      Record<string, string>;
        error?:          string;
        step?:           string;
        diagnosis?:      string;
        code?:           string;
      };
      let json: RepairJson = {};
      const ct = res.headers.get("content-type") ?? "";
      if (ct.includes("application/json")) {
        try { json = await res.json() as RepairJson; }
        catch { /* body was not parseable JSON */ }
      }

      console.warn("[repair-job-setup] response", res.status, json);

      if (!res.ok) {
        const diag = json.diagnosis ?? json.error ?? res.statusText ?? "Server error";
        setRepairResult(`Repair failed (HTTP ${res.status}): ${diag}`);
        setRepairDetail({ errors: json.errors, checklist: json.checklist });
        return;
      }

      setRepairResult(json.message ?? "Repair complete.");
      setRepairDetail({
        success:        json.success,
        checklist:      json.checklist,
        errors:         json.errors,
        optionalErrors: json.optionalErrors,
        optionalSteps:  json.optionalSteps,
      });

      // If core steps all succeeded, promote banner to soft "complete" notice
      if (json.success) setCoreSetupStatus("complete");

      const created = (json.repaired ?? []).filter(
        (r) => !["audit_log", "notification"].includes(r),
      );
      if (created.length > 0) void loadLogs();
    } catch (err) {
      console.warn("[repair-job-setup] fetch threw:", err);
      setRepairResult(`Repair failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setRepairLoading(false);
    }
  }

  // ── Success ──────────────────────────────────────────────────────────────────
  const { job } = fetchState;
  const isFullPayment = isFullPaymentJob(job);

  const awaitingAcceptance = job.job_status === "Awaiting Customer Acceptance";
  const awaitingDeposit    = (job.payment_status === "Payment Pending" || job.payment_status === "Awaiting Deposit Confirmation") && !awaitingAcceptance && job.job_status !== "Ready for Execution";

  const canAct =
    job.payment_status === "Deposit Confirmed" ||
    job.payment_status === "Fully Paid"        ||
    job.job_status === "Ready for Execution"   ||
    job.job_status === "In Progress"           ||
    job.job_status === "Delivered";

  const allDone = job.job_status === "Completed";

  const successMessages: Record<ActionType, string> = {
    pickup:    "Pickup completed. Job is now in progress — proceed to delivery.",
    delivered: "Delivery confirmed. Upload your proof of delivery document, then submit POD.",
    pod:       isFullPayment
      ? "POD submitted. Job is fully closed — full payment was already confirmed."
      : "POD submitted. Customer will now upload balance payment for admin verification.",
  };

  const canUploadDoc = canAct || allDone;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 font-sans flex flex-col">
      {nav}

      {/* ── Document upload modal ── */}
      <DocumentUpload
        isOpen={showDocModal}
        onClose={() => setShowDocModal(false)}
        onUploaded={() => {
          setDocRefreshKey((k) => k + 1);
          loadLogs();
        }}
        jobReference={jobId}
        allowedTypes={[
          "Commercial Invoice", "Packing List", "Bill of Lading", "Airway Bill",
          "Purchase Order", "Delivery Order", "Permit / License", "Inspection Report",
          "Pickup Proof", "Delivery Proof", "POD", "Other",
        ]}
        uploaderRole="provider"
        uploaderName={profile?.full_name ?? "Service Provider"}
      />

      <main className="mx-auto w-full max-w-6xl px-6 py-10">

        {/* Breadcrumb + stability controls */}
        <div className="mb-4 flex flex-wrap items-center gap-2 text-xs text-slate-500">
          <Link href="/provider/jobs" className="hover:text-slate-300 transition-colors">My Jobs</Link>
          <span>/</span>
          <span className="font-mono text-slate-400">{job.job_reference}</span>
          <span className="ml-auto flex items-center gap-2">
            {bgLoading && (
              <span className="flex items-center gap-1 text-slate-500">
                <span className="h-2.5 w-2.5 animate-spin rounded-full border border-slate-500 border-t-transparent" />
                loading…
              </span>
            )}
            <button
              onClick={() => setCoreOnly(v => !v)}
              className={`rounded px-2 py-0.5 text-[11px] font-medium transition-colors cursor-pointer ${coreOnly ? "border border-amber-500/40 bg-amber-500/10 text-amber-300" : "border border-slate-700 bg-slate-800 text-slate-400 hover:text-slate-300"}`}
            >
              {coreOnly ? "Core-only ON" : "Core-only mode"}
            </button>
          </span>
        </div>

        {coreOnly && (
          <div className="mb-4 flex items-center gap-3 rounded-xl border border-amber-500/30 bg-amber-500/5 px-4 py-2.5 text-xs text-amber-300">
            <span>Optional panels hidden for faster loading.</span>
            <button onClick={() => setCoreOnly(false)} className="ml-auto shrink-0 underline cursor-pointer">Show all</button>
          </div>
        )}

        {/* ── Setup repair banner — shown while job is on "Job Created" milestone ── */}
        {job.current_milestone === "Job Created" && coreSetupStatus !== "checking" && (
          <div className={`mb-6 rounded-xl border px-5 py-4 ${
            coreSetupStatus === "complete"
              ? "border-slate-600/30 bg-slate-900/40"
              : "border-amber-500/30 bg-amber-950/30"
          }`}>

            {coreSetupStatus === "complete" ? (
              /* ── Soft notice: core records confirmed ──────────────────── */
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="text-sm font-medium text-slate-300">✓ Core setup complete</p>
                  <p className="mt-0.5 text-xs text-slate-500">
                    Core setup complete. Optional notification/task records may be missing —
                    this does not affect job workflow.
                  </p>
                </div>
                <button
                  onClick={() => { void runRepair(); }}
                  disabled={repairLoading}
                  className="shrink-0 rounded border border-slate-600/40 bg-slate-800/40 px-3 py-1 text-xs text-slate-400 hover:bg-slate-700/40 transition-colors disabled:opacity-50"
                >
                  {repairLoading ? "Running…" : "Re-run repair"}
                </button>
              </div>
            ) : (
              /* ── Warning: setup records missing or incomplete ─────────── */
              <>
                <p className="text-sm font-semibold text-amber-300">⚙ Some setup records may still be pending</p>
                <p className="mt-0.5 text-xs text-slate-400">
                  Payment obligations, held payments, and other setup records are created in the background.
                  If something looks missing or cards below show empty, use the button below to run setup repair.
                </p>
                <div className="mt-3 flex flex-wrap items-start gap-3">
                  <button
                    onClick={() => { void runRepair(); }}
                    disabled={repairLoading}
                    className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-1.5 text-xs font-semibold text-amber-300 hover:bg-amber-500/20 transition-colors disabled:opacity-50"
                  >
                    {repairLoading ? "Running repair…" : "Repair Job Setup"}
                  </button>
                </div>
              </>
            )}

            {/* ── Repair result detail (renders in both complete + incomplete states) ── */}
            {repairResult && (() => {
              const optionalStepNames = repairDetail?.optionalSteps ?? ["notification", "workflow_tasks", "audit_log"];
              const optErrKeys        = Object.keys(repairDetail?.optionalErrors ?? {});
              const isFetchFailed     = repairResult.startsWith("Repair failed");
              const hasCoreErrors     = repairDetail?.success === false || isFetchFailed;
              // isWarn = core succeeded but optional steps had warnings
              const isWarn            = !hasCoreErrors && optErrKeys.length > 0;
              // isOk   = everything clean
              const isOk              = !hasCoreErrors && !isWarn;

              // ── Outer panel styling ──────────────────────────────────────
              // Core failure → red   |   optional-only warnings → green (non-scary)   |   clean → green
              const borderCls = hasCoreErrors
                ? "border-red-500/30 bg-red-950/40"
                : "border-emerald-500/20 bg-emerald-950/20";

              const titleCls = hasCoreErrors ? "text-red-300" : "text-emerald-300";

              // When core is fine, always show the calm success message
              const displayMessage = hasCoreErrors
                ? (isFetchFailed ? repairResult : `Core setup failed — check details below.`)
                : "Core setup complete. Optional notification/task setup can be repaired later.";

              return (
                <div className={`mt-3 rounded-lg border px-4 py-3 text-xs ${borderCls}`}>

                  {/* ── Status line ─────────────────────────────────────── */}
                  <p className={`font-semibold ${titleCls}`}>{displayMessage}</p>

                  {/* ── Per-step checklist ──────────────────────────────── */}
                  {repairDetail?.checklist && Object.keys(repairDetail.checklist).length > 0 && (
                    <div className="mt-2 space-y-0.5">
                      {Object.entries(repairDetail.checklist).map(([stepName, status]) => {
                        const isOpt = optionalStepNames.includes(stepName);
                        const icon =
                          status === "created"         ? "✓" :
                          status === "skipped"         ? "–" :
                          status === "error" && isOpt  ? "!" :
                          status === "error"           ? "✗" : "?";
                        const color =
                          status === "created"         ? "text-emerald-400" :
                          status === "skipped"         ? "text-slate-500"   :
                          status === "error" && isOpt  ? "text-amber-400"   :
                          status === "error"           ? "text-red-400"     : "text-slate-400";
                        return (
                          <div key={stepName} className="flex items-start gap-2 font-mono">
                            <span className={`shrink-0 ${color}`}>{icon}</span>
                            <span className={isOpt && status === "error" ? "text-amber-500/80" : "text-slate-400"}>
                              {stepName}
                              {isOpt && status === "error" && (
                                <span className="ml-1 text-amber-600/60">(optional)</span>
                              )}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {/* ── Core error detail cards — always visible when present ── */}
                  {repairDetail?.errors &&
                    Object.entries(repairDetail.errors).filter(([k]) => !optionalStepNames.includes(k)).length > 0 && (
                    <div className="mt-3 space-y-2">
                      {Object.entries(repairDetail.errors)
                        .filter(([k]) => !optionalStepNames.includes(k))
                        .map(([stepName, err]) => (
                          <div key={stepName} className="rounded border border-red-500/20 bg-red-950/30 px-3 py-2">
                            <p className="font-semibold text-red-300">{stepName}</p>
                            {err.diagnosis && <p className="mt-0.5 text-red-400">{err.diagnosis}</p>}
                            {err.code    && <p className="text-slate-500">code: {err.code}</p>}
                            {err.message && <p className="text-slate-500 break-words">message: {err.message}</p>}
                            {err.details && <p className="text-slate-500 break-words">details: {err.details}</p>}
                            {err.hint    && <p className="text-slate-500 break-words">hint: {err.hint}</p>}
                          </div>
                        ))}
                    </div>
                  )}

                  {/* ── Optional warnings — collapsed under toggle (non-blocking) ── */}
                  {isWarn && optErrKeys.length > 0 && (
                    <div className="mt-2">
                      <button
                        onClick={() => setShowOptionalDetails((v) => !v)}
                        className="flex items-center gap-1 text-slate-500 hover:text-slate-400 transition-colors"
                      >
                        <span className="text-[10px]">{showOptionalDetails ? "▾" : "▸"}</span>
                        <span>{showOptionalDetails ? "Hide technical details" : "Show technical details"}</span>
                      </button>

                      {showOptionalDetails && (
                        <div className="mt-2 space-y-2">
                          <p className="text-slate-500">
                            Optional step warnings — do not affect job workflow:
                          </p>
                          {Object.entries(repairDetail?.optionalErrors ?? {}).map(([stepName, err]) => (
                            <div key={stepName} className="rounded border border-slate-600/30 bg-slate-800/40 px-3 py-2">
                              <p className="font-semibold text-slate-300">{stepName}
                                <span className="ml-2 font-normal text-slate-500">(optional)</span>
                              </p>
                              {err.diagnosis && <p className="mt-0.5 text-slate-400">{err.diagnosis}</p>}
                              {err.code    && <p className="text-slate-500">code: {err.code}</p>}
                              {err.message && <p className="text-slate-500 break-words">message: {err.message}</p>}
                              {err.details && <p className="text-slate-500 break-words">details: {err.details}</p>}
                              {err.hint    && <p className="text-slate-500 break-words">hint: {err.hint}</p>}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Suppress unused-variable warnings from the ternary derivations */}
                  {(isOk) && null}
                </div>
              );
            })()}
          </div>
        )}

        {/* ── Awaiting customer acceptance — show invite link + email ── */}
        {awaitingAcceptance && (
          <div className="mb-6 flex flex-col gap-3">
            <InviteLink jobReference={job.job_reference} token={job.invite_token ?? ""} />
            <SendInviteEmail
              jobReference={job.job_reference}
              customerEmail={job.customer_email}
              serviceProvider={job.service_provider}
              serviceType={job.service_type}
              route={job.route}
              jobValue={job.job_value}
              currency={job.currency}
              paymentTerms={job.payment_terms}
              inviteToken={job.invite_token}
              actorRole="provider"
              actorName={profile?.full_name ?? "Service Provider"}
            />
          </div>
        )}

        {/* ── Awaiting deposit warning ── */}
        {awaitingDeposit && (
          <div className="mb-6 rounded-xl border border-amber-500/20 bg-amber-500/5 px-5 py-4">
            <p className="text-sm font-semibold text-amber-300">Waiting for customer to submit deposit</p>
            <p className="text-xs text-slate-400 mt-0.5">
              Job actions (pickup, delivery, POD) are locked until the customer pays the deposit and admin confirms it.
            </p>
          </div>
        )}

        {/* ── Action error ── */}
        {actionError && (
          <div className="mb-6 rounded-xl border border-red-500/30 bg-red-500/5 px-5 py-4">
            <p className="mb-1 text-sm font-semibold text-red-300">Action failed</p>
            <p className="font-mono text-xs text-red-400">{actionError}</p>
          </div>
        )}

        {/* ── Action success ── */}
        {lastAction && !actionError && !actionLoading && (
          <div className="mb-6 rounded-xl border border-emerald-500/30 bg-emerald-500/5 px-5 py-4">
            <p className="text-sm font-semibold text-emerald-300">✓ {successMessages[lastAction]}</p>
          </div>
        )}

        {/* ── Provider Job Actions ── */}
        {(canAct || allDone) && (
          <div className="mb-6 rounded-xl border border-purple-500/20 bg-purple-500/5 px-5 py-4">
            <p className="mb-3 text-sm font-semibold text-purple-300">Job Actions</p>
            <div className="flex flex-wrap gap-3">
              {(job.job_status === "Ready for Execution" || job.job_status === "Deposit Confirmed") && (
                <button
                  onClick={() => handleAction("pickup")}
                  disabled={actionLoading}
                  className="rounded-lg border border-purple-500/40 bg-purple-500/15 px-4 py-2 text-xs font-semibold text-purple-300 hover:bg-purple-500/25 active:scale-95 transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {actionLoading ? "Updating…" : "Mark Pickup Completed"}
                </button>
              )}
              {job.job_status === "In Progress" && (
                <button
                  onClick={() => handleAction("delivered")}
                  disabled={actionLoading}
                  className="rounded-lg border border-blue-500/40 bg-blue-500/15 px-4 py-2 text-xs font-semibold text-blue-300 hover:bg-blue-500/25 active:scale-95 transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {actionLoading ? "Updating…" : "Mark Delivered"}
                </button>
              )}
              {job.job_status === "Delivered" && (
                <button
                  onClick={() => handleAction("pod")}
                  disabled={actionLoading}
                  className="rounded-lg border border-emerald-500/40 bg-emerald-500/15 px-4 py-2 text-xs font-semibold text-emerald-300 hover:bg-emerald-500/25 active:scale-95 transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {actionLoading ? "Updating…" : "Submit POD"}
                </button>
              )}
              {/* Upload Document button */}
              {canUploadDoc && (
                <button
                  onClick={() => setShowDocModal(true)}
                  className="rounded-lg border border-slate-600 bg-slate-800 px-4 py-2 text-xs font-semibold text-slate-300 hover:bg-slate-700 hover:text-slate-100 active:scale-95 transition-all cursor-pointer"
                >
                  📎 Upload Document
                </button>
              )}
            </div>
            <p className="mt-3 text-xs text-slate-500">
              Current: <span className="font-medium text-slate-300">{job.current_milestone}</span>
            </p>
          </div>
        )}

        {/* ── All milestones done ── */}
        {allDone && (
          <div className="mb-6 rounded-xl border border-emerald-500/30 bg-emerald-500/5 px-5 py-4">
            <p className="text-sm font-semibold text-emerald-300">✓ All milestones completed</p>
            <p className="text-xs text-slate-400 mt-0.5">
              {isFullPayment
                ? "Job fully closed. Full payment was already confirmed by Nexum Admin."
                : "POD submitted. Awaiting customer balance payment and admin verification."}
            </p>
          </div>
        )}

        {/* ── Job hero ── */}
        <div className="mb-8">
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <span className="font-mono text-sm font-bold text-purple-400">{job.job_reference}</span>
            <span className="rounded-full border border-slate-700 bg-slate-800 px-2 py-0.5 text-xs text-slate-400">
              {job.service_type}
            </span>
            <span className={`rounded-full border px-2 py-0.5 text-xs font-medium ${paymentColors[job.payment_status] ?? "bg-slate-800 text-slate-400 border-slate-700"}`}>
              {job.payment_status}
            </span>
            <span className={`rounded-full border px-2 py-0.5 text-xs font-medium ${jobStatusColors[job.job_status] ?? "bg-slate-800 text-slate-400 border-slate-700"}`}>
              {job.job_status}
            </span>
            <span className={`rounded-full border px-2 py-0.5 text-xs font-medium ${riskColors[job.risk_level] ?? "bg-slate-800 text-slate-400 border-slate-700"}`}>
              {job.risk_level} Risk
            </span>
          </div>
          <h1 className="text-2xl font-bold text-slate-50">
            {job.service_type} — {job.route}
          </h1>
          <p className="mt-1 text-xs text-slate-500">
            Created {job.created_at.slice(0, 10)} · Last updated {job.updated_at.slice(0, 10)}
          </p>
        </div>

        {/* ── Job Flow Tracker ── */}
        <JobFlowTracker currentMilestone={job.current_milestone} isFullPayment={isFullPayment} />

        {/* ── Two-column layout ── */}
        <div className="mb-6 grid gap-6 lg:grid-cols-3">
          <div className="lg:col-span-2 flex flex-col gap-6">

            <Section title="Job Overview">
              <dl className="grid gap-3 sm:grid-cols-2">
                <InfoRow label="Service Type"      value={job.service_type} />
                <InfoRow label="Route"             value={job.route} mono />
                <InfoRow label="Job Value"         value={formatValue(Number(job.job_value), job.currency)} strong />
                <InfoRow label="Current Milestone" value={job.current_milestone} />
                {job.required_deposit != null && (
                  <InfoRow label="Required Deposit" value={formatValue(job.required_deposit, job.currency)} />
                )}
                {job.balance_terms && (
                  <InfoRow label="Balance Terms" value={job.balance_terms} />
                )}
                <div className="sm:col-span-2">
                  <InfoRow label="Payment Terms"    value={job.payment_terms} />
                </div>
                <div className="sm:col-span-2">
                  <InfoRow label="Cargo Description" value={job.cargo_description} />
                </div>
              </dl>
            </Section>

            {/* ── HS Code / Customs Classification ── */}
            <HsCodeCard
              hs={{
                hs_code:            job.hs_code,
                hs_code_description: job.hs_code_description,
                hs_code_source:     job.hs_code_source,
                commodity_category: job.commodity_category,
                permit_required:    job.permit_required,
                permit_note:        job.permit_note,
                customs_risk_level: job.customs_risk_level,
                duty_rate_estimate: job.duty_rate_estimate,
                tax_rate_estimate:  job.tax_rate_estimate,
              }}
              cargoBaseAmount={job.cargo_value_base_amount ?? job.cargo_value_amount}
              baseCurrency={job.base_currency ?? job.currency}
              incoterm={job.incoterm}
              showEmpty={false}
            />

            {/* ── Supplier / Counterparty Profile ── */}
            {supplierLinks.length > 0 ? (
              supplierLinks.map((link) => (
                <SupplierProfileCard
                  key={link.id}
                  supplier={link.supplier_counterparties!}
                  link={link}
                  showContact
                />
              ))
            ) : (
              <SupplierProfileEmptyCard />
            )}

            {/* Supplier Payment Protection (read-only for provider) */}
            <SupplierPaymentProtectionCard jobReference={jobId} role="service_provider" />

            {/* Milestone Evidence (read-only for provider) */}
            <SupplierMilestoneEvidenceCard jobReference={jobId} role="service_provider" />

            {/* Action Recommendations (provider role — assigned to provider only) */}
            <ActionRecommendationCard jobReference={jobId} role="service_provider" />

            <Section title="Service Provider">
              <div className="flex items-start gap-4">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-purple-500/30 bg-purple-500/10 text-lg text-purple-400">◈</div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-slate-100">{job.service_provider}</p>
                  <p className="mt-1 text-xs text-slate-500">Executing party for this secured job</p>
                </div>
              </div>
            </Section>

            <Section title="Customer">
              <div className="flex items-start gap-4">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-emerald-500/30 bg-emerald-500/10 text-lg text-emerald-400">◉</div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-slate-100">{job.customer}</p>
                  <p className="mt-1 text-xs text-slate-500">Paying party for this secured job</p>
                </div>
              </div>
            </Section>

          </div>

          {/* ── Right column ── */}
          <div className="flex flex-col gap-6">
            <Section title="Job Status">
              <div className="flex flex-col gap-3">
                <div>
                  <p className="text-xs text-slate-500 mb-1">Current Milestone</p>
                  <p className="text-sm font-semibold text-slate-100">{job.current_milestone}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-500 mb-1">Payment Status</p>
                  <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-medium ${paymentColors[job.payment_status] ?? "bg-slate-800 text-slate-400 border-slate-700"}`}>
                    {job.payment_status}
                  </span>
                </div>
                <div>
                  <p className="text-xs text-slate-500 mb-1">Job Status</p>
                  <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-medium ${jobStatusColors[job.job_status] ?? "bg-slate-800 text-slate-400 border-slate-700"}`}>
                    {job.job_status}
                  </span>
                </div>
                <div>
                  <p className="text-xs text-slate-500 mb-1">Risk Level</p>
                  <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-medium ${riskColors[job.risk_level] ?? "bg-slate-800 text-slate-400 border-slate-700"}`}>
                    {job.risk_level}
                  </span>
                </div>
              </div>
            </Section>

            <Section title="Execution Guide">
              <ul className="flex flex-col gap-2 text-xs text-slate-500">
                <li className="flex items-start gap-2">
                  <span className="mt-0.5 shrink-0 text-purple-500">●</span>
                  Mark pickup to begin — {isFullPayment ? "full payment" : "deposit"} must be confirmed first.
                </li>
                <li className="flex items-start gap-2">
                  <span className="mt-0.5 shrink-0 text-purple-500">●</span>
                  {isFullPayment
                    ? "Upload delivery documents, then submit POD to close the job — no balance payment required."
                    : "Upload delivery documents, then submit POD to trigger customer balance release."}
                </li>
                <li className="flex items-start gap-2">
                  <span className="mt-0.5 shrink-0 text-purple-500">●</span>
                  All uploads are visible to the customer and Nexum Admin.
                </li>
              </ul>
            </Section>
          </div>
        </div>

        {/* ── Payment Holding & Controlled Release ── */}
        <div className="mb-6">
          <PaymentHoldingCard
            jobReference={job.job_reference}
            role="service_provider"
            actorId={profile?.id}
            actorRole="service_provider"
            actorName={profile?.full_name ?? "Service Provider"}
            currency={job.currency}
            onUpdate={loadJob}
          />
        </div>

        {/* ── Release / Settlement ── */}
        <div className="mb-6">
          <ReleaseSettlementCard
            jobReference={job.job_reference}
            role="service_provider"
            actorId={profile?.id}
            actorRole="service_provider"
            actorName={profile?.full_name ?? "Service Provider"}
            currency={job.currency}
          />
        </div>

        {/* ── Payout Profile ── */}
        {profile?.company_id && (
          <div className="mb-6">
            <PayoutProfileCard
              companyId={profile.company_id}
              role="service_provider"
              actorId={profile?.id}
              actorRole="service_provider"
              actorName={profile?.full_name ?? "Service Provider"}
              compact={true}
            />
          </div>
        )}

        {/* ── Payment Ledger ── */}
        <div className="mb-6">
          <PaymentLedgerCard
            jobReference={job.job_reference}
            role="service_provider"
            actorId={profile?.id}
            actorRole="service_provider"
            actorName={profile?.full_name ?? "Service Provider"}
            currency={job.currency}
            onUpdate={loadJob}
          />
        </div>

        {/* ── Delivery Confirmation ── */}
        <div className="mb-6">
          <DeliveryConfirmationCard
            jobReference={job.job_reference}
            userRole="provider"
            actorId={profile?.id}
            actorName={profile?.full_name ?? "Service Provider"}
            paymentTerms={job.payment_terms}
            requiredDeposit={job.required_deposit}
            jobValue={job.job_value}
            onUpdate={loadJob}
          />
        </div>

        {/* ── Dispute & Claims ── */}
        <div className="mb-6">
          <DisputeCaseCard
            jobReference={job.job_reference}
            userRole="provider"
            actorId={profile?.id}
            actorName={profile?.full_name ?? "Service Provider"}
            currency={job.currency}
            providerCompanyId={profile?.company_id}
            onUpdate={loadJob}
          />
        </div>

        {/* ── Net Settlement Statement ── */}
        <div className="mb-6">
          <NetSettlementCard
            jobReference={job.job_reference}
            role="service_provider"
            currency={job.currency}
          />
        </div>

        {/* ── Nexum Brain ── */}
        {!coreOnly && (
          <div className="mb-6">
            <NexumBrainPanel
              job={job}
              userRole="service_provider"
              actorId={profile?.id}
              actorName={profile?.full_name ?? "Service Provider"}
            />
          </div>
        )}

        {/* ── Trade Document Upload ── */}
        <div className="mb-6">
          <TradeDocumentUploadPanel
            jobReference={job.job_reference}
            uploaderRole="service_provider"
            uploaderName={profile?.full_name ?? "Service Provider"}
            serviceType={job.service_type}
            onExtractionComplete={() => setTrackingRefreshKey((k) => k + 1)}
          />
        </div>

        {/* ── Document Checklist ── */}
        <div className="mb-6">
          <JobDocumentPanel
            jobReference={job.job_reference}
            userRole="service_provider"
            companyId={profile?.company_id ?? undefined}
            actorId={profile?.id}
            actorName={profile?.full_name ?? "Service Provider"}
          />
        </div>

        {/* ── Documents (legacy list) ── */}
        <div className="mb-6">
          <DocumentList jobReference={job.job_reference} refreshTrigger={docRefreshKey} />
        </div>

        {/* ── Document Intelligence ── */}
        {!coreOnly && (
          <div className="mb-6">
            <DocumentIntelligencePanel
              jobReference={job.job_reference}
              userRole="service_provider"
              actorId={profile?.id}
              actorName={profile?.full_name ?? "Service Provider"}
            />
          </div>
        )}

        {/* ── Workflow Tasks ── */}
        {!coreOnly && (
          <div className="mb-6">
            <WorkflowTaskPanel
              jobReference={job.job_reference}
              assignedRole="service_provider"
              companyId={profile?.company_id}
              compact={true}
              maxItems={10}
            />
          </div>
        )}

        {/* ── Exceptions ── */}
        {!coreOnly && (
          <div className="mb-6">
            <ExceptionPanel
              jobReference={job.job_reference}
              userRole="service_provider"
              job={{
                payment_status:    job.payment_status,
                current_milestone: job.current_milestone,
                job_status:        job.job_status,
                created_at:        job.created_at,
              }}
              actorId={profile?.id}
              actorName={profile?.full_name ?? "Service Provider"}
            />
          </div>
        )}

        {/* ── Shipment Tracking ── */}
        {!coreOnly && (
          <div className="mb-6">
            <ShipmentTrackingPanel
              key={trackingRefreshKey}
              jobReference={job.job_reference}
              userRole="service_provider"
              actorId={profile?.id}
              actorName={profile?.full_name ?? "Service Provider"}
            />
          </div>
        )}

        {/* ── Delay Impact ── */}
        {!coreOnly && (
          <div className="mb-6">
            <DelayImpactCard
              jobReference={job.job_reference}
              userRole="service_provider"
              actorId={profile?.id}
              actorName={profile?.full_name ?? "Service Provider"}
            />
          </div>
        )}

        {/* ── Business Context ── */}
        {!coreOnly && (
          <div className="mb-6">
            <BusinessContextPanel
              jobReference={job.job_reference}
              userRole="service_provider"
              actorId={profile?.id}
              actorName={profile?.full_name ?? "Service Provider"}
            />
          </div>
        )}

        {/* ── Communication Log ── */}
        {!coreOnly && (
          <div className="mb-8">
            <CommunicationLogCard
              jobReference={job.job_reference}
              maxItems={6}
              defaultSubject={`Job ${job.job_reference} — Provider Update`}
              defaultMessage={`Update regarding Job ${job.job_reference}.\n\nRoute: ${job.route}\nCurrent Status: ${job.job_status}`}
            />
          </div>
        )}

        {/* ── Audit Log ── */}
        <Section title="Audit Log">
          {logs.length === 0 ? (
            <p className="text-xs text-slate-600">No audit events recorded for this job yet.</p>
          ) : (
            <ol className="flex flex-col divide-y divide-slate-800/60">
              {logs.map((log) => (
                <li key={log.id} className="flex items-start gap-3 py-3 first:pt-0 last:pb-0">
                  <span className="mt-0.5 shrink-0 font-mono text-xs text-slate-600 tabular-nums whitespace-nowrap">
                    {log.created_at.slice(0, 16).replace("T", " ")}
                  </span>
                  <span className={`mt-0.5 shrink-0 rounded-full border px-2 py-0.5 text-xs font-medium ${roleColors[log.actor_role] ?? "bg-slate-800 text-slate-400 border-slate-700"}`}>
                    {log.actor_role}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-semibold text-slate-300">{log.actor_name}</p>
                    <p className="text-xs text-slate-500">{log.description}</p>
                  </div>
                </li>
              ))}
            </ol>
          )}
        </Section>

        {/* ── Commercial Terms Snapshot ── */}
        <div className="mt-6">
          <JobTermsSnapshotCard
            jobReference={job.job_reference}
            role="service_provider"
            actorId={profile?.id}
            actorName={profile?.full_name ?? profile?.company_name ?? "Provider"}
          />
        </div>

        {/* ── Change Requests ── */}
        <div className="mt-6">
          <ChangeRequestCard
            jobReference={job.job_reference}
            role="service_provider"
            actorId={profile?.id}
            actorName={profile?.full_name ?? profile?.company_name ?? "Provider"}
            jobCurrency={job.currency}
          />
        </div>

        {/* ── Evidence Pack ── */}
        <div className="mt-6">
          <EvidencePackCard
            jobReference={job.job_reference}
            role="service_provider"
            actorId={profile?.id}
            actorName={profile?.full_name ?? profile?.company_name ?? "Provider"}
          />
        </div>

      </main>
    </div>
  );
}

// ─── Shared components ────────────────────────────────────────────────────────

function Section({ title, children, className = "" }: { title: string; children: React.ReactNode; className?: string }) {
  return (
    <section className={`rounded-xl border border-slate-800 bg-slate-900/60 p-6 ${className}`}>
      <h2 className="mb-4 text-sm font-semibold text-slate-300">{title}</h2>
      {children}
    </section>
  );
}

function InfoRow({ label, value, mono = false, strong = false }: {
  label: string; value: string; mono?: boolean; strong?: boolean;
}) {
  return (
    <div>
      <dt className="mb-0.5 text-xs text-slate-500">{label}</dt>
      <dd className={`text-sm leading-snug ${mono ? "font-mono" : ""} ${strong ? "font-semibold text-slate-100" : "text-slate-300"}`}>
        {value}
      </dd>
    </div>
  );
}
