"use client";
import { use, useState, useEffect, useRef, useCallback } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";
import { OPTIONAL_MODULES_DISABLED } from "@/lib/appEnv";
import { insertAuditLog } from "@/lib/auditLog";
import { JobFlowTracker } from "@/components/JobFlowTracker";
import { DocumentList } from "@/components/DocumentList";
import { LogoutButton } from "@/components/LogoutButton";
import { InviteLink } from "@/components/InviteLink";
import { SendInviteEmail } from "@/components/SendInviteEmail";
import { useAuth } from "@/contexts/AuthContext";
import { PilotBanner } from "@/components/PilotBanner";
import { TradeIntelligencePanel } from "@/components/TradeIntelligencePanel";
import { NexumBrainPanel } from "@/components/NexumBrainPanel";
import { DocumentIntelligencePanel } from "@/components/DocumentIntelligencePanel";
import { OntologySuggestionsPanel } from "@/components/OntologySuggestionsPanel";
import { DataConfidenceCard } from "@/components/DataConfidenceCard";
import { ExceptionPanel } from "@/components/ExceptionPanel";
import { CompanyIntelligenceCard } from "@/components/CompanyIntelligenceCard";
import { ShipmentTrackingPanel } from "@/components/ShipmentTrackingPanel";
import { DelayImpactCard } from "@/components/DelayImpactCard";
import { NotificationBell } from "@/components/NotificationBell";
import { createNotification } from "@/lib/notifications";
import { WorkflowTaskPanel } from "@/components/WorkflowTaskPanel";
import { JobDocumentPanel } from "@/components/JobDocumentPanel";
import { BusinessContextPanel } from "@/components/BusinessContextPanel";
import { TradeOntologyGraph } from "@/components/TradeOntologyGraph";
import { CommunicationLogCard } from "@/components/CommunicationLogCard";
import { PaymentLedgerCard } from "@/components/PaymentLedgerCard";
import { PaymentHoldingCard } from "@/components/PaymentHoldingCard";
import { ReconciliationCard } from "@/components/ReconciliationCard";
import { ReleaseSettlementCard } from "@/components/ReleaseSettlementCard";
import { CapitalReadinessCard } from "@/components/CapitalReadinessCard";
import { FinancingOfferCard } from "@/components/FinancingOfferCard";
import { DeliveryConfirmationCard } from "@/components/DeliveryConfirmationCard";
import { DisputeCaseCard } from "@/components/DisputeCaseCard";
import { PayoutProfileCard } from "@/components/PayoutProfileCard";
import { ReleaseGovernanceCard } from "@/components/ReleaseGovernanceCard";
import { PaymentComplianceCard } from "@/components/PaymentComplianceCard";
import { EvidencePackCard } from "@/components/EvidencePackCard";
import { JobTermsSnapshotCard } from "@/components/JobTermsSnapshotCard";
import { ChangeRequestCard } from "@/components/ChangeRequestCard";
import { LiabilityReviewCard } from "@/components/LiabilityReviewCard";
import { ClaimReserveCard } from "@/components/ClaimReserveCard";
import { NetSettlementCard } from "@/components/NetSettlementCard";
import { AccountingExportCard } from "@/components/AccountingExportCard";
import { CommercialValueCard } from "@/components/CommercialValueCard";
import { HsCodeCard } from "@/components/HsCodeCard";
import { SupplierProfileCard, SupplierProfileEmptyCard } from "@/components/SupplierProfileCard";
import { SupplierPaymentProtectionCard } from "@/components/SupplierPaymentProtectionCard";
import { SupplierMilestoneEvidenceCard } from "@/components/SupplierMilestoneEvidenceCard";
import { SupplierTrustScoreCard } from "@/components/SupplierTrustScoreCard";
import { SupplierExposureLimitCard } from "@/components/SupplierExposureLimitCard";
import { BuyerSupplierRelationshipCard } from "@/components/BuyerSupplierRelationshipCard";
import { ProcurementOrderCard } from "@/components/ProcurementOrderCard";
import { ProcurementDiscrepancyCard } from "@/components/ProcurementDiscrepancyCard";
import { ActionRecommendationCard } from "@/components/ActionRecommendationCard";
import { InternalControlCard } from "@/components/InternalControlCard";
import { RiskRegisterCard } from "@/components/RiskRegisterCard";
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
  customer_email:              string | null;
  service_provider_company_id: string | null;
  customer_company_id:         string | null;
  created_at:                  string;
  updated_at:                  string;
  // ── Commercial Value Breakdown ──
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
  // Secured payment scope selection (columns added by secured_jobs_scope_complete_v1.sql)
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

type ActionState = "idle" | "loading" | "success" | "error";

// ─── Colour maps ──────────────────────────────────────────────────────────────

const paymentColors: Record<string, string> = {
  "Payment Pending":             "bg-amber-500/15 text-amber-400 border-amber-500/30",
  "Deposit Proof Uploaded":      "bg-amber-500/15 text-amber-400 border-amber-500/30",
  "Full Payment Proof Uploaded": "bg-amber-500/15 text-amber-400 border-amber-500/30",
  "Deposit Confirmed":           "bg-blue-500/15 text-blue-400 border-blue-500/30",
  "Balance Pending":             "bg-purple-500/15 text-purple-400 border-purple-500/30",
  "Balance Proof Uploaded":      "bg-purple-500/15 text-purple-400 border-purple-500/30",
  "Payment Proof Uploaded":      "bg-blue-500/15 text-blue-400 border-blue-500/30",
  "Fully Paid":                  "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
  "Disputed":                    "bg-red-500/15 text-red-400 border-red-500/30",
  "Refunded":                    "bg-slate-500/15 text-slate-400 border-slate-500/30",
};

