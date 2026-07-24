"use client";
import { use, useRef, useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { OPTIONAL_MODULES_DISABLED } from "@/lib/appEnv";
import { supabase } from "@/lib/supabaseClient";
import { insertAuditLog } from "@/lib/auditLog";
import { JobFlowTracker } from "@/components/JobFlowTracker";
import { JobTimeline }    from "@/components/JobTimeline";
import { DocumentList } from "@/components/DocumentList";
import { LogoutButton } from "@/components/LogoutButton";
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
import { EvidencePackCard } from "@/components/EvidencePackCard";
import { NetSettlementCard } from "@/components/NetSettlementCard";
import { JobTermsSnapshotCard } from "@/components/JobTermsSnapshotCard";
import { ChangeRequestCard } from "@/components/ChangeRequestCard";
import { HsCodeCard } from "@/components/HsCodeCard";
import { SupplierProfileCard } from "@/components/SupplierProfileCard";
import { SupplierPaymentProtectionCard } from "@/components/SupplierPaymentProtectionCard";
import { SupplierMilestoneEvidenceCard } from "@/components/SupplierMilestoneEvidenceCard";
import { SupplierTrustScoreCard } from "@/components/SupplierTrustScoreCard";
import { SupplierExposureLimitCard } from "@/components/SupplierExposureLimitCard";
import { BuyerSupplierRelationshipCard } from "@/components/BuyerSupplierRelationshipCard";
import { ProcurementOrderCard } from "@/components/ProcurementOrderCard";
import { ActionRecommendationCard } from "@/components/ActionRecommendationCard";
import { CustomerDeliveryConfirmBanner } from "@/components/CustomerDeliveryConfirmBanner";
import type { JobSupplierLink } from "@/lib/supplierProfile";
import {
  buildSnapshot,
  DEFAULT_RELEASE_CONDITION, DEFAULT_DISPUTE_CONDITION,
  DEFAULT_PILOT_DISCLAIMER, DEFAULT_REQUIRED_DOCUMENTS,
} from "@/lib/jobTermsSnapshot";

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
  delivery_confirmation_status:     string | null;
  customer_confirmation_status:     string | null;
  pod_uploaded_at:                  string | null;
  customer_confirmation_deadline_at: string | null;
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

type PaymentType = "Deposit" | "Balance" | "Full Payment";

// ─── Colour maps ──────────────────────────────────────────────────────────────

const paymentColors: Record<string, string> = {
  "Payment Pending":               "bg-amber-500/15 text-amber-400 border-amber-500/30",
  "Deposit Proof Uploaded":        "bg-amber-500/15 text-amber-400 border-amber-500/30",
  "Full Payment Proof Uploaded":   "bg-amber-500/15 text-amber-400 border-amber-500/30",
  "Deposit Confirmed":             "bg-blue-500/15 text-blue-400 border-blue-500/30",
  "Balance Pending":               "bg-purple-500/15 text-purple-400 border-purple-500/30",
  "Balance Proof Uploaded":        "bg-purple-500/15 text-purple-400 border-purple-500/30",
  "Payment Proof Uploaded":        "bg-blue-500/15 text-blue-400 border-blue-500/30",
  "Fully Paid":                    "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
  "Disputed":                      "bg-red-500/15 text-red-400 border-red-500/30",
  "Refunded":                      "bg-slate-500/15 text-slate-400 border-slate-500/30",
};

const jobStatusColors: Record<string, string> = {
  "Awaiting Customer Acceptance":   "bg-amber-500/15 text-amber-400 border-amber-500/30",
  "Awaiting Deposit":               "bg-amber-500/15 text-amber-400 border-amber-500/30",
  "Awaiting Deposit Confirmation":  "bg-amber-500/15 text-amber-400 border-amber-500/30",
  "Ready for Execution":            "bg-blue-500/15 text-blue-400 border-blue-500/30",
  "In Progress":                    "bg-blue-500/15 text-blue-400 border-blue-500/30",
  "Delivered":                      "bg-purple-500/15 text-purple-400 border-purple-500/30",
  "Completed":                      "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
  "Disputed":                       "bg-red-500/15 text-red-400 border-red-500/30",
  "Cancelled":                      "bg-slate-500/15 text-slate-400 border-slate-500/30",
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
  "job_reference, service_provider, customer, service_type, route, cargo_description, currency, job_value, payment_terms, required_deposit, balance_terms, payment_status, job_status, current_milestone, risk_level, delivery_confirmation_status, customer_confirmation_status, pod_uploaded_at, customer_confirmation_deadline_at, created_at, updated_at, incoterm, cargo_value_amount, cargo_value_currency, cargo_value_fx_rate_to_base, cargo_value_base_amount, logistics_fee_amount, logistics_fee_currency, duty_tax_estimate_amount, duty_tax_currency, insurance_cost_amount, insurance_cost_currency, additional_charges_amount, additional_charges_currency, total_secured_amount, total_secured_currency, base_currency, hs_code, hs_code_description, hs_code_source, commodity_category, permit_required, permit_note, customs_risk_level, duty_rate_estimate, tax_rate_estimate";

function isFullPaymentJob(job: { payment_terms: string; required_deposit: number | null; job_value: number }): boolean {
  return (
    job.payment_terms.toLowerCase().includes("full payment") ||
    (job.required_deposit !== null && job.required_deposit >= job.job_value)
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function CustomerJobDetailPage({
  params,
}: {
  params: Promise<{ jobId: string }>;
}) {
  // All useState/useRef calls must come before use()
  const [fetchState, setFetchState]   = useState<FetchState>({ status: "loading" });
  const [acceptState, setAcceptState] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [acceptError, setAcceptError] = useState<{
    message: string;
    code?:    string;
    details?: string;
    hint?:    string;
  } | null>(null);
  const [termsChecked, setTermsChecked] = useState(false);

  // Payment proof modal state
  const [showModal, setShowModal]         = useState(false);
  const [paymentType, setPaymentType]     = useState<PaymentType>("Deposit");
  const [amount, setAmount]               = useState("");
  const [bankRef, setBankRef]             = useState("");
  const [remarks, setRemarks]             = useState("");
  const [selectedFile, setSelectedFile]   = useState<File | null>(null);
  const [submitState, setSubmitState]     = useState<"idle" | "loading" | "success" | "error">("idle");
  const [submitError, setSubmitError]     = useState("");
  const [docRefreshKey,      setDocRefreshKey]      = useState(0);
  const [trackingRefreshKey, setTrackingRefreshKey] = useState(0);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const timerRef     = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountedRef   = useRef(true);

  const { profile } = useAuth();
  const [logs, setLogs]                 = useState<AuditLogRow[]>([]);
  const [supplierLinks, setSupplierLinks] = useState<JobSupplierLink[]>([]);
  const [pageTimedOut, setPageTimedOut] = useState(false);
  const [coreOnly, setCoreOnly]         = useState(OPTIONAL_MODULES_DISABLED);
  const [bgLoading, setBgLoading]       = useState(false);
  const [maskedParties, setMaskedParties] = useState<{
    service_provider: { display_name: string; is_masked: boolean; visibility_level: string };
    customer:         { display_name: string; is_masked: boolean; visibility_level: string };
  } | null>(null);

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
        .eq("customer_company_id", profile?.company_id ?? "")
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
        // Fetch masked party names (non-blocking)
        void (async () => {
          try {
            const stored = localStorage.getItem("supabase.auth.token");
            const tok = stored ? (JSON.parse(stored) as { access_token?: string }).access_token ?? "" : "";
            if (tok) {
              const mRes = await fetch(`/api/masking/job-parties?job_reference=${encodeURIComponent(jobId)}`, {
                headers: { Authorization: "Bearer " + tok },
              });
              if (mRes.ok && mountedRef.current) {
                const mJson = await mRes.json() as typeof maskedParties;
                setMaskedParties(mJson);
              }
            }
          } catch { /* non-blocking */ }
        })();
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

  useEffect(() => {
    if (!profile) return;
    mountedRef.current = true;
    setFetchState({ status: "loading" });
    setPageTimedOut(false);
    void loadJob();
    return () => {
      mountedRef.current = false;
      if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null; }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobId, profile?.company_id]);

  async function handleAcceptJob() {
    if (!termsChecked) {
      setAcceptState("error");
      setAcceptError({ message: "Please confirm you have reviewed the terms before accepting." });
      return;
    }

    setAcceptState("loading");
    setAcceptError(null);

    // 10-second hard cap — aborts the snapshot fetch if it hangs, ensuring
    // the job update always runs and the loading state is always cleared.
    const controller = new AbortController();
    const timeoutId  = setTimeout(() => controller.abort(), 10_000);

    try {
      const currentJob = fetchState.status === "success" ? fetchState.job : null;

      // ── Step 1: terms snapshot (optional — non-fatal on any failure) ────────
      // accepted_by = profile.id (real UUID from Supabase Auth).
      // If the user id is somehow missing, accepted_by = null and
      // accepted_by_label carries the human-readable fallback.
      if (currentJob && profile) {
        try {
          const { data: { session } } = await supabase.auth.getSession();
          const token = session?.access_token ?? "";

          const acceptedById    = profile.id ?? null;           // uuid or null
          const acceptedByLabel = profile.full_name ?? profile.id ?? "customer"; // text label

          const snapshotPayload = {
            ...buildSnapshot(
              {
                job_reference:               currentJob.job_reference,
                service_type:                currentJob.service_type,
                route:                       currentJob.route,
                job_value:                   currentJob.job_value,
                currency:                    currentJob.currency,
                payment_terms:               currentJob.payment_terms,
                required_deposit:            currentJob.required_deposit,
                balance_terms:               currentJob.balance_terms ?? null,
                customer_company_id:         profile.company_id ?? null,
                service_provider_company_id: null, // not on customer JobRow
              },
              acceptedById,   // uuid — null is safe; buildSnapshot accepts string|null
            ),
            release_condition:  DEFAULT_RELEASE_CONDITION,
            dispute_condition:  DEFAULT_DISPUTE_CONDITION,
            pilot_disclaimer:   DEFAULT_PILOT_DISCLAIMER,
            required_documents: DEFAULT_REQUIRED_DOCUMENTS,
            snapshot_data:      currentJob as unknown as Record<string, unknown>,
            accepted_by_label:  acceptedByLabel,  // text — safe even if accepted_by is null
          };

          const res = await fetch("/api/job-terms-snapshots", {
            method:  "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
            body:    JSON.stringify(snapshotPayload),
            signal:  controller.signal,   // aborted after 10s if still in-flight
          });

          if (!res.ok) {
            const j = await res.json().catch(() => ({})) as Record<string, unknown>;
            console.warn("[handleAcceptJob] snapshot API failed:", res.status, j);
            // Non-fatal — job acceptance proceeds regardless
          }
        } catch (snapErr) {
          if (snapErr instanceof Error && snapErr.name === "AbortError") {
            console.warn("[handleAcceptJob] snapshot fetch exceeded 10s timeout — continuing");
          } else {
            console.warn("[handleAcceptJob] snapshot fetch threw:", snapErr);
          }
          // Non-fatal — job acceptance proceeds regardless
        }
      }

      // ── Step 2: update secured_jobs status (core — failure aborts flow) ────
      const { error: updateErr } = await supabase
        .from("secured_jobs")
        .update({
          job_status:        "Awaiting Deposit",
          current_milestone: "Job Accepted",
          updated_at:        new Date().toISOString(),
        })
        .eq("job_reference", jobId);

      if (updateErr) {
        const pg = updateErr as { message?: string; code?: string; details?: string; hint?: string };
        setAcceptState("error");
        setAcceptError({
          message: pg.message ?? "Database update failed",
          code:    pg.code,
          details: pg.details  ?? undefined,
          hint:    pg.hint     ?? undefined,
        });
        return;
      }

      // ── Step 3: audit log (fire-and-forget — must never block acceptance) ──
      insertAuditLog({
        job_reference: jobId,
        actor_role:    "customer",
        actor_name:    profile?.full_name ?? "Customer",
        action:        "accept_job",
        description:   "Customer accepted the secured job and confirmed commercial terms. Awaiting deposit payment.",
      }).catch(console.warn);

      setAcceptState("success");
      void loadJob();
      void loadLogs();

    } catch (err) {
      // Uncaught exception — surface it clearly
      console.error("[handleAcceptJob] unexpected error:", err);
      setAcceptState("error");
      setAcceptError({
        message: err instanceof Error ? err.message : "Unexpected error. Please try again.",
      });
    } finally {
      clearTimeout(timeoutId);
      // Belt-and-suspenders: if something returned/threw without setting state,
      // ensure we never leave the button permanently stuck at "loading".
      setAcceptState((prev) => (prev === "loading" ? "error" : prev));
    }
  }

  function openModal(defaultType: PaymentType) {
    setPaymentType(defaultType);
    setAmount("");
    setBankRef("");
    setRemarks("");
    setSelectedFile(null);
    setSubmitState("idle");
    setSubmitError("");
    setShowModal(true);
  }

  function closeModal() {
    if (submitState === "loading") return;
    setShowModal(false);
  }

  // RLS policy allows: 'Payment Proof', 'Deposit Proof', 'Balance Proof', 'Full Payment Proof'
  const docTypeMap: Record<PaymentType, string> = {
    "Deposit":      "Deposit Proof",
    "Balance":      "Balance Proof",
    "Full Payment": "Full Payment Proof",
  };

  async function handleSubmitProof(e: React.FormEvent) {
    e.preventDefault();

    if (!selectedFile) {
      setSubmitError("Please select a file to upload as payment proof.");
      return;
    }

    setSubmitState("loading");
    setSubmitError("");

    // 1. Upload file to Storage (client-side, storage bucket policies allow this)
    const timestamp = Date.now();
    const safeName  = selectedFile.name.replace(/[^a-zA-Z0-9._-]/g, "_");
    const typeSlug  = docTypeMap[paymentType].replace(/\s+/g, "_");
    const filePath  = `${jobId}/${typeSlug}/${timestamp}-${safeName}`;

    const { error: storageErr } = await supabase.storage
      .from("job-documents")
      .upload(filePath, selectedFile, { upsert: false });

    if (storageErr) {
      setSubmitState("error");
      setSubmitError(storageErr.message);
      return;
    }

    // 2. Insert document record + update job status via API route (service-role, bypasses RLS)
    const { data: { session } } = await supabase.auth.getSession();
    const token = session?.access_token
      ?? (typeof window !== "undefined"
        ? (() => { try { const s = localStorage.getItem("supabase.auth.token"); return s ? JSON.parse(s).access_token : null; } catch { return null; } })()
        : null);

    const apiRes = await fetch("/api/customer/payment-proof", {
      method: "POST",
      headers: {
        "Content-Type":  "application/json",
        "Authorization": `Bearer ${token ?? ""}`,
      },
      body: JSON.stringify({
        job_reference:    jobId,
        document_type:    docTypeMap[paymentType],
        file_path:        filePath,
        file_name:        selectedFile.name,
        file_size:        selectedFile.size,
        mime_type:        selectedFile.type || undefined,
        payment_type:     paymentType,
        uploaded_by_name: profile?.full_name ?? "Customer",
        remarks:          remarks || undefined,
      }),
    });

    const apiJson = await apiRes.json() as { ok?: boolean; error?: string };
    if (!apiRes.ok || !apiJson.ok) {
      setSubmitState("error");
      setSubmitError(apiJson.error ?? "Upload failed");
      return;
    }

    // 3. Audit log for the payment submission action
    const auditAction = paymentType === "Full Payment"
      ? "full_payment_proof_uploaded"
      : "upload_payment_proof";
    await insertAuditLog({
      job_reference: jobId,
      actor_role:    "customer",
      actor_name:    profile?.full_name ?? "Customer",
      action:        auditAction,
      description:   `Customer submitted ${paymentType} payment proof. Bank ref: ${bankRef}. Amount: ${amount}.`,
      metadata:      { payment_type: paymentType, amount, bank_ref: bankRef, remarks },
    });

    // 4. Notify admin of payment proof upload
    const notifType = paymentType === "Balance"
      ? "Balance Proof Uploaded" as const
      : "Payment Proof Uploaded" as const;
    await createNotification({
      jobReference: jobId, recipientRole: "admin",
      notificationType: notifType, priority: "High",
      title: `${paymentType} proof uploaded — Job ${jobId} awaiting verification`,
      message: `Customer ${profile?.full_name ?? "?"} uploaded ${paymentType} payment proof. Amount: ${amount}. Bank ref: ${bankRef}. Please verify in the job page.`,
      actionUrl: `/admin/jobs/${jobId}`,
      actorId: profile?.id, actorName: profile?.full_name ?? "Customer", actorRole: "customer",
    });

    // 5. Auto-send email to admin
    void fetch("/api/send-communication", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        channel: "Email",
        recipientRole: "admin",
        subject: `💳 ${paymentType} Proof Uploaded — Job ${jobId} Awaiting Verification`,
        message: `Customer ${profile?.full_name ?? "?"} has uploaded ${paymentType} payment proof for Job ${jobId}.\n\nAmount: ${amount}\nBank Ref: ${bankRef}${remarks ? `\nRemarks: ${remarks}` : ""}\n\nPlease verify in the admin job page.`,
        jobReference: jobId,
        actorId: profile?.id, actorRole: "customer", actorName: profile?.full_name,
      }),
    });

    setDocRefreshKey((k) => k + 1);
    setSubmitState("success");
    setShowModal(false);
    await loadJob();
    await loadLogs();
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
          <span className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 text-emerald-400 font-medium">Customer</span>
          <Link href="/customer" className="hover:text-slate-100 transition-colors">Dashboard</Link>
          <Link href="/customer/jobs" className="hover:text-slate-100 transition-colors">My Jobs</Link>
          <Link href="/customer/notifications" className="hover:text-slate-100 transition-colors">Notifications</Link>
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
              <div className="h-7 w-7 animate-spin rounded-full border-2 border-emerald-500 border-t-transparent" />
              <p className="text-sm text-slate-400">Loading job {jobId}…</p>
            </>
          ) : (
            <div className="max-w-md w-full rounded-2xl border border-amber-500/30 bg-amber-500/5 px-6 py-6 text-left">
              <p className="mb-1 text-sm font-semibold text-amber-300">Job data is taking too long</p>
              <p className="mb-4 text-xs text-slate-400">
                The query for <span className="font-mono text-slate-300">{jobId}</span> did not respond within 10 seconds.
                Please retry or contact support if the issue persists.
              </p>
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={() => { setPageTimedOut(false); void loadJob(); }}
                  className="rounded-lg border border-emerald-500/40 bg-emerald-500/15 px-4 py-2 text-xs font-semibold text-emerald-300 hover:bg-emerald-500/25 active:scale-95 transition-all cursor-pointer"
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
            <Link href="/customer/jobs" className="hover:text-slate-300 transition-colors">My Jobs</Link>
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
          <Link href="/customer/jobs" className="text-sm text-emerald-400 hover:text-emerald-300 transition-colors">
            ← Back to My Jobs
          </Link>
        </div>
      </div>
    );
  }

  // ── Success ──────────────────────────────────────────────────────────────────
  const { job } = fetchState;
  const isFullPayment = isFullPaymentJob(job);

  // Lock the payment type choice to what is appropriate for this job's state.
  // Full payment jobs in Awaiting Deposit show only "Full Payment".
  // Partial jobs in Awaiting Deposit show only "Deposit".
  // Balance stage shows only "Balance". Otherwise full selector is shown.
  const availablePaymentTypes: PaymentType[] =
    job.job_status === "Awaiting Deposit"
      ? (isFullPayment ? ["Full Payment"] : ["Deposit"])
      : job.payment_status === "Balance Pending"
      ? ["Balance"]
      : ["Deposit", "Balance", "Full Payment"];

  const showAcceptButton =
    job.job_status === "Awaiting Customer Acceptance" &&
    acceptState !== "success";

  const showUploadProof =
    job.job_status === "Awaiting Deposit" ||
    (job.payment_status === "Balance Pending" && !isFullPayment);

  const defaultPaymentType: PaymentType =
    job.payment_status === "Balance Pending" ? "Balance" : "Deposit";

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 font-sans flex flex-col">
      {nav}

      {/* ── Payment proof modal ── */}
      {showModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 px-4"
          onClick={(e) => { if (e.target === e.currentTarget) closeModal(); }}
        >
          <div className="w-full max-w-md rounded-2xl border border-slate-700 bg-slate-900 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-800 px-6 py-4">
              <h2 className="text-sm font-semibold text-slate-100">Submit Payment Proof</h2>
              <button
                onClick={closeModal}
                disabled={submitState === "loading"}
                className="text-slate-500 hover:text-slate-300 transition-colors text-lg leading-none disabled:opacity-40"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSubmitProof} className="px-6 py-5 flex flex-col gap-4">

              {/* Payment type */}
              <div>
                <label className="mb-1.5 block text-xs font-medium text-slate-400">Payment Type</label>
                <div className="flex gap-2">
                  {availablePaymentTypes.map((t) => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => setPaymentType(t)}
                      className={`flex-1 rounded-lg border px-3 py-2 text-xs font-medium transition-colors ${
                        paymentType === t
                          ? "border-emerald-500/50 bg-emerald-500/15 text-emerald-300"
                          : "border-slate-700 bg-slate-800 text-slate-400 hover:border-slate-600"
                      }`}
                    >
                      {t}
                    </button>
                  ))}
                </div>
              </div>

              {/* Amount */}
              <div>
                <label className="mb-1.5 block text-xs font-medium text-slate-400">
                  Amount ({job.currency}) <span className="text-red-500">*</span>
                </label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  required
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="e.g. 15000"
                  className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 placeholder-slate-600 focus:border-emerald-500/50 focus:outline-none focus:ring-1 focus:ring-emerald-500/30"
                />
              </div>

              {/* Bank reference */}
              <div>
                <label className="mb-1.5 block text-xs font-medium text-slate-400">
                  Bank Reference Number <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={bankRef}
                  onChange={(e) => setBankRef(e.target.value)}
                  placeholder="e.g. TT20240501-123456"
                  className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 placeholder-slate-600 focus:border-emerald-500/50 focus:outline-none focus:ring-1 focus:ring-emerald-500/30"
                />
              </div>

              {/* Remarks */}
              <div>
                <label className="mb-1.5 block text-xs font-medium text-slate-400">
                  Remarks <span className="text-slate-600">(optional)</span>
                </label>
                <textarea
                  rows={2}
                  value={remarks}
                  onChange={(e) => setRemarks(e.target.value)}
                  placeholder="Any notes for Nexum admin…"
                  className="w-full resize-none rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 placeholder-slate-600 focus:border-emerald-500/50 focus:outline-none focus:ring-1 focus:ring-emerald-500/30"
                />
              </div>

              {/* Real file picker */}
              <div>
                <label className="mb-1.5 block text-xs font-medium text-slate-400">
                  Payment Proof File <span className="text-red-500">*</span>
                </label>
                <div
                  className="flex cursor-pointer items-center gap-3 rounded-lg border border-dashed border-slate-700 bg-slate-800/60 px-4 py-3 hover:border-slate-600 transition-colors"
                  onClick={() => fileInputRef.current?.click()}
                >
                  <span className="text-slate-600 text-lg">📎</span>
                  <div className="flex-1 min-w-0">
                    {selectedFile ? (
                      <>
                        <p className="truncate text-xs font-medium text-slate-200">{selectedFile.name}</p>
                        <p className="text-xs text-slate-600">
                          {selectedFile.size < 1024 * 1024
                            ? `${(selectedFile.size / 1024).toFixed(1)} KB`
                            : `${(selectedFile.size / (1024 * 1024)).toFixed(1)} MB`}
                        </p>
                      </>
                    ) : (
                      <p className="text-xs text-slate-600">Click to select file (PDF, image, etc.)</p>
                    )}
                  </div>
                  <span className="shrink-0 rounded border border-slate-600 bg-slate-700 px-3 py-1 text-xs text-slate-300 hover:bg-slate-600 transition-colors">
                    Browse
                  </span>
                </div>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".pdf,.jpg,.jpeg,.png,.webp,.heic,.doc,.docx"
                  className="hidden"
                  onChange={(e) => setSelectedFile(e.target.files?.[0] ?? null)}
                />
              </div>

              {/* Submit error */}
              {submitState === "error" && (
                <div className="rounded-lg border border-red-500/30 bg-red-500/5 px-4 py-3">
                  <p className="text-xs font-semibold text-red-300">Submission failed</p>
                  <p className="mt-0.5 font-mono text-xs text-red-400">{submitError}</p>
                </div>
              )}

              {/* Actions */}
              <div className="flex gap-3 pt-1">
                <button
                  type="button"
                  onClick={closeModal}
                  disabled={submitState === "loading"}
                  className="flex-1 rounded-lg border border-slate-700 bg-slate-800 px-4 py-2 text-xs font-medium text-slate-400 hover:bg-slate-700 transition-colors disabled:opacity-40"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitState === "loading"}
                  className="flex-1 rounded-lg border border-emerald-500/40 bg-emerald-500/15 px-4 py-2 text-xs font-semibold text-emerald-300 hover:bg-emerald-500/25 active:scale-95 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {submitState === "loading" ? "Uploading…" : "Submit Proof"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <main className="mx-auto w-full max-w-6xl px-6 py-10">

        {/* Breadcrumb + stability controls */}
        <div className="mb-4 flex flex-wrap items-center gap-2 text-xs text-slate-500">
          <Link href="/customer/jobs" className="hover:text-slate-300 transition-colors">My Jobs</Link>
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

        {/* ── Delivery Confirmation Banner — prominent, shown above payment sections ── */}
        <CustomerDeliveryConfirmBanner
          jobReference={job.job_reference}
          currentMilestone={job.current_milestone}
          deliveryStatus={job.delivery_confirmation_status}
          customerConfirmStatus={job.customer_confirmation_status}
          podUploadedAt={job.pod_uploaded_at}
          confirmationDeadlineAt={job.customer_confirmation_deadline_at}
          actorName={profile?.full_name ?? "Customer"}
          paymentTerms={job.payment_terms}
          requiredDeposit={job.required_deposit}
          jobValue={job.job_value}
          onUpdate={loadJob}
        />

        {/* ── Accept error ── */}
        {acceptState === "error" && acceptError && (
          <div className="mb-6 rounded-xl border border-red-500/30 bg-red-500/5 px-5 py-4">
            <p className="mb-1 text-sm font-semibold text-red-300">Failed to accept job</p>
            <p className="font-mono text-xs text-red-400">{acceptError.message}</p>
            {acceptError.code    && <p className="mt-0.5 font-mono text-xs text-slate-500">code: {acceptError.code}</p>}
            {acceptError.details && <p className="font-mono text-xs text-slate-500 break-words">details: {acceptError.details}</p>}
            {acceptError.hint    && <p className="font-mono text-xs text-slate-500 break-words">hint: {acceptError.hint}</p>}
          </div>
        )}

        {/* ── Accept success ── */}
        {acceptState === "success" && (
          <div className="mb-6 rounded-xl border border-emerald-500/30 bg-emerald-500/5 px-5 py-4">
            <p className="text-sm font-semibold text-emerald-300">✓ Job accepted — awaiting your deposit</p>
            <p className="text-xs text-slate-400 mt-0.5">
              Upload your payment proof below so Nexum can confirm and activate the job.
            </p>
          </div>
        )}

        {/* ── Proof submitted success ── */}
        {submitState === "success" && (
          <div className="mb-6 rounded-xl border border-emerald-500/30 bg-emerald-500/5 px-5 py-4">
            <p className="text-sm font-semibold text-emerald-300">✓ Payment proof submitted and uploaded. Nexum Admin will verify and confirm.</p>
            <p className="text-xs text-slate-400 mt-0.5">
              Your document has been saved. You will be notified once your payment is confirmed.
            </p>
          </div>
        )}

        {/* ── Full payment already confirmed ── */}
        {isFullPayment && job.payment_status === "Fully Paid" && (
          <div className="mb-6 rounded-xl border border-emerald-500/30 bg-emerald-500/5 px-5 py-4">
            <p className="text-sm font-semibold text-emerald-300">✓ Full payment confirmed. No balance payment required.</p>
            <p className="text-xs text-slate-400 mt-0.5">
              Your full payment has been verified by Nexum Admin. The provider will proceed with pickup and delivery.
            </p>
          </div>
        )}

        {/* ── Accept Secured Job banner ── */}
        {showAcceptButton && (
          <div className="mb-6 rounded-xl border border-amber-500/30 bg-amber-500/5 px-5 py-4 space-y-3">
            <div className="flex items-start gap-3">
              <span className="mt-0.5 text-lg">⚠</span>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-amber-300">Action required — accept the secured job to begin</p>
                <p className="text-xs text-slate-400 mt-0.5">
                  Review the job details and payment workflow below, then confirm acceptance.
                  A commercial terms snapshot will be recorded at the moment of your acceptance.
                </p>
              </div>
            </div>

            {/* Terms confirmation checkbox */}
            <label className="flex items-start gap-3 cursor-pointer rounded-lg border border-slate-700 bg-slate-900/60 px-4 py-3 hover:border-slate-600 transition-colors">
              <input
                type="checkbox"
                checked={termsChecked}
                onChange={(e) => setTermsChecked(e.target.checked)}
                className="mt-0.5 h-4 w-4 accent-emerald-500 cursor-pointer shrink-0"
              />
              <span className="text-xs text-slate-300 leading-relaxed">
                I confirm that I have reviewed the secured job details, payment workflow, delivery
                confirmation rule (48 working hours), and pilot disclaimer. I understand that Nexum
                SecureFlow is a workflow coordination tool only and not a regulated financial service.
                A commercial terms snapshot will be recorded for audit and dispute purposes.
              </span>
            </label>

            <div className="flex items-center gap-3">
              <button
                onClick={handleAcceptJob}
                disabled={acceptState === "loading" || !termsChecked}
                className="rounded-lg border border-emerald-500/40 bg-emerald-500/15 px-4 py-2 text-xs font-semibold text-emerald-300 hover:bg-emerald-500/25 active:scale-95 transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {acceptState === "loading" ? "Recording terms & accepting…" : "Accept Secured Job →"}
              </button>
              {!termsChecked && (
                <p className="text-[10px] text-slate-600">Please confirm the terms above to proceed.</p>
              )}
            </div>
          </div>
        )}

        {/* ── Upload Payment Proof banner ── */}
        {showUploadProof && submitState !== "success" && (
          <div className="mb-6 flex flex-wrap items-start gap-3 rounded-xl border border-blue-500/20 bg-blue-500/5 px-5 py-4">
            <span className="mt-0.5 text-lg">📎</span>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-blue-300">
                {job.payment_status === "Balance Pending"
                  ? "Upload balance payment proof to close the job"
                  : isFullPayment
                  ? "Upload full payment proof to activate the job"
                  : "Upload payment proof to confirm your deposit"}
              </p>
              <p className="text-xs text-slate-400 mt-0.5">
                Transfer the amount and upload your bank receipt. Nexum will verify and update the job status.
              </p>
            </div>
            <button
              onClick={() => openModal(defaultPaymentType)}
              className="shrink-0 rounded-lg border border-blue-500/40 bg-blue-500/15 px-4 py-2 text-xs font-semibold text-blue-300 hover:bg-blue-500/25 active:scale-95 transition-all cursor-pointer"
            >
              Upload Payment Proof
            </button>
          </div>
        )}

        {/* ── Job hero ── */}
        <div className="mb-8">
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <span className="font-mono text-sm font-bold text-emerald-400">{job.job_reference}</span>
            <span className="rounded-full border border-slate-700 bg-slate-800 px-2 py-0.5 text-xs text-slate-400">
              {job.service_type}
            </span>
            <span className={`rounded-full border px-2 py-0.5 text-xs font-medium ${paymentColors[job.payment_status] ?? "bg-slate-800 text-slate-400 border-slate-700"}`}>
              {job.payment_status}
            </span>
            <span className={`rounded-full border px-2 py-0.5 text-xs font-medium ${jobStatusColors[job.job_status] ?? "bg-slate-800 text-slate-400 border-slate-700"}`}>
              {job.job_status}
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
              compact={true}
            />

            {/* ── Supplier / Counterparty Profile (read-only, no contact) ── */}
            {supplierLinks.map((link) => (
              <SupplierProfileCard
                key={link.id}
                supplier={link.supplier_counterparties!}
                link={link}
                compact
                showContact={false}
                showEmpty={false}
              />
            ))}

            {/* Supplier Payment Protection */}
            <SupplierPaymentProtectionCard jobReference={jobId} role="customer" />

            {/* Milestone Evidence Verification */}
            <SupplierMilestoneEvidenceCard jobReference={jobId} role="customer" />

            {/* Supplier Trust Score */}
            <SupplierTrustScoreCard jobReference={jobId} role="customer" />

            {/* Supplier Exposure Limit */}
            <SupplierExposureLimitCard jobReference={jobId} role="customer" />

            {/* Buyer–Supplier Relationship History */}
            <BuyerSupplierRelationshipCard jobReference={jobId} role="customer" />

            {/* Procurement Order Control */}
            <ProcurementOrderCard jobReference={jobId} role="customer" />

            {/* Action Recommendations (customer role — assigned to customer only) */}
            <ActionRecommendationCard jobReference={jobId} role="customer" />

            <Section title="Service Provider">
              <div className="flex items-start gap-4">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-purple-500/30 bg-purple-500/10 text-lg text-purple-400">◈</div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-slate-100">
                    {maskedParties?.service_provider.display_name ?? job.service_provider}
                    {maskedParties?.service_provider.is_masked && (
                      <span className="ml-2 rounded-full bg-amber-500/15 border border-amber-500/30 px-1.5 py-0.5 text-xs font-normal text-amber-400">masked</span>
                    )}
                  </p>
                  <p className="mt-1 text-xs text-slate-500">Executing this secured job on your behalf</p>
                </div>
              </div>
            </Section>

            <Section title="Your Account">
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
              </div>
            </Section>

            <Section title="How It Works">
              <ul className="flex flex-col gap-2 text-xs text-slate-500">
                {isFullPayment ? (
                  <>
                    <li className="flex items-start gap-2">
                      <span className="mt-0.5 shrink-0 text-emerald-500">●</span>
                      Accept the job and pay the full amount upfront to unlock provider execution.
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="mt-0.5 shrink-0 text-emerald-500">●</span>
                      Once goods are delivered, the provider uploads the Proof of Delivery (POD).
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="mt-0.5 shrink-0 text-emerald-500">●</span>
                      Confirm cargo receipt to close the job. No balance payment is required.
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="mt-0.5 shrink-0 text-emerald-500">●</span>
                      Full payment is eligible for release under the agreed workflow once receipt is confirmed.
                    </li>
                  </>
                ) : (
                  <>
                    <li className="flex items-start gap-2">
                      <span className="mt-0.5 shrink-0 text-emerald-500">●</span>
                      Accept the job and pay the deposit to unlock provider execution.
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="mt-0.5 shrink-0 text-emerald-500">●</span>
                      Once goods are delivered, the provider uploads the Proof of Delivery (POD).
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="mt-0.5 shrink-0 text-amber-400">●</span>
                      Balance becomes payable only after customer receipt confirmation or auto-confirmation.
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="mt-0.5 shrink-0 text-emerald-500">●</span>
                      Nexum Admin verifies each payment before funds are eligible for release under the agreed workflow.
                    </li>
                  </>
                )}
              </ul>
            </Section>
          </div>
        </div>

        {/* ── Payment Holding & Controlled Release ── */}
        <div className="mb-6">
          <PaymentHoldingCard
            jobReference={job.job_reference}
            role="customer"
            actorId={profile?.id}
            actorRole="customer"
            actorName={profile?.full_name ?? "Customer"}
            currency={job.currency}
            onUpdate={loadJob}
          />
        </div>

        {/* ── Release / Settlement ── */}
        <div className="mb-6">
          <ReleaseSettlementCard
            jobReference={job.job_reference}
            role="customer"
            actorId={profile?.id}
            actorRole="customer"
            actorName={profile?.full_name ?? "Customer"}
            currency={job.currency}
          />
        </div>

        {/* ── Payment Ledger ── */}
        <div className="mb-6">
          <PaymentLedgerCard
            jobReference={job.job_reference}
            role="customer"
            actorId={profile?.id}
            actorRole="customer"
            actorName={profile?.full_name ?? "Customer"}
            currency={job.currency}
            isFullPayment={isFullPayment}
            deliveryConfirmationStatus={job.delivery_confirmation_status}
          />
        </div>

        {/* ── Activity Timeline ── */}
        <div className="mb-6 bg-slate-900 border border-slate-800 rounded-xl p-5">
          <JobTimeline
            jobReference={job.job_reference}
            role="customer"
            token={typeof window !== "undefined" ? (localStorage.getItem("sb-access-token") ?? undefined) : undefined}
          />
        </div>

        {/* ── Delivery Receipt Confirmation ── */}
        <div className="mb-6">
          <DeliveryConfirmationCard
            jobReference={job.job_reference}
            userRole="customer"
            actorId={profile?.id}
            actorName={profile?.full_name ?? "Customer"}
            paymentTerms={job.payment_terms}
            requiredDeposit={job.required_deposit}
            jobValue={job.job_value}
            deliveryJobStatus={job.delivery_confirmation_status}
            onUpdate={loadJob}
          />
        </div>

        {/* ── Dispute & Claims ── */}
        <div className="mb-6">
          <DisputeCaseCard
            jobReference={job.job_reference}
            userRole="customer"
            actorId={profile?.id}
            actorName={profile?.full_name ?? "Customer"}
            currency={job.currency}
            customerCompanyId={profile?.company_id}
            onUpdate={loadJob}
          />
        </div>

        {/* ── Net Settlement Statement ── */}
        <div className="mb-6">
          <NetSettlementCard
            jobReference={job.job_reference}
            role="customer"
            currency={job.currency}
          />
        </div>

        {/* ── Nexum Brain ── */}
        {!coreOnly && (
          <div className="mb-6">
            <NexumBrainPanel
              job={job}
              userRole="customer"
              actorId={profile?.id}
              actorName={profile?.full_name ?? "Customer"}
            />
          </div>
        )}

        {/* ── Trade Document Upload ── */}
        <div className="mb-6">
          <TradeDocumentUploadPanel
            jobReference={job.job_reference}
            uploaderRole="customer"
            uploaderName={profile?.full_name ?? "Customer"}
            serviceType={job.service_type}
            onExtractionComplete={() => setTrackingRefreshKey((k) => k + 1)}
          />
        </div>

        {/* ── Document Checklist ── */}
        <div className="mb-6">
          <JobDocumentPanel
            jobReference={job.job_reference}
            userRole="customer"
            companyId={profile?.company_id ?? undefined}
            actorId={profile?.id}
            actorName={profile?.full_name ?? "Customer"}
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
              userRole="customer"
              actorId={profile?.id}
              actorName={profile?.full_name ?? "Customer"}
            />
          </div>
        )}

        {/* ── Workflow Tasks ── */}
        {!coreOnly && (
          <div className="mb-6">
            <WorkflowTaskPanel
              jobReference={job.job_reference}
              assignedRole="customer"
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
              userRole="customer"
              job={{
                payment_status:    job.payment_status,
                current_milestone: job.current_milestone,
                job_status:        job.job_status,
                created_at:        job.created_at,
              }}
              actorId={profile?.id}
              actorName={profile?.full_name ?? "Customer"}
            />
          </div>
        )}

        {/* ── Shipment Tracking ── */}
        {!coreOnly && (
          <div className="mb-6">
            <ShipmentTrackingPanel
              key={trackingRefreshKey}
              jobReference={job.job_reference}
              userRole="customer"
              actorId={profile?.id}
              actorName={profile?.full_name ?? "Customer"}
            />
          </div>
        )}

        {/* ── Delay Impact ── */}
        {!coreOnly && (
          <div className="mb-6">
            <DelayImpactCard
              jobReference={job.job_reference}
              userRole="customer"
              actorId={profile?.id}
              actorName={profile?.full_name ?? "Customer"}
            />
          </div>
        )}

        {/* ── Business Context ── */}
        {!coreOnly && (
          <div className="mb-6">
            <BusinessContextPanel
              jobReference={job.job_reference}
              userRole="customer"
              actorId={profile?.id}
              actorName={profile?.full_name ?? "Customer"}
              currency={job.currency}
            />
          </div>
        )}

        {/* ── Communication Log ── */}
        {!coreOnly && (
          <div className="mb-6">
            <CommunicationLogCard
              jobReference={job.job_reference}
              maxItems={5}
              compact={true}
            />
          </div>
        )}

        {/* ── Activity Log ── */}
        <Section title="Activity Log">
          {logs.length === 0 ? (
            <p className="text-xs text-slate-600">No activity recorded for this job yet.</p>
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
            role="customer"
            actorId={profile?.id}
            actorName={profile?.full_name ?? profile?.company_name ?? "Customer"}
          />
        </div>

        {/* ── Change Requests ── */}
        <div className="mt-6">
          <ChangeRequestCard
            jobReference={job.job_reference}
            role="customer"
            actorId={profile?.id}
            actorName={profile?.full_name ?? profile?.company_name ?? "Customer"}
            jobCurrency={job.currency}
          />
        </div>

        {/* ── Evidence Pack ── */}
        <div className="mt-6">
          <EvidencePackCard
            jobReference={job.job_reference}
            role="customer"
            actorId={profile?.id}
            actorName={profile?.full_name ?? profile?.company_name ?? "Customer"}
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
