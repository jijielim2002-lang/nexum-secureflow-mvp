"use client";
import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { useAuth } from "@/contexts/AuthContext";
import {
  CAPITAL_PARTNER_DISCLAIMER,
  PARTNER_INTEREST_BADGE,
  RISK_LEVEL_BADGE,
  TREND_BADGE,
  isOfferExpired,
} from "@/lib/capitalPartner";

// ─── Types ────────────────────────────────────────────────────────────────────

interface OfferRow {
  id:                       string;
  job_reference:            string | null;
  company_id:               string | null;
  company_name:             string | null;
  product_type:             string;
  offer_status:             string;
  offer_amount:             number;
  currency:                 string;
  tenure_days:              number | null;
  estimated_fee:            number | null;
  repayment_source:         string | null;
  conditions:               string | null;
  risk_notes:               string | null;
  expires_at:               string | null;
  generated_at:             string;
  partner_interest_status:  string | null;
  partner_interest_note:    string | null;
  partner_viewed_at:        string | null;
}

interface AccessRow {
  id:                         string;
  access_status:              string;
  access_expires_at:          string | null;
  capital_partner_company_id: string | null;
}

interface IntelRow {
  overall_trust_score:           number | null;
  payment_behavior_score:        number | null;
  operational_reliability_score: number | null;
  risk_level:                    string | null;
  trend:                         string | null;
  financing_readiness:           string | null;
  critical_exceptions:           number | null;
  completed_jobs:                number | null;
}

interface JobRow {
  job_reference:  string;
  service_type:   string;
  job_status:     string;
  payment_status: string;
  job_value:      number;
  currency:       string;
  customer:       string;
  service_provider: string;
  current_milestone: string;
  created_at:     string;
}

interface DocRow {
  document_type:    string;
  uploaded_by_role: string;
  file_name:        string;
  created_at:       string;
}

interface ShipmentRow {
  tracking_status: string;
  transport_mode:  string;
  eta:             string | null;
  delay_days:      number;
  vessel_name:     string | null;
  latest_event:    string | null;
  latest_location: string | null;
  updated_at:      string;
}

interface ExceptionRow {
  id:             string;
  exception_type: string;
  severity:       string;
  status:         string;
  due_date:       string | null;
  description:    string | null;
}

interface PaymentObRow {
  id:              string;
  obligation_type: string;
  amount:          number;
  currency:        string;
  due_date:        string | null;
  status:          string;
}

interface AuditRow {
  actor_role:  string;
  actor_name:  string;
  action:      string;
  description: string;
  created_at:  string;
}