const jobStatusColors: Record<string, string> = {
  "Awaiting Customer Acceptance":  "bg-amber-500/15 text-amber-400 border-amber-500/30",
  "Awaiting Deposit":              "bg-amber-500/15 text-amber-400 border-amber-500/30",
  "Awaiting Deposit Confirmation": "bg-amber-500/15 text-amber-400 border-amber-500/30",
  "Ready for Execution":           "bg-blue-500/15 text-blue-400 border-blue-500/30",
  "In Progress":                   "bg-blue-500/15 text-blue-400 border-blue-500/30",
  "Delivered":                     "bg-purple-500/15 text-purple-400 border-purple-500/30",
  "Completed":                     "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
  "Disputed":                      "bg-red-500/15 text-red-400 border-red-500/30",
  "Cancelled":                     "bg-slate-500/15 text-slate-400 border-slate-500/30",
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

// NOTE: secure_logistics_fee, secure_cargo_supplier_payment, secure_duty_tax,
// secure_insurance, secure_additional_charges, payment_scope_note,
// secured_amount_note, and total_secured_base_amount are intentionally
// OMITTED from SELECT_COLS until secured_jobs_scope_complete_v1.sql has been
// applied to the database. PostgREST returns 400 if a non-existent column is
// selected. Once the migration is applied, append those column names here.
const SELECT_COLS =
  "job_reference, service_provider, customer, service_type, route, cargo_description, currency, job_value, payment_terms, required_deposit, balance_terms, payment_status, job_status, current_milestone, risk_level, invite_token, customer_email, service_provider_company_id, customer_company_id, created_at, updated_at, incoterm, cargo_value_amount, cargo_value_currency, cargo_value_fx_rate_to_base, cargo_value_base_amount, logistics_fee_amount, logistics_fee_currency, duty_tax_estimate_amount, duty_tax_currency, insurance_cost_amount, insurance_cost_currency, additional_charges_amount, additional_charges_currency, total_secured_amount, total_secured_currency, base_currency, hs_code, hs_code_description, hs_code_source, commodity_category, permit_required, permit_note, customs_risk_level, duty_rate_estimate, tax_rate_estimate";

function isFullPaymentJob(job: { payment_terms: string; required_deposit: number | null; job_value: number }): boolean {
  return (
    job.payment_terms.toLowerCase().includes("full payment") ||
    (job.required_deposit !== null && job.required_deposit >= job.job_value)
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function AdminJobDetailPage({
  params,
}: {
  params: Promise<{ job_reference: string }>;
}) {
  // All useState calls must come before use()
  const { profile } = useAuth();
  const [fetchState, setFetchState]               = useState<FetchState>({ status: "loading" });
  const [depositState, setDepositState]           = useState<ActionState>("idle");
  const [depositError, setDepositError]           = useState<{ message: string; code?: string; details?: string; hint?: string } | null>(null);
  const [balanceState, setBalanceState]           = useState<ActionState>("idle");
  const [balanceError, setBalanceError]           = useState<{ message: string; code?: string; details?: string; hint?: string } | null>(null);
  const [verifyDepositState, setVerifyDepositState] = useState<ActionState>("idle");
  const [verifyDepositError, setVerifyDepositError] = useState<{ message: string; code?: string; details?: string; hint?: string } | null>(null);
  const [verifyBalanceState, setVerifyBalanceState]           = useState<ActionState>("idle");
  const [verifyBalanceError, setVerifyBalanceError]           = useState<{ message: string; code?: string; details?: string; hint?: string } | null>(null);
  const [verifyFullPaymentState, setVerifyFullPaymentState]   = useState<ActionState>("idle");
  const [verifyFullPaymentError, setVerifyFullPaymentError]   = useState<{ message: string; code?: string; details?: string; hint?: string } | null>(null);
  const [recalcState, setRecalcState]             = useState<ActionState>("idle");
  const [recalcResult, setRecalcResult]           = useState<string | null>(null);
  const [recalcError, setRecalcError]             = useState<{ message: string; code?: string } | null>(null);
  const [logs, setLogs]                           = useState<AuditLogRow[]>([]);
  const [supplierLinks, setSupplierLinks]         = useState<JobSupplierLink[]>([]);
  // ── Stability sprint state ──────────────────────────────────────────────────
  const [pageTimedOut, setPageTimedOut]           = useState(false);
  const [coreOnly, setCoreOnly]                   = useState(OPTIONAL_MODULES_DISABLED);
  const [bgLoading, setBgLoading]                 = useState(false);
  const [diagOpen, setDiagOpen]                   = useState(false);
  const [queryTimings, setQueryTimings]           = useState<{ name: string; ms: number; ok: boolean }[]>([]);
  const timerRef   = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountedRef = useRef(true);

  const { job_reference: jobId } = use(params);

  const loadLogs = useCallback(async () => {
    const t0 = Date.now();
    try {
      const { data } = await supabase
        .from("audit_logs")
        .select("id, actor_role, actor_name, action, description, created_at")
        .eq("job_reference", jobId)
        .order("created_at", { ascending: false })
        .limit(10);
      if (!mountedRef.current) return;
      setLogs((data as AuditLogRow[]) ?? []);
      setQueryTimings(p => [...p, { name: "audit_logs", ms: Date.now() - t0, ok: true }]);
    } catch {
      if (mountedRef.current) {
        setQueryTimings(p => [...p, { name: "audit_logs", ms: Date.now() - t0, ok: false }]);
      }
    }
  }, [jobId]);

  const loadSupplierLinks = useCallback(async () => {
    const t0 = Date.now();
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
      setQueryTimings(p => [...p, { name: "supplier_links", ms: Date.now() - t0, ok: res.ok }]);
    } catch {
      if (mountedRef.current) {
        setQueryTimings(p => [...p, { name: "supplier_links", ms: Date.now() - t0, ok: false }]);
      }
    }
  }, [jobId]);

  const loadJob = useCallback(async () => {
    const t0 = Date.now();
    // 10s page-level timeout
    timerRef.current = setTimeout(() => {
      if (mountedRef.current) setPageTimedOut(true);
    }, 10000);

    try {
      const { data, error } = await supabase
        .from("secured_jobs")
        .select(SELECT_COLS)
        .eq("job_reference", jobId)
        .maybeSingle();

      if (!mountedRef.current) return;
      if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null; }

      if (error) {
        setFetchState({ status: "error", message: error.message });
        setQueryTimings(p => [...p, { name: "secured_jobs", ms: Date.now() - t0, ok: false }]);
      } else if (!data) {
        setFetchState({ status: "notfound" });
      } else {
        setFetchState({ status: "success", job: data as JobRow });
        setQueryTimings(p => [...p, { name: "secured_jobs", ms: Date.now() - t0, ok: true }]);
        // Stage 2: load non-blocking background data
        setBgLoading(true);
        void Promise.all([loadLogs(), loadSupplierLinks()]).finally(() => {
          if (mountedRef.current) setBgLoading(false);
        });
      }
    } catch (err) {
      if (!mountedRef.current) return;
      if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null; }
      setFetchState({ status: "error", message: String(err) });
      setQueryTimings(p => [...p, { name: "secured_jobs", ms: Date.now() - t0, ok: false }]);
    }
  }, [jobId, loadLogs, loadSupplierLinks]);

  useEffect(() => {
    mountedRef.current = true;
    setFetchState({ status: "loading" });
    setPageTimedOut(false);
    setQueryTimings([]);
    void loadJob();
    return () => {
      mountedRef.current = false;
      if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null; }
    };
  }, [jobId, loadJob]);

  // ── Structured error helper ─────────────────────────────────────────────────
  function pgErr(e: unknown) {
    const raw = e as { message?: string; code?: string; details?: string; hint?: string };
    return {
      message: raw?.message ?? "Database update failed",
      code:    raw?.code,
      details: raw?.details ?? undefined,
      hint:    raw?.hint    ?? undefined,
    };
  }

  async function handleConfirmDeposit() {
    setDepositState("loading");
    setDepositError(null);
    try {
      const { error } = await supabase
        .from("secured_jobs")
        .update({
          payment_status:    "Deposit Confirmed",
          job_status:        "Ready for Execution",
          current_milestone: "Deposit Confirmed",
          updated_at:        new Date().toISOString(),
        })
        .eq("job_reference", jobId);

      if (error) { setDepositState("error"); setDepositError(pgErr(error)); return; }

      insertAuditLog({
        job_reference: jobId,
        actor_role:    "admin",
        actor_name:    profile?.full_name ?? "Nexum Admin",
        action:        "confirm_deposit",
        description:   "Admin confirmed deposit payment. Job is now ready for execution.",
      }).catch(console.warn);

      setDepositState("success");
      void loadJob();
      void loadLogs();
    } catch (err) {
      setDepositState("error");
      setDepositError(pgErr(err));
    } finally {
      setDepositState((prev) => (prev === "loading" ? "error" : prev));
    }
  }

  async function handleConfirmBalance() {
    setBalanceState("loading");
    setBalanceError(null);
    try {
      const { error } = await supabase
        .from("secured_jobs")
        .update({
          payment_status:    "Fully Paid",
          job_status:        "Completed",
          current_milestone: "Fully Paid / Closed",
          updated_at:        new Date().toISOString(),
        })
        .eq("job_reference", jobId);

      if (error) { setBalanceState("error"); setBalanceError(pgErr(error)); return; }

      insertAuditLog({
        job_reference: jobId,
        actor_role:    "admin",
        actor_name:    profile?.full_name ?? "Nexum Admin",
        action:        "confirm_balance",
        description:   "Admin confirmed balance payment. Job is fully paid and closed.",
      }).catch(console.warn);

      setBalanceState("success");
      void loadJob();
      void loadLogs();
    } catch (err) {
      setBalanceState("error");
      setBalanceError(pgErr(err));
    } finally {
      setBalanceState((prev) => (prev === "loading" ? "error" : prev));
    }
  }

  async function handleVerifyDepositProof() {
    setVerifyDepositState("loading");
    setVerifyDepositError(null);
    try {
    const { error } = await supabase
      .from("secured_jobs")
      .update({
        payment_status:    "Deposit Confirmed",
        job_status:        "Ready for Execution",
        current_milestone: "Deposit Confirmed",
        updated_at:        new Date().toISOString(),
      })
      .eq("job_reference", jobId);

    if (error) {
      setVerifyDepositState("error");
      setVerifyDepositError(pgErr(error));
      return;
    }

    insertAuditLog({
      job_reference: jobId,
      actor_role:    "admin",
      actor_name:    profile?.full_name ?? "Nexum Admin",
      action:        "deposit_proof_verified",
      description:   "Nexum Admin verified customer deposit proof and activated the job for execution.",
    }).catch(console.warn);

    // Notify provider and customer
    await createNotification({
      jobReference: jobId, recipientRole: "service_provider",
      notificationType: "Deposit Verified", priority: "High",
      title: `Deposit verified — Job ${jobId} is now ready for execution`,
      message: "The deposit payment has been confirmed by Nexum Admin. You may proceed with job execution.",
      actionUrl: `/provider/jobs/${jobId}`,
      actorId: profile?.id, actorName: profile?.full_name ?? "Nexum Admin", actorRole: "admin",
    });
    await createNotification({
      jobReference: jobId, recipientRole: "customer",
      notificationType: "Deposit Verified", priority: "Medium",
      title: `Your deposit for Job ${jobId} has been confirmed`,
      message: "Your deposit payment has been verified. Your service provider has been notified to begin execution.",
      actionUrl: `/customer/jobs/${jobId}`,
      actorId: profile?.id, actorName: profile?.full_name ?? "Nexum Admin", actorRole: "admin",
    });

    // Auto-send email to provider and customer
    const jobData = fetchState.status === "success" ? fetchState.job : null;
    void fetch("/api/send-communication", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        channel: "Email",
        recipientRole: "service_provider",
        recipientCompanyId: jobData?.service_provider_company_id,
        subject: `✅ Deposit Verified — Job ${jobId} Ready for Execution`,
        message: `The deposit payment for Job ${jobId} has been confirmed by Nexum Admin.\n\nYou may now proceed with job execution. Please coordinate pickup with the customer and update the milestone accordingly.`,
        jobReference: jobId,
        actorId: profile?.id, actorRole: "admin", actorName: profile?.full_name,
      }),
    });
    void fetch("/api/send-communication", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        channel: "Email",
        recipientRole: "customer",
        recipientCompanyId: jobData?.customer_company_id,
        subject: `✅ Your Deposit for Job ${jobId} Has Been Confirmed`,
        message: `Your deposit payment for Job ${jobId} has been verified by Nexum.\n\nYour service provider has been notified to begin execution. We will keep you updated on the progress.`,
        jobReference: jobId,
        actorId: profile?.id, actorRole: "admin", actorName: profile?.full_name,
      }),
    });

      setVerifyDepositState("success");
      void loadJob();
      void loadLogs();
    } catch (err) {
      setVerifyDepositState("error");
      setVerifyDepositError(pgErr(err));
    } finally {
      setVerifyDepositState((prev) => (prev === "loading" ? "error" : prev));
    }
  }

  async function handleVerifyBalanceProof() {
    setVerifyBalanceState("loading");
    setVerifyBalanceError(null);
    try {
      const { error } = await supabase
        .from("secured_jobs")
        .update({
          payment_status:    "Fully Paid",
          job_status:        "Completed",
          current_milestone: "Fully Paid / Closed",
          updated_at:        new Date().toISOString(),
        })
        .eq("job_reference", jobId);

      if (error) { setVerifyBalanceState("error"); setVerifyBalanceError(pgErr(error)); return; }

      insertAuditLog({
        job_reference: jobId,
        actor_role:    "admin",
        actor_name:    profile?.full_name ?? "Nexum Admin",
        action:        "verify_balance_proof",
        description:   "Admin verified balance payment proof. Job is fully paid and closed.",
      }).catch(console.warn);

      // Notify provider and customer (fire-and-forget)
      void createNotification({
        jobReference: jobId, recipientRole: "service_provider",
        notificationType: "Balance Verified", priority: "High",
        title: `Balance payment verified — Job ${jobId} is fully paid and closed`,
        message: "The final balance payment has been confirmed. This job is now complete.",
        actionUrl: `/provider/jobs/${jobId}`,
        actorId: profile?.id, actorName: profile?.full_name ?? "Nexum Admin", actorRole: "admin",
      });
      void createNotification({
        jobReference: jobId, recipientRole: "customer",
        notificationType: "Balance Verified", priority: "Medium",
        title: `Your balance payment for Job ${jobId} has been confirmed`,
        message: "Your final payment has been verified. This job is now complete. Thank you for your business.",
        actionUrl: `/customer/jobs/${jobId}`,
        actorId: profile?.id, actorName: profile?.full_name ?? "Nexum Admin", actorRole: "admin",
      });

      // Auto-send emails (fire-and-forget)
      const jobData2 = fetchState.status === "success" ? fetchState.job : null;
      void fetch("/api/send-communication", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          channel: "Email", recipientRole: "service_provider",
          recipientCompanyId: jobData2?.service_provider_company_id,
          subject: `✅ Balance Verified — Job ${jobId} Fully Paid & Closed`,
          message: `The final balance payment for Job ${jobId} has been confirmed by Nexum.\n\nThis job is now fully paid and closed. Thank you for your service.`,
          jobReference: jobId, actorId: profile?.id, actorRole: "admin", actorName: profile?.full_name,
        }),
      });
      void fetch("/api/send-communication", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          channel: "Email", recipientRole: "customer",
          recipientCompanyId: jobData2?.customer_company_id,
          subject: `✅ Job ${jobId} Is Fully Paid and Closed`,
          message: `Your final balance payment for Job ${jobId} has been verified by Nexum.\n\nThis job is now complete. Thank you for your business with Nexum SecureFlow.`,
          jobReference: jobId, actorId: profile?.id, actorRole: "admin", actorName: profile?.full_name,
        }),
      });

      setVerifyBalanceState("success");
      void loadJob();
      void loadLogs();
    } catch (err) {
      setVerifyBalanceState("error");
      setVerifyBalanceError(pgErr(err));
    } finally {
      setVerifyBalanceState((prev) => (prev === "loading" ? "error" : prev));
    }
  }

  async function handleVerifyFullPayment() {
    setVerifyFullPaymentState("loading");
    setVerifyFullPaymentError(null);
    try {
      const { error } = await supabase
        .from("secured_jobs")
        .update({
          payment_status:    "Fully Paid",
          job_status:        "Ready for Execution",
          current_milestone: "Full Payment Confirmed",
          updated_at:        new Date().toISOString(),
        })
        .eq("job_reference", jobId);

      if (error) { setVerifyFullPaymentState("error"); setVerifyFullPaymentError(pgErr(error)); return; }

      insertAuditLog({
        job_reference: jobId,
        actor_role:    "admin",
        actor_name:    profile?.full_name ?? "Nexum Admin",
        action:        "full_payment_verified",
        description:   "Nexum Admin verified full payment proof. Job is now ready for execution.",
      }).catch(console.warn);

      void createNotification({
        jobReference: jobId, recipientRole: "service_provider",
        notificationType: "Deposit Verified", priority: "High",
        title: `Full payment verified — Job ${jobId} is ready for execution`,
        message: "Full payment has been confirmed. You may proceed with job execution immediately.",
        actionUrl: `/provider/jobs/${jobId}`,
        actorId: profile?.id, actorName: profile?.full_name ?? "Nexum Admin", actorRole: "admin",
      });
      void createNotification({
        jobReference: jobId, recipientRole: "customer",
        notificationType: "Deposit Verified", priority: "Medium",
        title: `Your full payment for Job ${jobId} has been confirmed`,
        message: "Your full payment has been verified. Your service provider has been notified to begin.",
        actionUrl: `/customer/jobs/${jobId}`,
        actorId: profile?.id, actorName: profile?.full_name ?? "Nexum Admin", actorRole: "admin",
      });

      setVerifyFullPaymentState("success");
      void loadJob();
      void loadLogs();
    } catch (err) {
      setVerifyFullPaymentState("error");
      setVerifyFullPaymentError(pgErr(err));
    } finally {
      setVerifyFullPaymentState((prev) => (prev === "loading" ? "error" : prev));
    }
  }

  // ── Recalculate Payment Scope ────────────────────────────────────────────────
  async function handleRecalculateScope() {
    setRecalcState("loading");
    setRecalcResult(null);
    setRecalcError(null);
    const controller = new AbortController();
    const tid = setTimeout(() => controller.abort(), 10_000);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token ?? "";
      const res = await fetch("/api/recalculate-payment-scope", {
        method:  "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body:    JSON.stringify({ job_reference: jobId }),
        signal:  controller.signal,
      });
      const json = await res.json().catch(() => ({})) as Record<string, unknown>;
      if (!res.ok) {
        setRecalcState("error");
        setRecalcError({ message: (json.error as string) ?? "Recalculate failed", code: json.code as string | undefined });
        return;
      }
      setRecalcState("success");
      setRecalcResult((json.message as string) ?? "Payment scope recalculated.");
      void loadJob();
      void loadLogs();
    } catch (err) {
      const isAbort = err instanceof Error && err.name === "AbortError";
      setRecalcState("error");
      setRecalcError({ message: isAbort ? "Request timed out (10s). Try again." : (err instanceof Error ? err.message : "Unexpected error.") });
    } finally {
      clearTimeout(tid);
      setRecalcState((prev) => (prev === "loading" ? "error" : prev));
    }
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
          <span className="rounded-full border border-blue-500/30 bg-blue-500/10 px-3 py-1 text-blue-400 font-medium">Admin</span>
          <Link href="/admin" className="hover:text-slate-100 transition-colors">Dashboard</Link>
          <Link href="/admin/jobs" className="hover:text-slate-100 transition-colors">All Jobs</Link>
          <Link href="/admin/exceptions" className="hover:text-slate-100 transition-colors">Exceptions</Link>
          <Link href="/admin/companies"      className="hover:text-slate-100 transition-colors">Companies</Link>
          <Link href="/admin/command-center" className="hover:text-slate-100 transition-colors">Command Center</Link>
          <Link href="/admin/demo-checklist" className="hover:text-slate-100 transition-colors">Checklist</Link>
          <Link href="/admin/demo-reset" className="hover:text-amber-300 text-amber-500/70 transition-colors">Demo Reset</Link>
          <Link href="/admin/notifications" className="hover:text-slate-100 transition-colors">Notifications</Link>
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
              <div className="h-7 w-7 animate-spin rounded-full border-2 border-blue-500 border-t-transparent" />
              <p className="text-sm text-slate-400">Loading job {jobId}…</p>
            </>
          ) : (
            <div className="max-w-md w-full rounded-2xl border border-amber-500/30 bg-amber-500/5 px-6 py-6 text-left">
              <p className="mb-1 text-sm font-semibold text-amber-300">Job core data is taking too long</p>
              <p className="mb-4 text-xs text-slate-400">
                The secured_jobs query for <span className="font-mono text-slate-300">{jobId}</span> did not respond within 10 seconds.
                This is usually a database cold-start or RLS policy issue.
              </p>
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={() => { setPageTimedOut(false); setQueryTimings([]); void loadJob(); }}
                  className="rounded-lg border border-blue-500/40 bg-blue-500/15 px-4 py-2 text-xs font-semibold text-blue-300 hover:bg-blue-500/25 active:scale-95 transition-all cursor-pointer"
                >
                  Retry
                </button>
                <button
                  onClick={() => { setCoreOnly(true); setPageTimedOut(false); setQueryTimings([]); void loadJob(); }}
                  className="rounded-lg border border-slate-600 bg-slate-800 px-4 py-2 text-xs font-semibold text-slate-300 hover:bg-slate-700 active:scale-95 transition-all cursor-pointer"
                >
                  Load core only
                </button>
                <button
                  onClick={() => setDiagOpen(true)}
                  className="rounded-lg border border-slate-700 bg-slate-900 px-4 py-2 text-xs font-semibold text-slate-400 hover:bg-slate-800 active:scale-95 transition-all cursor-pointer"
                >
                  Open diagnostics
                </button>
              </div>
              {diagOpen && (
                <div className="mt-4 rounded-xl border border-slate-700 bg-slate-900 p-4 text-xs font-mono text-slate-400 space-y-1">
                  <p className="font-semibold text-slate-300 mb-2">Diagnostics</p>
                  <p>role: {profile?.role ?? "unknown"}</p>
                  <p>company_id: {profile?.company_id ?? "none"}</p>
                  <p>job_reference: {jobId}</p>
                  {queryTimings.map((t, i) => (
                    <p key={i} className={t.ok ? "text-emerald-400" : "text-red-400"}>
                      {t.ok ? "✓" : "✗"} {t.name} — {t.ms}ms
                    </p>
                  ))}
                  {queryTimings.length === 0 && <p className="text-slate-500">No queries completed yet</p>}
                </div>
              )}
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
            <Link href="/admin/jobs" className="hover:text-slate-300 transition-colors">All Jobs</Link>
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
            Job <span className="font-mono text-slate-300">{jobId}</span> does not exist.
          </p>
          <Link href="/admin/jobs" className="text-sm text-blue-400 hover:text-blue-300 transition-colors">
            ← Back to All Jobs
          </Link>
        </div>
      </div>
    );
  }

  // ── Success ──────────────────────────────────────────────────────────────────
  const { job } = fetchState;
  const isFullPayment = isFullPaymentJob(job);

  const showConfirmDeposit    = job.payment_status === "Payment Pending"         && depositState            !== "success" && !isFullPayment;
  const showConfirmBalance    = job.payment_status === "Balance Pending"          && balanceState            !== "success" && !isFullPayment;
  const showVerifyDeposit     = (job.payment_status === "Deposit Proof Uploaded" || job.payment_status === "Payment Proof Uploaded") && verifyDepositState !== "success" && !isFullPayment;
  const showVerifyBalance     = job.payment_status === "Balance Proof Uploaded"  && verifyBalanceState      !== "success" && !isFullPayment;
  const showVerifyFullPayment = job.payment_status === "Full Payment Proof Uploaded" && verifyFullPaymentState !== "success";
  const depositAlreadyDone    = job.payment_status === "Deposit Confirmed"       && !isFullPayment;
  const fullPaymentAlreadyDone = isFullPayment && job.payment_status === "Fully Paid" && verifyFullPaymentState === "idle";

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 font-sans flex flex-col">
      {nav}

      <main className="mx-auto w-full max-w-6xl px-6 py-10">

        {/* Breadcrumb + stability controls */}
        <div className="mb-4 flex flex-wrap items-center gap-2 text-xs text-slate-500">
          <Link href="/admin/jobs" className="hover:text-slate-300 transition-colors">All Jobs</Link>
          <span>/</span>
          <span className="font-mono text-slate-400">{job.job_reference}</span>
          <span className="ml-auto flex items-center gap-2">
            <Link
              href={`/admin/jobs/${job.job_reference}/fee-adjustments`}
              className="rounded border border-amber-500/30 bg-amber-500/10 px-2.5 py-0.5 text-[11px] font-medium text-amber-300 hover:bg-amber-500/20 transition-colors"
            >
              Adjust Fee
            </Link>
            {bgLoading && (
              <span className="flex items-center gap-1 text-slate-500">
                <span className="h-2.5 w-2.5 animate-spin rounded-full border border-slate-500 border-t-transparent" />
                loading secondary data…
              </span>
            )}
            <button
              onClick={() => setCoreOnly(v => !v)}
              className={`rounded px-2 py-0.5 text-[11px] font-medium transition-colors cursor-pointer ${coreOnly ? "border border-amber-500/40 bg-amber-500/10 text-amber-300" : "border border-slate-700 bg-slate-800 text-slate-400 hover:text-slate-300"}`}
            >
              {coreOnly ? "Core-only mode ON" : "Core-only mode"}
            </button>
            <button
              onClick={() => setDiagOpen(v => !v)}
              className="rounded border border-slate-700 bg-slate-900 px-2 py-0.5 text-[11px] font-medium text-slate-500 hover:text-slate-300 transition-colors cursor-pointer"
            >
              Diagnostics
            </button>
          </span>
        </div>

        {/* Diagnostics panel */}
        {diagOpen && (
          <div className="mb-4 rounded-xl border border-slate-700 bg-slate-900/80 px-4 py-3 text-xs font-mono text-slate-400">
            <div className="flex items-center justify-between mb-2">
              <span className="font-semibold text-slate-300">Admin Diagnostics</span>
              <button onClick={() => setDiagOpen(false)} className="text-slate-600 hover:text-slate-400 cursor-pointer">✕</button>
            </div>
            <div className="grid grid-cols-2 gap-x-6 gap-y-0.5">
              <span>role</span><span className="text-slate-300">{profile?.role ?? "—"}</span>
              <span>company_id</span><span className="text-slate-300">{profile?.company_id ?? "—"}</span>
              <span>job_reference</span><span className="text-slate-300">{jobId}</span>
              <span>core_only</span><span className="text-slate-300">{String(coreOnly)}</span>
              <span>bg_loading</span><span className="text-slate-300">{String(bgLoading)}</span>
            </div>
            {queryTimings.length > 0 && (
              <div className="mt-2 border-t border-slate-800 pt-2 space-y-0.5">
                <p className="text-slate-500 mb-1">Query timings</p>
                {queryTimings.map((t, i) => (
                  <p key={i} className={t.ok ? "text-emerald-400" : "text-red-400"}>
                    {t.ok ? "✓" : "✗"} {t.name} — {t.ms}ms
                  </p>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Core-only mode banner */}
        {coreOnly && (
          <div className="mb-4 flex items-center gap-3 rounded-xl border border-amber-500/30 bg-amber-500/5 px-4 py-2.5 text-xs text-amber-300">
            <span>Optional panels (AI, intelligence, analytics) are hidden in core-only mode.</span>
            <button onClick={() => setCoreOnly(false)} className="ml-auto shrink-0 underline cursor-pointer">Show all</button>
          </div>
        )}

        {/* ── Confirm Deposit banner ── */}
        {showConfirmDeposit && (
          <div className="mb-6 flex flex-wrap items-start gap-3 rounded-xl border border-blue-500/30 bg-blue-500/5 px-5 py-4">
            <span className="mt-0.5 text-lg">💳</span>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-blue-300">Deposit verification required</p>
              <p className="text-xs text-slate-400 mt-0.5">
                Customer has submitted payment for {job.job_reference}. Verify receipt and confirm to activate the job.
              </p>
            </div>
            <button
              onClick={handleConfirmDeposit}
              disabled={depositState === "loading"}
              className="shrink-0 rounded-lg border border-blue-500/40 bg-blue-500/15 px-4 py-2 text-xs font-semibold text-blue-300 hover:bg-blue-500/25 active:scale-95 transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {depositState === "loading" ? "Confirming…" : "Confirm Deposit"}
            </button>
          </div>
        )}

        {/* ── Deposit error ── */}
        {depositState === "error" && depositError && (
          <div className="mb-6 rounded-xl border border-red-500/30 bg-red-500/5 px-5 py-4">
            <p className="mb-1 text-sm font-semibold text-red-300">Failed to confirm deposit</p>
            <p className="font-mono text-xs text-red-400">{depositError.message}</p>
            {depositError.code    && <p className="mt-0.5 font-mono text-xs text-slate-500">code: {depositError.code}</p>}
            {depositError.details && <p className="font-mono text-xs text-slate-500">details: {depositError.details}</p>}
            {depositError.hint    && <p className="font-mono text-xs text-slate-500">hint: {depositError.hint}</p>}
          </div>
        )}

        {/* ── Deposit success ── */}
        {depositState === "success" && (
          <div className="mb-6 rounded-xl border border-emerald-500/30 bg-emerald-500/5 px-5 py-4">
            <p className="text-sm font-semibold text-emerald-300">✓ Deposit confirmed. Job is ready for execution.</p>
            <p className="text-xs text-slate-400 mt-0.5">Supabase updated — payment status is now Deposit Confirmed.</p>
          </div>
        )}

        {/* ── Deposit already confirmed in DB ── */}
        {depositAlreadyDone && depositState === "idle" && (
          <div className="mb-6 rounded-xl border border-blue-500/20 bg-blue-500/5 px-5 py-4">
            <p className="text-sm font-semibold text-blue-300">Deposit already confirmed for this job</p>
            <p className="text-xs text-slate-400 mt-0.5">No further deposit action required.</p>
          </div>
        )}

        {/* ── Confirm Balance Payment banner ── */}
        {showConfirmBalance && (
          <div className="mb-6 flex flex-wrap items-start gap-3 rounded-xl border border-purple-500/30 bg-purple-500/5 px-5 py-4">
            <span className="mt-0.5 text-lg">💰</span>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-purple-300">Balance payment verification required</p>
              <p className="text-xs text-slate-400 mt-0.5">
                Provider has uploaded POD for {job.job_reference}. Verify balance receipt and confirm to close the job.
              </p>
            </div>
            <button
              onClick={handleConfirmBalance}
              disabled={balanceState === "loading"}
              className="shrink-0 rounded-lg border border-purple-500/40 bg-purple-500/15 px-4 py-2 text-xs font-semibold text-purple-300 hover:bg-purple-500/25 active:scale-95 transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {balanceState === "loading" ? "Confirming…" : "Confirm Balance Payment"}
            </button>
          </div>
        )}

        {/* ── Balance error ── */}
        {balanceState === "error" && balanceError && (
          <div className="mb-6 rounded-xl border border-red-500/30 bg-red-500/5 px-5 py-4">
            <p className="mb-1 text-sm font-semibold text-red-300">Failed to confirm balance payment</p>
            <p className="font-mono text-xs text-red-400">{balanceError.message}</p>
            {balanceError.code    && <p className="mt-0.5 font-mono text-xs text-slate-500">code: {balanceError.code}</p>}
            {balanceError.details && <p className="font-mono text-xs text-slate-500">details: {balanceError.details}</p>}
            {balanceError.hint    && <p className="font-mono text-xs text-slate-500">hint: {balanceError.hint}</p>}
          </div>
        )}

        {/* ── Balance success ── */}
        {balanceState === "success" && (
          <div className="mb-6 rounded-xl border border-emerald-500/30 bg-emerald-500/5 px-5 py-4">
            <p className="text-sm font-semibold text-emerald-300">✓ Balance confirmed. Job fully paid and closed.</p>
            <p className="text-xs text-slate-400 mt-0.5">Supabase updated — payment status is now Fully Paid.</p>
          </div>
        )}

        {/* ── Verify Deposit Proof banner ── */}
        {showVerifyDeposit && (
          <div className="mb-6 flex flex-wrap items-start gap-3 rounded-xl border border-amber-500/30 bg-amber-500/5 px-5 py-4">
            <span className="mt-0.5 text-lg">🔍</span>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-amber-300">Deposit Proof Pending Verification</p>
              <p className="text-xs text-slate-400 mt-0.5">
                Customer has submitted deposit proof. Nexum Admin should verify receipt before enabling provider execution.
              </p>
            </div>
            <button
              onClick={handleVerifyDepositProof}
              disabled={verifyDepositState === "loading"}
              className="shrink-0 rounded-lg border border-amber-500/40 bg-amber-500/15 px-4 py-2 text-xs font-semibold text-amber-300 hover:bg-amber-500/25 active:scale-95 transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {verifyDepositState === "loading" ? "Verifying…" : "Verify Deposit Proof"}
            </button>
          </div>
        )}

        {/* ── Verify deposit error ── */}
        {verifyDepositState === "error" && verifyDepositError && (
          <div className="mb-6 rounded-xl border border-red-500/30 bg-red-500/5 px-5 py-4">
            <p className="mb-1 text-sm font-semibold text-red-300">Failed to verify deposit proof</p>
            <p className="font-mono text-xs text-red-400">{verifyDepositError.message}</p>
            {verifyDepositError.code    && <p className="mt-0.5 font-mono text-xs text-slate-500">code: {verifyDepositError.code}</p>}
            {verifyDepositError.details && <p className="font-mono text-xs text-slate-500">details: {verifyDepositError.details}</p>}
            {verifyDepositError.hint    && <p className="font-mono text-xs text-slate-500">hint: {verifyDepositError.hint}</p>}
          </div>
        )}

        {/* ── Verify deposit success ── */}
        {verifyDepositState === "success" && (
          <div className="mb-6 rounded-xl border border-emerald-500/30 bg-emerald-500/5 px-5 py-4">
            <p className="text-sm font-semibold text-emerald-300">✓ Deposit proof verified. Job is ready for execution.</p>
            <p className="text-xs text-slate-400 mt-0.5">Supabase updated — payment status is now Deposit Confirmed.</p>
          </div>
        )}

        {/* ── Verify Full Payment banner ── */}
        {showVerifyFullPayment && (
          <div className="mb-6 flex flex-wrap items-start gap-3 rounded-xl border border-emerald-500/30 bg-emerald-500/5 px-5 py-4">
            <span className="mt-0.5 text-lg">💵</span>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-emerald-300">Full Payment Proof Pending Verification</p>
              <p className="text-xs text-slate-400 mt-0.5">
                Customer has submitted full payment proof for {job.job_reference}. Verify receipt to activate the job for execution.
              </p>
            </div>
            <button
              onClick={handleVerifyFullPayment}
              disabled={verifyFullPaymentState === "loading"}
              className="shrink-0 rounded-lg border border-emerald-500/40 bg-emerald-500/15 px-4 py-2 text-xs font-semibold text-emerald-300 hover:bg-emerald-500/25 active:scale-95 transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {verifyFullPaymentState === "loading" ? "Verifying…" : "Verify Full Payment"}
            </button>
          </div>
        )}

        {/* ── Verify full payment error ── */}
        {verifyFullPaymentState === "error" && verifyFullPaymentError && (
          <div className="mb-6 rounded-xl border border-red-500/30 bg-red-500/5 px-5 py-4">
            <p className="mb-1 text-sm font-semibold text-red-300">Failed to verify full payment</p>
            <p className="font-mono text-xs text-red-400">{verifyFullPaymentError.message}</p>
            {verifyFullPaymentError.code    && <p className="mt-0.5 font-mono text-xs text-slate-500">code: {verifyFullPaymentError.code}</p>}
            {verifyFullPaymentError.details && <p className="font-mono text-xs text-slate-500">details: {verifyFullPaymentError.details}</p>}
            {verifyFullPaymentError.hint    && <p className="font-mono text-xs text-slate-500">hint: {verifyFullPaymentError.hint}</p>}
          </div>
        )}

        {/* ── Verify full payment success ── */}
        {verifyFullPaymentState === "success" && (
          <div className="mb-6 rounded-xl border border-emerald-500/30 bg-emerald-500/5 px-5 py-4">
            <p className="text-sm font-semibold text-emerald-300">✓ Full payment verified. Job is ready for execution.</p>
            <p className="text-xs text-slate-400 mt-0.5">Supabase updated — payment status is now Fully Paid.</p>
          </div>
        )}

        {/* ── Full payment already confirmed ── */}
        {fullPaymentAlreadyDone && (
          <div className="mb-6 rounded-xl border border-emerald-500/20 bg-emerald-500/5 px-5 py-4">
            <p className="text-sm font-semibold text-emerald-300">Full payment confirmed for this job</p>
            <p className="text-xs text-slate-400 mt-0.5">Full payment confirmed. No balance payment required.</p>
          </div>
        )}

        {/* ── Verify Balance Proof banner ── */}
        {showVerifyBalance && (
          <div className="mb-6 flex flex-wrap items-start gap-3 rounded-xl border border-purple-500/30 bg-purple-500/5 px-5 py-4">
            <span className="mt-0.5 text-lg">🔍</span>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-purple-300">Balance proof submitted — verification required</p>
              <p className="text-xs text-slate-400 mt-0.5">
                Customer has uploaded balance payment proof for {job.job_reference}. Review and verify to close the job.
              </p>
            </div>
            <button
              onClick={handleVerifyBalanceProof}
              disabled={verifyBalanceState === "loading"}
              className="shrink-0 rounded-lg border border-purple-500/40 bg-purple-500/15 px-4 py-2 text-xs font-semibold text-purple-300 hover:bg-purple-500/25 active:scale-95 transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {verifyBalanceState === "loading" ? "Verifying…" : "Verify Balance Proof"}
            </button>
          </div>
        )}

        {/* ── Verify balance error ── */}
        {verifyBalanceState === "error" && verifyBalanceError && (
          <div className="mb-6 rounded-xl border border-red-500/30 bg-red-500/5 px-5 py-4">
            <p className="mb-1 text-sm font-semibold text-red-300">Failed to verify balance proof</p>
            <p className="font-mono text-xs text-red-400">{verifyBalanceError.message}</p>
            {verifyBalanceError.code    && <p className="mt-0.5 font-mono text-xs text-slate-500">code: {verifyBalanceError.code}</p>}
            {verifyBalanceError.details && <p className="font-mono text-xs text-slate-500">details: {verifyBalanceError.details}</p>}
            {verifyBalanceError.hint    && <p className="font-mono text-xs text-slate-500">hint: {verifyBalanceError.hint}</p>}
          </div>
        )}

        {/* ── Verify balance success ── */}
        {verifyBalanceState === "success" && (
          <div className="mb-6 rounded-xl border border-emerald-500/30 bg-emerald-500/5 px-5 py-4">
            <p className="text-sm font-semibold text-emerald-300">✓ Balance proof verified. Job fully paid and closed.</p>
            <p className="text-xs text-slate-400 mt-0.5">Supabase updated — payment status is now Fully Paid.</p>
          </div>
        )}

        {/* ── Recalculate Payment Scope (admin) ── */}
        <div className="mb-6 flex flex-wrap items-start gap-3 rounded-xl border border-slate-700/60 bg-slate-900/40 px-5 py-4">
          <span className="mt-0.5 text-lg">🔢</span>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-slate-200">Recalculate Payment Scope</p>
            <p className="text-xs text-slate-500 mt-0.5">
              Recomputes total_secured_amount, payment_obligations, and held_payments
              based on the selected secured components (logistics fee, cargo payment, etc.).
              Use after updating scope selection or correcting an obligation amount.
            </p>
            {recalcState === "success" && recalcResult && (
              <p className="mt-1 text-xs font-medium text-emerald-400">✓ {recalcResult}</p>
            )}
            {recalcState === "error" && recalcError && (
              <div className="mt-1">
                <p className="text-xs text-red-400">{recalcError.message}</p>
                {recalcError.code && <p className="font-mono text-[10px] text-slate-500">code: {recalcError.code}</p>}
              </div>
            )}
          </div>
          <button
            onClick={handleRecalculateScope}
            disabled={recalcState === "loading"}
            className="shrink-0 rounded-lg border border-slate-600 bg-slate-800 px-4 py-2 text-xs font-semibold text-slate-300 hover:bg-slate-700 hover:border-slate-500 active:scale-95 transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {recalcState === "loading" ? "Recalculating…" : "Recalculate Payment Scope"}
          </button>
        </div>

        {/* ── Invite link + email — shown while awaiting customer acceptance ── */}
        {job.job_status === "Awaiting Customer Acceptance" && (
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
              actorRole="admin"
              actorName={profile?.full_name ?? "Nexum Admin"}
            />
          </div>
        )}

        {/* ── Job hero ── */}
        <div className="mb-8">
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <span className="font-mono text-sm font-bold text-blue-400">{job.job_reference}</span>
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

            {/* Commercial Value Breakdown */}
            <CommercialValueCard
              cv={{
                incoterm:                    job.incoterm,
                cargo_value_amount:          job.cargo_value_amount,
                cargo_value_currency:        job.cargo_value_currency ?? "USD",
                cargo_value_fx_rate_to_base: job.cargo_value_fx_rate_to_base,
                cargo_value_base_amount:     job.cargo_value_base_amount,
                logistics_fee_amount:        job.logistics_fee_amount,
                logistics_fee_currency:      job.logistics_fee_currency ?? "RM",
                duty_tax_estimate_amount:    job.duty_tax_estimate_amount,
                duty_tax_currency:           job.duty_tax_currency ?? "RM",
                insurance_cost_amount:       job.insurance_cost_amount,
                insurance_cost_currency:     job.insurance_cost_currency ?? "RM",
                additional_charges_amount:   job.additional_charges_amount,
                additional_charges_currency: job.additional_charges_currency ?? "RM",
                total_secured_amount:           job.total_secured_amount,
                total_secured_currency:         job.total_secured_currency ?? job.currency,
                base_currency:                  job.base_currency ?? job.currency,
                job_value:                      job.job_value,
                currency:                       job.currency,
                // Secured scope selection (controls which components count)
                secure_logistics_fee:           job.secure_logistics_fee          ?? true,
                secure_cargo_supplier_payment:  job.secure_cargo_supplier_payment ?? false,
                secure_duty_tax:                job.secure_duty_tax               ?? false,
                secure_insurance:               job.secure_insurance              ?? false,
                secure_additional_charges:      job.secure_additional_charges     ?? false,
              }}
              showEmpty
            />

            {/* HS Code / Customs Classification */}
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
              showEmpty
            />

            {/* Supplier / Counterparty Profile */}
            {supplierLinks.length > 0 ? (
              supplierLinks.map((link) => (
                <SupplierProfileCard
                  key={link.id}
                  supplier={link.supplier_counterparties!}
                  link={link}
                  showContact
                  showEmpty
                />
              ))
            ) : (
              <SupplierProfileEmptyCard />
            )}

            {/* Supplier Payment Protection */}
            <SupplierPaymentProtectionCard jobReference={jobId} role="admin" />

            {/* Milestone Evidence Verification */}
            <SupplierMilestoneEvidenceCard jobReference={jobId} role="admin" />

            {/* Supplier Trust Score */}
            <SupplierTrustScoreCard jobReference={jobId} role="admin" />

            {/* Supplier Exposure Limit */}
            <SupplierExposureLimitCard jobReference={jobId} role="admin" />

            {/* Buyer–Supplier Relationship History */}
            <BuyerSupplierRelationshipCard jobReference={jobId} role="admin" />

            {/* Procurement Order Control */}
            <ProcurementOrderCard jobReference={jobId} role="admin" />

            {/* Procurement Discrepancy Detection */}
            <ProcurementDiscrepancyCard jobReference={jobId} role="admin" />

            {/* Exception-to-Action Playbook */}
            <ActionRecommendationCard jobReference={jobId} role="admin" />

            {/* Internal Control Gate */}
            <InternalControlCard jobReference={jobId} role="admin" />

            {/* Operational Risk Register */}
            <RiskRegisterCard jobReference={jobId} role="admin" />

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

            <Section title="Platform Notes">
              <ul className="flex flex-col gap-2 text-xs text-slate-500">
                <li className="flex items-start gap-2">
                  <span className="mt-0.5 shrink-0 text-blue-500">●</span>
                  Verify payment proofs before enabling provider execution.
                </li>
                <li className="flex items-start gap-2">
                  <span className="mt-0.5 shrink-0 text-blue-500">●</span>
                  Documents submitted by all parties are visible in the Documents section below.
                </li>
                <li className="flex items-start gap-2">
                  <span className="mt-0.5 shrink-0 text-blue-500">●</span>
                  All actions are logged in the Audit Log for full traceability.
                </li>
              </ul>
            </Section>
          </div>
        </div>

        {/* ── Company Intelligence ── */}
        {!coreOnly && (
          <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <CompanyIntelligenceCard
              companyId={job.service_provider_company_id}
              companyName={job.service_provider}
              label="Provider Intelligence"
            />
            <CompanyIntelligenceCard
              companyId={job.customer_company_id}
              companyName={job.customer}
              label="Customer Intelligence"
            />
          </div>
        )}

        {/* ── Trade Intelligence ── */}
        {!coreOnly && (
          <div className="mb-6">
            <TradeIntelligencePanel
              jobReference={job.job_reference}
              actorName={profile?.full_name ?? "Nexum Admin"}
            />
          </div>
        )}

        {/* ── Payment Holding & Controlled Release ── */}
        <div className="mb-6">
          <PaymentHoldingCard
            jobReference={job.job_reference}
            role="admin"
            actorId={profile?.id}
            actorRole="admin"
            actorName={profile?.full_name ?? "Nexum Admin"}
            currency={job.currency}
            onUpdate={loadJob}
          />
        </div>

        {/* ── Holding Account Reconciliation ── */}
        <div className="mb-6">
          <ReconciliationCard
            jobReference={job.job_reference}
            actorId={profile?.id}
            actorRole="admin"
            actorName={profile?.full_name ?? "Nexum Admin"}
            onUpdate={loadJob}
          />
        </div>

        {/* ── Release Governance & Dual Approval ── */}
        <div className="mb-6">
          <ReleaseGovernanceCard
            jobReference={job.job_reference}
            actorId={profile?.id}
            actorRole="admin"
            actorName={profile?.full_name ?? "Nexum Admin"}
            onUpdate={loadJob}
          />
        </div>

        {/* ── Payment Compliance ── */}
        <div className="mb-6">
          <PaymentComplianceCard
            jobReference={job.job_reference}
            actorId={profile?.id}
            actorRole="admin"
            actorName={profile?.full_name ?? "Nexum Admin"}
            onUpdate={loadJob}
          />
        </div>

        {/* ── Release / Settlement Reconciliation ── */}
        <div className="mb-6">
          <ReleaseSettlementCard
            jobReference={job.job_reference}
            role="admin"
            actorId={profile?.id}
            actorRole="admin"
            actorName={profile?.full_name ?? "Nexum Admin"}
            currency={job.currency}
            onUpdate={loadJob}
          />
        </div>

        {/* ── Provider Payout Profile ── */}
        {job.service_provider_company_id && (
          <div className="mb-6">
            <PayoutProfileCard
              companyId={job.service_provider_company_id}
              role="admin"
              actorId={profile?.id}
              actorRole="admin"
              actorName={profile?.full_name ?? "Nexum Admin"}
              compact={true}
            />
          </div>
        )}

        {/* ── Payment Ledger ── */}
        <div className="mb-6">
          <PaymentLedgerCard
            jobReference={job.job_reference}
            role="admin"
            actorId={profile?.id}
            actorRole="admin"
            actorName={profile?.full_name ?? "Admin"}
            currency={job.currency}
            onUpdate={loadJob}
          />
        </div>

        {/* ── Delivery Confirmation ── */}
        <div className="mb-6">
          <DeliveryConfirmationCard
            jobReference={job.job_reference}
            userRole="admin"
            actorId={profile?.id}
            actorName={profile?.full_name ?? "Nexum Admin"}
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
            userRole="admin"
            actorId={profile?.id}
            actorName={profile?.full_name ?? "Nexum Admin"}
            currency={job.currency}
            customerCompanyId={job.customer_company_id}
            providerCompanyId={job.service_provider_company_id}
            onUpdate={loadJob}
          />
        </div>

        {/* ── Liability Review ── */}
        <div className="mb-6">
          <LiabilityReviewCard
            jobReference={job.job_reference}
            role="admin"
            customerCompanyId={job.customer_company_id ?? undefined}
            providerCompanyId={job.service_provider_company_id ?? undefined}
          />
        </div>

        {/* ── Claim Reserves ── */}
        <div className="mb-6">
          <ClaimReserveCard
            jobReference={job.job_reference}
            role="admin"
            currency={job.currency}
          />
        </div>

        {/* ── Net Settlement Statement ── */}
        <div className="mb-6">
          <NetSettlementCard
            jobReference={job.job_reference}
            role="admin"
            currency={job.currency}
          />
        </div>

        {/* ── Accounting / E-Invoice Export ── */}
        <div className="mb-6">
          <AccountingExportCard
            jobReference={job.job_reference}
            currency={job.currency}
            actorName={profile?.full_name ?? "Admin"}
          />
        </div>

        {/* ── Capital Readiness ── */}
        <div className="mb-6">
          <CapitalReadinessCard
            jobReference={job.job_reference}
            companyId={job.customer_company_id ?? job.service_provider_company_id ?? undefined}
            actorId={profile?.id}
            actorName={profile?.full_name ?? "Admin"}
            currency={job.currency}
          />
        </div>

        {/* ── Financing Offer ── */}
        {!coreOnly && (
          <div className="mb-6">
            <FinancingOfferCard
              jobReference={job.job_reference}
              companyId={job.customer_company_id ?? job.service_provider_company_id ?? undefined}
              actorName={profile?.full_name ?? "Admin"}
            />
          </div>
        )}

        {/* ── Nexum Brain ── */}
        {!coreOnly && (
          <div className="mb-6">
            <NexumBrainPanel
              job={job}
              userRole="admin"
              actorId={profile?.id}
              actorName={profile?.full_name ?? "Nexum Admin"}
            />
          </div>
        )}

        {/* ── Document Checklist ── */}
        <div className="mb-6">
          <JobDocumentPanel
            jobReference={job.job_reference}
            userRole="admin"
            companyId={profile?.company_id ?? undefined}
            actorId={profile?.id}
            actorName={profile?.full_name ?? "Nexum Admin"}
          />
        </div>

        {/* ── Documents (legacy list) ── */}
        <div className="mb-6">
          <DocumentList jobReference={job.job_reference} />
        </div>

        {/* ── Document Intelligence ── */}
        {!coreOnly && (
          <div className="mb-6">
            <DocumentIntelligencePanel
              jobReference={job.job_reference}
              userRole="admin"
              actorId={profile?.id}
              actorName={profile?.full_name ?? "Nexum Admin"}
            />
          </div>
        )}

        {/* ── Data Confidence ── */}
        {!coreOnly && (
          <div className="mb-6">
            <DataConfidenceCard jobReference={job.job_reference} />
          </div>
        )}

        {/* ── Ontology Update Suggestions ── */}
        {!coreOnly && (
          <div className="mb-6">
            <OntologySuggestionsPanel
              jobReference={job.job_reference}
              actorId={profile?.id}
              actorName={profile?.full_name ?? "Nexum Admin"}
            />
          </div>
        )}

        {/* ── Workflow Tasks ── */}
        {!coreOnly && (
          <div className="mb-6">
            <WorkflowTaskPanel
              jobReference={job.job_reference}
              assignedRole="admin"
              compact={true}
              showGenerateButton={true}
              maxItems={15}
            />
          </div>
        )}

        {/* ── Exceptions ── */}
        {!coreOnly && (
          <div className="mb-6">
            <ExceptionPanel
              jobReference={job.job_reference}
              userRole="admin"
              job={{
                payment_status:    job.payment_status,
                current_milestone: job.current_milestone,
                job_status:        job.job_status,
                created_at:        job.created_at,
              }}
              actorId={profile?.id}
              actorName={profile?.full_name ?? "Nexum Admin"}
            />
          </div>
        )}

        {/* ── Shipment Tracking ── */}
        {!coreOnly && (
          <div className="mb-6">
            <ShipmentTrackingPanel
              jobReference={job.job_reference}
              userRole="admin"
              actorId={profile?.id}
              actorName={profile?.full_name ?? "Nexum Admin"}
            />
          </div>
        )}

        {/* ── Delay Impact ── */}
        {!coreOnly && (
          <div className="mb-6">
            <DelayImpactCard
              jobReference={job.job_reference}
              userRole="admin"
              actorId={profile?.id}
              actorName={profile?.full_name ?? "Nexum Admin"}
            />
          </div>
        )}

        {/* ── Business Context ── */}
        {!coreOnly && (
          <div className="mb-6">
            <BusinessContextPanel
              jobReference={job.job_reference}
              userRole="admin"
              actorId={profile?.id}
              actorName={profile?.full_name ?? "Nexum Admin"}
              currency={job.currency}
            />
          </div>
        )}

        {/* ── Unified Trade Ontology ── */}
        {!coreOnly && (
          <div className="mb-6">
            <TradeOntologyGraph jobReference={job.job_reference} />
          </div>
        )}

        {/* ── Communication Log ── */}
        <div className="mb-8">
          <CommunicationLogCard
            jobReference={job.job_reference}
            maxItems={8}
            defaultSubject={`Job ${job.job_reference} — Update`}
            defaultMessage={`This is a notification regarding Job ${job.job_reference}.\n\nRoute: ${job.route}\nService: ${job.service_type}\nStatus: ${job.job_status}`}
          />
        </div>

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
        {fetchState.status === "success" && (
          <div className="mt-6">
            <JobTermsSnapshotCard
              jobReference={fetchState.job.job_reference}
              role="admin"
              actorId={profile?.id}
              actorName={profile?.full_name ?? "Nexum Admin"}
            />
          </div>
        )}

        {/* ── Change Requests ── */}
        {fetchState.status === "success" && (
          <div className="mt-6">
            <ChangeRequestCard
              jobReference={fetchState.job.job_reference}
              role="admin"
              actorId={profile?.id}
              actorName={profile?.full_name ?? "Nexum Admin"}
              jobCurrency={fetchState.job.currency}
            />
          </div>
        )}

        {/* ── Evidence Pack ── */}
        {fetchState.status === "success" && (
          <div className="mt-6">
            <EvidencePackCard
              jobReference={fetchState.job.job_reference}
              role="admin"
              actorId={profile?.id}
              actorName={profile?.full_name ?? "Nexum Admin"}
            />
          </div>
        )}

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