interface CapReadinessRow {
  readiness_status:       string;
  readiness_score:        number;
  assessment_type:        string;
  key_strengths:          string | null;
  key_risks:              string | null;
  required_conditions:    string | null;
  max_recommended_amount: number | null;
  assessed_at:            string;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function SectionCard({ title, icon, children }: { title: string; icon: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-5 mb-5">
      <h2 className="mb-4 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-slate-400">
        <span>{icon}</span> {title}
      </h2>
      {children}
    </div>
  );
}

function ScoreBar({ value, max = 100 }: { value: number; max?: number }) {
  const pct = Math.min(100, (value / max) * 100);
  const color = value >= 80 ? "bg-emerald-500" : value >= 60 ? "bg-amber-500" : "bg-red-500";
  return (
    <div className="flex items-center gap-2 w-full">
      <div className="flex-1 h-2 rounded-full bg-slate-800 overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs tabular-nums text-slate-300 w-8 text-right">{value}</span>
    </div>
  );
}

function Badge({ label, cls }: { label: string; cls: string }) {
  return <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${cls}`}>{label}</span>;
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function OpportunityDetailPage() {
  const { offer_id } = useParams<{ offer_id: string }>();
  const { profile }  = useAuth();

  const [offer,      setOffer]      = useState<OfferRow | null>(null);
  const [access,     setAccess]     = useState<AccessRow | null>(null);
  const [intel,      setIntel]      = useState<IntelRow | null>(null);
  const [job,        setJob]        = useState<JobRow | null>(null);
  const [documents,  setDocuments]  = useState<DocRow[]>([]);
  const [shipment,   setShipment]   = useState<ShipmentRow | null>(null);
  const [exceptions, setExceptions] = useState<ExceptionRow[]>([]);
  const [payObs,     setPayObs]     = useState<PaymentObRow[]>([]);
  const [auditLogs,  setAuditLogs]  = useState<AuditRow[]>([]);
  const [capRead,    setCapRead]    = useState<CapReadinessRow | null>(null);

  const [loading,      setLoading]      = useState(true);
  const [error,        setError]        = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);
  const [actionError,   setActionError]   = useState<string | null>(null);
  const [noteText,      setNoteText]      = useState("");
  const [showNote,      setShowNote]      = useState(false);

  const load = useCallback(async () => {
    if (!offer_id) return;
    setLoading(true); setError(null);

    // Fetch offer
    const { data: offerData, error: offerErr } = await supabase
      .from("simulated_financing_offers")
      .select("id, job_reference, company_id, company_name, product_type, offer_status, offer_amount, currency, tenure_days, estimated_fee, repayment_source, conditions, risk_notes, expires_at, generated_at, partner_interest_status, partner_interest_note, partner_viewed_at")
      .eq("id", offer_id)
      .maybeSingle();

    if (offerErr || !offerData) {
      setError("Opportunity not found or access denied.");
      setLoading(false);
      return;
    }
    setOffer(offerData as OfferRow);

    const o = offerData as OfferRow;

    // Parallel fetch all supporting data
    const [accessR, intelR, jobR, docR, shipR, excR, payR, auditR, capR] = await Promise.all([
      // Access record (capital partner can only see if they have access)
      supabase
        .from("capital_partner_access")
        .select("id, access_status, access_expires_at, capital_partner_company_id")
        .eq("financing_offer_id", offer_id)
        .in("access_status", ["Active", "Invited"])
        .maybeSingle(),

      // Company intelligence
      o.company_id
        ? supabase.from("company_intelligence_profiles")
            .select("overall_trust_score, payment_behavior_score, operational_reliability_score, risk_level, trend, financing_readiness, critical_exceptions, completed_jobs")
            .eq("company_id", o.company_id)
            .maybeSingle()
        : Promise.resolve({ data: null }),

      // Job
      o.job_reference
        ? supabase.from("secured_jobs")
            .select("job_reference, service_type, job_status, payment_status, job_value, currency, customer, service_provider, current_milestone, created_at")
            .eq("job_reference", o.job_reference)
            .maybeSingle()
        : Promise.resolve({ data: null }),

      // Documents
      o.job_reference
        ? supabase.from("documents")
            .select("document_type, uploaded_by_role, file_name, created_at")
            .eq("job_reference", o.job_reference)
            .order("created_at", { ascending: false })
        : Promise.resolve({ data: [] }),

      // Shipment
      o.job_reference
        ? supabase.from("shipment_trackings")
            .select("tracking_status, transport_mode, eta, delay_days, vessel_name, latest_event, latest_location, updated_at")
            .eq("job_reference", o.job_reference)
            .maybeSingle()
        : Promise.resolve({ data: null }),

      // Exceptions
      o.job_reference
        ? supabase.from("job_exceptions")
            .select("id, exception_type, severity, status, due_date, description")
            .eq("job_reference", o.job_reference)
            .not("status", "in", '("Resolved","Closed")')
            .order("created_at", { ascending: false })
        : Promise.resolve({ data: [] }),

      // Payment obligations
      o.job_reference
        ? supabase.from("payment_obligations")
            .select("id, obligation_type, amount, currency, due_date, status")
            .eq("job_reference", o.job_reference)
            .order("due_date", { ascending: true })
        : Promise.resolve({ data: [] }),

      // Audit log (limited — no internal ops details)
      o.job_reference
        ? supabase.from("audit_logs")
            .select("actor_role, actor_name, action, description, created_at")
            .eq("job_reference", o.job_reference)
            .not("action", "in", '("capital_opportunity_shared","capital_partner_viewed_opportunity","capital_partner_marked_interested","capital_partner_requested_more_info","capital_partner_declined","capital_partner_access_revoked")')
            .order("created_at", { ascending: false })
            .limit(15)
        : Promise.resolve({ data: [] }),

      // Capital readiness
      o.job_reference
        ? supabase.from("capital_readiness_assessments")
            .select("readiness_status, readiness_score, assessment_type, key_strengths, key_risks, required_conditions, max_recommended_amount, assessed_at")
            .eq("job_reference", o.job_reference)
            .order("assessed_at", { ascending: false })
            .limit(1)
            .maybeSingle()
        : o.company_id
          ? supabase.from("capital_readiness_assessments")
              .select("readiness_status, readiness_score, assessment_type, key_strengths, key_risks, required_conditions, max_recommended_amount, assessed_at")
              .eq("company_id", o.company_id)
              .order("assessed_at", { ascending: false })
              .limit(1)
              .maybeSingle()
          : Promise.resolve({ data: null }),
    ]);

    setAccess(accessR.data as AccessRow ?? null);
    setIntel(intelR.data as IntelRow ?? null);
    setJob(jobR.data as JobRow ?? null);
    setDocuments((docR.data ?? []) as DocRow[]);
    setShipment(shipR.data as ShipmentRow ?? null);
    setExceptions((excR.data ?? []) as ExceptionRow[]);
    setPayObs((payR.data ?? []) as PaymentObRow[]);
    setAuditLogs((auditR.data ?? []) as AuditRow[]);
    setCapRead(capR.data as CapReadinessRow ?? null);

    // Mark as viewed (fire-and-forget) — update partner_viewed_at if not set
    if (offerData && !(offerData as OfferRow).partner_viewed_at) {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (token) {
        fetch("/api/capital-partner-access/viewed", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({ offerId: offer_id }),
        }).catch(() => undefined);
      }
    }

    setLoading(false);
  }, [offer_id]);

  useEffect(() => { load(); }, [load]);

  async function handleDecision(action: "mark_interested" | "need_more_info" | "declined") {
    if (!access?.id) return;
    setActionLoading(action); setActionError(null); setActionSuccess(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      const res = await fetch(`/api/capital-partner-access/${access.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          action,
          actorName:           profile?.full_name ?? "Partner",
          partnerInterestNote: noteText || undefined,
        }),
      });
      const json = await res.json() as { error?: string; interest?: string };
      if (!res.ok) throw new Error(json.error ?? "Action failed");

      const label =
        action === "mark_interested" ? "Interest registered" :
        action === "need_more_info"  ? "More info requested" :
        "Declined";
      setActionSuccess(label);
      setShowNote(false);
      setNoteText("");
      await load();
    } catch (e: unknown) {
      setActionError(e instanceof Error ? e.message : "Action failed");
    } finally {
      setActionLoading(null);
    }
  }

  // ── Computed state ────────────────────────────────────────────────────────────
  const today         = new Date().toISOString().split("T")[0];
  const offerExpired  = offer ? isOfferExpired({ offer_status: offer.offer_status, expires_at: offer.expires_at }) : false;
  const canDecide     = !!access && !offerExpired && offer?.partner_interest_status !== "Declined";
  const overdueObs    = payObs.filter((o) => o.status === "Overdue" || (o.status === "Pending" && o.due_date && o.due_date < today));
  const openExc       = exceptions.filter((e) => e.status !== "Resolved" && e.status !== "Closed");
  const critExc       = openExc.filter((e) => e.severity === "Critical");
  const verifiedDocs  = documents.filter((d) => d.uploaded_by_role);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-40">
        <span className="animate-pulse text-slate-600 text-2xl">◌</span>
      </div>
    );
  }

  if (error || !offer) {
    return (
      <div className="rounded-xl border border-red-500/20 bg-red-950/10 px-6 py-10 text-center">
        <p className="text-sm text-red-400">{error ?? "Opportunity not found"}</p>
        <Link href="/capital/opportunities" className="mt-3 block text-xs text-blue-400 hover:underline">
          ← Back to Opportunities
        </Link>
      </div>
    );
  }

  return (
    <div>
      {/* Back nav */}
      <div className="mb-6">
        <Link href="/capital/opportunities" className="text-xs text-slate-400 hover:text-slate-200 transition-colors">
          ← Back to Opportunities
        </Link>
      </div>

      {/* Page header */}
      <div className="mb-6 flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-xl font-bold text-slate-50">
            {offer.company_name ?? "Company"} — {offer.product_type}
          </h1>
          {offer.job_reference && (
            <p className="mt-0.5 text-xs text-slate-500 font-mono">Job: {offer.job_reference}</p>
          )}
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {offer.partner_interest_status && (
            <Badge
              label={offer.partner_interest_status}
              cls={PARTNER_INTEREST_BADGE[offer.partner_interest_status as keyof typeof PARTNER_INTEREST_BADGE] ?? "border-slate-700 text-slate-400"}
            />
          )}
          {offerExpired && (
            <Badge label="Offer Expired" cls="border-amber-500/30 bg-amber-500/10 text-amber-400" />
          )}
        </div>
      </div>

      {/* Action feedback */}
      {actionSuccess && (
        <div className="mb-5 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-4 py-3">
          <p className="text-sm text-emerald-400">✓ {actionSuccess}</p>
        </div>
      )}
      {actionError && (
        <div className="mb-5 rounded-lg border border-red-500/20 bg-red-950/10 px-4 py-3">
          <p className="text-sm text-red-400">{actionError}</p>
        </div>
      )}

      <div className="grid grid-cols-1 gap-0 lg:grid-cols-3 lg:gap-6">
        {/* ── Main column ─────────────────────────────────────────────────── */}
        <div className="lg:col-span-2">

          {/* 1. Financing Offer Summary */}
          <SectionCard title="Financing Offer Summary" icon="💰">
            <div className="grid grid-cols-2 gap-x-8 gap-y-3 text-sm">
              <div>
                <p className="text-[10px] text-slate-500 uppercase tracking-wider mb-1">Product Type</p>
                <p className="text-slate-200 font-semibold">{offer.product_type}</p>
              </div>
              <div>
                <p className="text-[10px] text-slate-500 uppercase tracking-wider mb-1">Simulated Offer Amount</p>
                <p className="text-2xl font-bold text-blue-300 tabular-nums">
                  {offer.currency} {Number(offer.offer_amount).toLocaleString("en-MY")}
                </p>
              </div>
              <div>
                <p className="text-[10px] text-slate-500 uppercase tracking-wider mb-1">Tenure</p>
                <p className="text-slate-300">{offer.tenure_days != null ? `${offer.tenure_days} days` : "—"}</p>
              </div>
              <div>
                <p className="text-[10px] text-slate-500 uppercase tracking-wider mb-1">Estimated Fee</p>
                <p className="text-slate-300 tabular-nums">
                  {offer.estimated_fee != null ? `${offer.currency} ${Number(offer.estimated_fee).toLocaleString("en-MY")}` : "—"}
                </p>
              </div>
              <div>
                <p className="text-[10px] text-slate-500 uppercase tracking-wider mb-1">Repayment Source</p>
                <p className="text-slate-300">{offer.repayment_source ?? "—"}</p>
              </div>
              <div>
                <p className="text-[10px] text-slate-500 uppercase tracking-wider mb-1">Offer Expires</p>
                <p className={offerExpired ? "text-red-400 font-semibold" : "text-slate-300"}>
                  {offer.expires_at ? new Date(offer.expires_at).toLocaleDateString("en-MY", { day: "numeric", month: "long", year: "numeric" }) : "—"}
                </p>
              </div>
            </div>

            {offer.conditions && (
              <div className="mt-4 rounded-lg border border-amber-500/15 bg-amber-950/10 p-3">
                <p className="text-[10px] text-amber-400 font-semibold uppercase tracking-wider mb-1">Required Conditions</p>
                <ul className="space-y-1">
                  {offer.conditions.split("\n").filter(Boolean).map((c, i) => (
                    <li key={i} className="text-xs text-amber-300/80 flex items-start gap-2">
                      <span className="mt-0.5">→</span><span>{c}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </SectionCard>

          {/* 2. Company Intelligence */}
          <SectionCard title="Company Intelligence Summary" icon="🏢">
            {intel ? (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-x-8 gap-y-3">
                  <div>
                    <p className="text-[10px] text-slate-500 uppercase tracking-wider mb-1.5">Overall Trust Score</p>
                    <ScoreBar value={intel.overall_trust_score ?? 0} />
                  </div>
                  <div>
                    <p className="text-[10px] text-slate-500 uppercase tracking-wider mb-1.5">Payment Behavior</p>
                    <ScoreBar value={intel.payment_behavior_score ?? 0} />
                  </div>
                  <div>
                    <p className="text-[10px] text-slate-500 uppercase tracking-wider mb-1.5">Operational Reliability</p>
                    <ScoreBar value={intel.operational_reliability_score ?? 0} />
                  </div>
                  <div>
                    <p className="text-[10px] text-slate-500 uppercase tracking-wider mb-1">Trend</p>
                    <p className={`text-sm font-semibold ${TREND_BADGE[intel.trend ?? ""] ?? "text-slate-400"}`}>
                      {intel.trend ?? "—"}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-3 flex-wrap">
                  {intel.risk_level && (
                    <Badge label={`Risk: ${intel.risk_level}`} cls={RISK_LEVEL_BADGE[intel.risk_level] ?? "border-slate-700 text-slate-400"} />
                  )}
                  {intel.financing_readiness && (
                    <Badge
                      label={`Readiness: ${intel.financing_readiness}`}
                      cls={intel.financing_readiness === "Priority" || intel.financing_readiness === "Eligible"
                        ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-400"
                        : "border-amber-500/30 bg-amber-500/10 text-amber-400"}
                    />
                  )}
                  {intel.completed_jobs != null && (
                    <span className="text-xs text-slate-500">{intel.completed_jobs} completed jobs</span>
                  )}
                  {intel.critical_exceptions != null && intel.critical_exceptions > 0 && (
                    <Badge label={`${intel.critical_exceptions} Critical Exception${intel.critical_exceptions > 1 ? "s" : ""}`} cls="border-red-500/30 bg-red-500/10 text-red-400" />
                  )}
                </div>
              </div>
            ) : (
              <p className="text-xs text-slate-500">Company intelligence not available.</p>
            )}
          </SectionCard>

          {/* 3. Trade / Job Evidence */}
          <SectionCard title="Trade & Job Evidence" icon="📦">
            {job ? (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-x-8 gap-y-3 text-sm">
                  <div>
                    <p className="text-[10px] text-slate-500 uppercase tracking-wider mb-1">Service Type</p>
                    <p className="text-slate-200">{job.service_type}</p>
                  </div>
                  <div>
                    <p className="text-[10px] text-slate-500 uppercase tracking-wider mb-1">Job Value</p>
                    <p className="text-slate-100 font-semibold tabular-nums">
                      {job.currency} {Number(job.job_value).toLocaleString("en-MY")}
                    </p>
                  </div>
                  <div>
                    <p className="text-[10px] text-slate-500 uppercase tracking-wider mb-1">Job Status</p>
                    <p className="text-slate-300">{job.job_status}</p>
                  </div>
                  <div>
                    <p className="text-[10px] text-slate-500 uppercase tracking-wider mb-1">Payment Status</p>
                    <p className="text-slate-300">{job.payment_status}</p>
                  </div>
                  <div>
                    <p className="text-[10px] text-slate-500 uppercase tracking-wider mb-1">Current Milestone</p>
                    <p className="text-slate-300">{job.current_milestone}</p>
                  </div>
                  <div>
                    <p className="text-[10px] text-slate-500 uppercase tracking-wider mb-1">Parties</p>
                    <p className="text-slate-400 text-xs">{job.customer} ↔ {job.service_provider}</p>
                  </div>
                </div>

                {/* Payment obligations */}
                {payObs.length > 0 && (
                  <div>
                    <p className="text-[10px] text-slate-500 uppercase tracking-wider mb-2">Payment Ledger</p>
                    <div className="space-y-1.5">
                      {payObs.map((p) => (
                        <div key={p.id} className="flex items-center justify-between rounded-lg border border-slate-800 bg-slate-900 px-3 py-2 text-xs">
                          <span className="text-slate-400">{p.obligation_type}</span>
                          <span className="tabular-nums text-slate-200">{p.currency} {Number(p.amount).toLocaleString("en-MY")}</span>
                          <span className={`rounded-full border px-2 py-0.5 text-[10px] ${
                            p.status === "Verified" ? "border-emerald-500/30 text-emerald-400" :
                            p.status === "Overdue"  ? "border-red-500/30 text-red-400"         :
                            p.status === "Disputed" ? "border-red-500/30 text-red-400"         :
                            "border-slate-700 text-slate-500"
                          }`}>{p.status}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Documents */}
                <div>
                  <p className="text-[10px] text-slate-500 uppercase tracking-wider mb-2">
                    Verified Documents ({verifiedDocs.length})
                  </p>
                  {verifiedDocs.length === 0 ? (
                    <p className="text-xs text-slate-600">No verified documents uploaded.</p>
                  ) : (
                    <div className="flex flex-wrap gap-2">
                      {verifiedDocs.map((d, i) => (
                        <span key={i} className="rounded-md border border-slate-700 bg-slate-800 px-2.5 py-1 text-[10px] text-slate-300">
                          {d.document_type}
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                {/* Shipment */}
                {shipment && (
                  <div>
                    <p className="text-[10px] text-slate-500 uppercase tracking-wider mb-2">Shipment Status</p>
                    <div className="rounded-lg border border-slate-800 bg-slate-900 px-3 py-2.5 text-xs space-y-1">
                      <div className="flex justify-between">
                        <span className="text-slate-500">Status</span>
                        <span className="text-slate-300">{shipment.tracking_status}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-500">Mode</span>
                        <span className="text-slate-300">{shipment.transport_mode}</span>
                      </div>
                      {shipment.eta && (
                        <div className="flex justify-between">
                          <span className="text-slate-500">ETA</span>
                          <span className="text-slate-300">{new Date(shipment.eta).toLocaleDateString("en-MY")}</span>
                        </div>
                      )}
                      {shipment.delay_days > 0 && (
                        <div className="flex justify-between">
                          <span className="text-slate-500">Delay</span>
                          <span className="text-amber-400 font-semibold">{shipment.delay_days} days</span>
                        </div>
                      )}
                      {shipment.latest_event && (
                        <div className="flex justify-between">
                          <span className="text-slate-500">Latest Event</span>
                          <span className="text-slate-400 max-w-[200px] text-right">{shipment.latest_event}</span>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <p className="text-xs text-slate-500">No job evidence linked to this offer.</p>
            )}
          </SectionCard>

          {/* 4. Risk Notes */}
          <SectionCard title="Risk Notes" icon="⚠">
            {offer.risk_notes && (
              <div className="mb-4">
                <p className="text-[10px] text-slate-500 uppercase tracking-wider mb-2">From Offer Assessment</p>
                <ul className="space-y-1.5">
                  {offer.risk_notes.split("\n").filter(Boolean).map((r, i) => (
                    <li key={i} className="flex items-start gap-2 text-xs text-amber-300/80">
                      <span className="mt-0.5 text-amber-400">⚠</span><span>{r}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {critExc.length > 0 && (
              <div className="mb-4">
                <p className="text-[10px] text-slate-500 uppercase tracking-wider mb-2">
                  Open Exceptions ({openExc.length}, {critExc.length} Critical)
                </p>
                <div className="space-y-1.5">
                  {openExc.slice(0, 5).map((e) => (
                    <div key={e.id} className="flex items-center gap-2 rounded-lg border border-slate-800 bg-slate-900 px-3 py-2 text-xs">
                      <span className={`rounded-full border px-1.5 py-0.5 text-[9px] font-bold ${
                        e.severity === "Critical" ? "border-red-500/50 text-red-400" :
                        e.severity === "High"     ? "border-amber-500/30 text-amber-400" :
                        "border-slate-700 text-slate-500"
                      }`}>{e.severity}</span>
                      <span className="text-slate-300 flex-1">{e.exception_type}</span>
                      <span className="text-slate-600">{e.status}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {overdueObs.length > 0 && (
              <div className="mb-4">
                <p className="text-[10px] text-slate-500 uppercase tracking-wider mb-2">Overdue Payment Obligations</p>
                <div className="space-y-1.5">
                  {overdueObs.map((o) => (
                    <div key={o.id} className="flex items-center justify-between rounded-lg border border-red-500/20 bg-red-950/10 px-3 py-2 text-xs">
                      <span className="text-red-300">{o.obligation_type}</span>
                      <span className="tabular-nums text-red-300">{o.currency} {Number(o.amount).toLocaleString("en-MY")}</span>
                      <span className="text-red-400">Overdue</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {shipment && shipment.delay_days > 5 && (
              <div className="rounded-lg border border-amber-500/15 bg-amber-950/10 px-3 py-2.5">
                <p className="text-xs text-amber-300">
                  ⏱ Shipment delayed by {shipment.delay_days} days — may affect repayment timeline.
                </p>
              </div>
            )}

            {!offer.risk_notes && critExc.length === 0 && overdueObs.length === 0 && (!shipment || shipment.delay_days <= 5) && (
              <p className="text-xs text-slate-500">No material risk flags identified for this opportunity.</p>
            )}
          </SectionCard>

          {/* 5. Decision Support */}
          <SectionCard title="Decision Support" icon="◆">
            {capRead ? (
              <div className="space-y-3">
                <div className="flex items-center gap-3 flex-wrap">
                  <Badge
                    label={`Capital Readiness: ${capRead.readiness_status}`}
                    cls={
                      capRead.readiness_status === "Priority" || capRead.readiness_status === "Eligible"
                        ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-400"
                        : "border-amber-500/30 bg-amber-500/10 text-amber-400"
                    }
                  />
                  <span className="text-xs text-slate-500">Score: {capRead.readiness_score}/100</span>
                  <span className="text-xs text-slate-600">({capRead.assessment_type})</span>
                </div>

                {capRead.key_strengths && (
                  <div>
                    <p className="text-[10px] text-slate-500 uppercase tracking-wider mb-1.5">Why Eligible</p>
                    <ul className="space-y-1">
                      {capRead.key_strengths.split("\n").filter(Boolean).map((s, i) => (
                        <li key={i} className="flex items-start gap-2 text-xs text-emerald-300/80">
                          <span className="text-emerald-400">✓</span><span>{s}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {capRead.required_conditions && (
                  <div>
                    <p className="text-[10px] text-slate-500 uppercase tracking-wider mb-1.5">Conditions Before Real Financing</p>
                    <ul className="space-y-1">
                      {capRead.required_conditions.split("\n").filter(Boolean).map((c, i) => (
                        <li key={i} className="flex items-start gap-2 text-xs text-amber-300/80">
                          <span>→</span><span>{c}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                <div className="rounded-lg border border-blue-500/15 bg-blue-950/10 px-3 py-2.5">
                  <p className="text-xs text-blue-300">
                    💡 Suggested action:{" "}
                    {capRead.readiness_status === "Priority"
                      ? "Proceed with full credit review. All key indicators are strong."
                      : capRead.readiness_status === "Eligible"
                      ? "Review conditions and document completeness before committing."
                      : "Further assessment recommended — readiness score is below threshold."}
                  </p>
                </div>
              </div>
            ) : (
              <div className="rounded-lg border border-slate-800 bg-slate-900 px-3 py-3">
                <p className="text-xs text-slate-500">
                  No capital readiness assessment available. Nexum will provide updated data when an assessment is run.
                </p>
              </div>
            )}

            {/* Audit timeline */}
            {auditLogs.length > 0 && (
              <div className="mt-5">
                <p className="text-[10px] text-slate-500 uppercase tracking-wider mb-2">Trade Evidence Timeline</p>
                <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
                  {auditLogs.map((a, i) => (
                    <div key={i} className="flex items-start gap-2 text-[10px] text-slate-500">
                      <span className="text-slate-700 flex-shrink-0 tabular-nums">
                        {new Date(a.created_at).toLocaleDateString("en-MY")}
                      </span>
                      <span className="text-slate-600 flex-shrink-0">{a.actor_role}</span>
                      <span className="text-slate-400">{a.description}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </SectionCard>
        </div>

        {/* ── Side column ─────────────────────────────────────────────────────── */}
        <div className="lg:col-span-1">
          {/* Decision panel */}
          <div className="sticky top-24">
            <div className="rounded-xl border border-slate-800 bg-slate-900/80 p-5 mb-4">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-4">Your Decision</h3>

              {offer.partner_interest_status ? (
                <div className={`rounded-lg border px-4 py-3 mb-4 ${PARTNER_INTEREST_BADGE[offer.partner_interest_status as keyof typeof PARTNER_INTEREST_BADGE] ?? "border-slate-700"}`}>
                  <p className="text-sm font-semibold">
                    {offer.partner_interest_status === "Interested"      ? "★ Interest Registered"  :
                     offer.partner_interest_status === "Need More Info"  ? "? More Info Requested"   :
                                                                           "✕ Declined"}
                  </p>
                  {offer.partner_interest_note && (
                    <p className="mt-1 text-[10px] opacity-80">"{offer.partner_interest_note}"</p>
                  )}
                </div>
              ) : (
                <p className="text-xs text-slate-500 mb-3 italic">No decision recorded yet.</p>
              )}

              {offerExpired ? (
                <div className="rounded-lg border border-amber-500/20 bg-amber-950/10 px-3 py-2.5">
                  <p className="text-xs text-amber-400">This offer has expired. Contact Nexum to request a refreshed assessment.</p>
                </div>
              ) : canDecide ? (
                <div className="space-y-2">
                  {showNote && (
                    <textarea
                      value={noteText}
                      onChange={(e) => setNoteText(e.target.value)}
                      placeholder="Optional note for Nexum…"
                      rows={3}
                      className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-xs text-slate-200 placeholder:text-slate-600 focus:border-blue-500/50 focus:outline-none resize-none"
                    />
                  )}
                  <button
                    type="button"
                    disabled={actionLoading === "mark_interested"}
                    onClick={() => { setShowNote(true); handleDecision("mark_interested"); }}
                    className="w-full rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-4 py-2.5 text-sm font-semibold text-emerald-400 hover:bg-emerald-500/20 transition-colors disabled:opacity-40"
                  >
                    {actionLoading === "mark_interested" ? "Registering…" : "★ Interested"}
                  </button>
                  <button
                    type="button"
                    disabled={actionLoading === "need_more_info"}
                    onClick={() => { setShowNote(true); handleDecision("need_more_info"); }}
                    className="w-full rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-2.5 text-sm font-semibold text-amber-400 hover:bg-amber-500/20 transition-colors disabled:opacity-40"
                  >
                    {actionLoading === "need_more_info" ? "Sending…" : "? Need More Info"}
                  </button>
                  <button
                    type="button"
                    disabled={actionLoading === "declined"}
                    onClick={() => { setShowNote(true); handleDecision("declined"); }}
                    className="w-full rounded-lg border border-red-500/20 bg-red-500/5 px-4 py-2.5 text-sm font-semibold text-red-400 hover:bg-red-500/10 transition-colors disabled:opacity-40"
                  >
                    {actionLoading === "declined" ? "Declining…" : "✕ Decline"}
                  </button>
                  {!showNote && (
                    <button
                      type="button"
                      onClick={() => setShowNote(true)}
                      className="w-full text-[10px] text-slate-500 hover:text-slate-300 transition-colors pt-1"
                    >
                      + Add note
                    </button>
                  )}
                </div>
              ) : (
                <p className="text-xs text-slate-500">No further actions available for this opportunity.</p>
              )}
            </div>

            {/* Quick stats */}
            <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4 space-y-3">
              <h3 className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Quick Stats</h3>
              <div className="flex justify-between text-xs">
                <span className="text-slate-500">Documents</span>
                <span className="text-slate-300 font-semibold">{verifiedDocs.length}</span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-slate-500">Open Exceptions</span>
                <span className={openExc.length > 0 ? "text-amber-400 font-semibold" : "text-slate-300"}>{openExc.length}</span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-slate-500">Overdue Obligations</span>
                <span className={overdueObs.length > 0 ? "text-red-400 font-semibold" : "text-slate-300"}>{overdueObs.length}</span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-slate-500">Shipment Delay</span>
                <span className={shipment && shipment.delay_days > 0 ? "text-amber-400" : "text-slate-300"}>
                  {shipment ? (shipment.delay_days > 0 ? `${shipment.delay_days}d` : "None") : "—"}
                </span>
              </div>
            </div>

            {/* Disclaimer */}
            <div className="mt-4 rounded-lg border border-slate-800 bg-slate-900/40 p-4">
              <p className="text-[9px] text-slate-600 leading-relaxed">{CAPITAL_PARTNER_DISCLAIMER}</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
