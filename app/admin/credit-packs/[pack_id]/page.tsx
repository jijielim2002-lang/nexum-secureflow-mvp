"use client";
import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { AuthGuard } from "@/components/AuthGuard";
import { LogoutButton } from "@/components/LogoutButton";
import { NotificationBell } from "@/components/NotificationBell";
import {
  PACK_STATUS_BADGE,
  CREDIT_PACK_DISCLAIMER,
  buildShareSummary,
  type CreditPackRow,
  type PackStatus,
} from "@/lib/creditPack";

// ─── Print styles (injected in <head> via <style> tag) ────────────────────────

const PRINT_CSS = `
@media print {
  .no-print { display: none !important; }
  body { background: #fff !important; color: #111 !important; font-family: Georgia, serif; }
  .pack-shell { background: #fff !important; color: #111 !important; padding: 0 !important; }
  .pack-card  { background: #fff !important; border: 1px solid #d1d5db !important; color: #111 !important; margin-bottom: 1.5rem; page-break-inside: avoid; }
  .pack-section-title { color: #374151 !important; border-bottom: 1px solid #e5e7eb; padding-bottom: 0.25rem; margin-bottom: 0.75rem; }
  .pack-label  { color: #6b7280 !important; font-size: 0.7rem; text-transform: uppercase; letter-spacing: 0.05em; }
  .pack-value  { color: #111827 !important; }
  .pack-risk   { color: #dc2626 !important; }
  .pack-strength { color: #059669 !important; }
  .pack-cond   { color: #d97706 !important; }
  .pack-disclaimer { border: 2px solid #f59e0b !important; background: #fffbeb !important; color: #92400e !important; page-break-inside: avoid; }
  .hero-amount { font-size: 2rem; font-weight: 800; color: #1d4ed8 !important; }
  a { color: #1d4ed8 !important; text-decoration: none; }
}
`;

// ─── Sub-components ───────────────────────────────────────────────────────────

function PackCard({ title, icon, children }: { title: string; icon: string; children: React.ReactNode }) {
  return (
    <div className="pack-card rounded-xl border border-slate-800 bg-slate-900/60 p-5 mb-5 print:rounded-none">
      <h2 className="pack-section-title mb-4 flex items-center gap-2 text-[11px] font-bold uppercase tracking-wider text-slate-400 print:text-gray-600">
        <span className="no-print">{icon}</span>{title}
      </h2>
      {children}
    </div>
  );
}

function Row({ label, value, cls = "" }: { label: string; value: React.ReactNode; cls?: string }) {
  return (
    <div className="flex items-start justify-between gap-4 py-1.5 border-b border-slate-800/40 print:border-gray-200 last:border-0">
      <span className="pack-label text-[10px] text-slate-500 uppercase tracking-wider flex-shrink-0 w-36">{label}</span>
      <span className={`pack-value text-xs text-slate-200 text-right flex-1 ${cls}`}>{value}</span>
    </div>
  );
}

function ScoreBar({ value, max = 100 }: { value: number; max?: number }) {
  const pct   = Math.min(100, (value / max) * 100);
  const color = value >= 80 ? "bg-emerald-500" : value >= 60 ? "bg-amber-500" : "bg-red-500";
  return (
    <div className="flex items-center gap-2 w-full no-print">
      <div className="flex-1 h-1.5 rounded-full bg-slate-800 overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs tabular-nums text-slate-300 w-8 text-right font-bold">{value}</span>
    </div>
  );
}

function Badge({ label, cls }: { label: string; cls: string }) {
  return <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${cls}`}>{label}</span>;
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function CreditPackDetailPage() {
  return (
    <AuthGuard requiredRole="admin">
      <PackDetail />
    </AuthGuard>
  );
}

function PackDetail() {
  const { pack_id } = useParams<{ pack_id: string }>();

  const [pack,      setPack]      = useState<CreditPackRow | null>(null);
  const [loading,   setLoading]   = useState(true);
  const [error,     setError]     = useState<string | null>(null);
  const [copied,    setCopied]    = useState(false);
  const [statusOp,  setStatusOp]  = useState<string | null>(null);
  const [scanBusy,  setScanBusy]  = useState(false);
  const [scanToast, setScanToast] = useState<string | null>(null);

  async function runWordingScan() {
    if (!pack_id) return;
    setScanBusy(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token ?? "";
      const res = await fetch("/api/compliance-wording-scan", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ sourceTypes: ["credit_pack"], actorName: "Nexum Admin" }),
      });
      const json = await res.json();
      const text = res.ok ? `Scan complete — ${json.newFindings} new issue${json.newFindings !== 1 ? "s" : ""} found.` : `Error: ${json.error}`;
      setScanToast(text);
      setTimeout(() => setScanToast(null), 5000);
    } finally { setScanBusy(false); }
  }

  const load = useCallback(async () => {
    if (!pack_id) return;
    setLoading(true); setError(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      const res = await fetch(`/api/credit-packs/${pack_id}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      const json = await res.json() as { pack?: CreditPackRow; error?: string };
      if (!res.ok) throw new Error(json.error ?? "Pack not found");
      setPack(json.pack ?? null);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Load failed");
    } finally {
      setLoading(false);
    }
  }, [pack_id]);

  useEffect(() => { load(); }, [load]);

  async function handleStatusChange(newStatus: PackStatus) {
    if (!pack) return;
    setStatusOp(newStatus);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      const res = await fetch(`/api/credit-packs/${pack_id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ pack_status: newStatus }),
      });
      if (res.ok) await load();
    } finally {
      setStatusOp(null);
    }
  }

  async function handleCopyShareSummary() {
    if (!pack) return;
    try {
      await navigator.clipboard.writeText(buildShareSummary(pack));
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      // fallback silent fail
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <span className="animate-pulse text-slate-600 text-2xl">◌</span>
      </div>
    );
  }

  if (error || !pack) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <div className="text-center px-6">
          <p className="text-sm text-red-400 mb-3">{error ?? "Pack not found"}</p>
          <Link href="/admin/credit-packs" className="text-xs text-blue-400 hover:underline">← Back to Credit Packs</Link>
        </div>
      </div>
    );
  }

  const cs = pack.credit_summary;
  const es = pack.evidence_summary;
  const rs = pack.risk_summary;

  return (
    <>
      <style>{PRINT_CSS}</style>
      {scanToast && (
        <div className="fixed bottom-4 right-4 z-50 rounded-xl border border-amber-500/30 bg-amber-900/80 px-4 py-2.5 text-xs text-amber-300 shadow-lg">{scanToast}</div>
      )}
      <div className="pack-shell min-h-screen bg-slate-950 text-slate-100 font-sans">

        {/* ── Header (no-print) ────────────────────────────────────────────── */}
        <header className="no-print border-b border-slate-800 bg-slate-950/80 sticky top-0 z-50">
          <div className="mx-auto flex h-14 max-w-7xl items-center justify-between px-6">
            <Link href="/" className="flex items-center gap-2 text-sm font-semibold">
              <span className="text-blue-400">&#9632;</span> Nexum SecureFlow
            </Link>
            <nav className="flex items-center gap-4 text-xs text-slate-400">
              <Link href="/admin/credit-packs" className="hover:text-slate-100 transition-colors">← Credit Packs</Link>
              <button onClick={runWordingScan} disabled={scanBusy}
                className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-1 text-[11px] font-semibold text-amber-300 hover:bg-amber-500/20 disabled:opacity-40 transition-colors">
                {scanBusy ? "Scanning…" : "Wording Scan"}
              </button>
              <NotificationBell />
              <LogoutButton />
            </nav>
          </div>
        </header>

        <main className="mx-auto w-full max-w-5xl px-6 py-8">

          {/* ── Pack header ──────────────────────────────────────────────────── */}
          <div className="mb-6">
            {/* Print-only title block */}
            <div className="hidden print:block mb-6 pb-4 border-b-2 border-gray-800">
              <p className="text-[10px] text-gray-500 uppercase tracking-widest mb-1">Nexum SecureFlow — Confidential</p>
              <h1 className="text-2xl font-bold text-gray-900">{pack.pack_title ?? "Credit Pack"}</h1>
              <p className="text-sm text-gray-500 mt-0.5">
                Generated {pack.generated_at ? new Date(pack.generated_at).toLocaleString("en-MY") : "—"}
              </p>
            </div>

            {/* Screen title */}
            <div className="no-print mb-2">
              <Link href="/admin/credit-packs" className="text-xs text-slate-500 hover:text-slate-300 transition-colors">
                ← Credit Packs
              </Link>
            </div>
            <div className="no-print flex items-start justify-between gap-4 flex-wrap">
              <div>
                <h1 className="text-xl font-bold text-slate-50">📄 {pack.pack_title ?? "Credit Pack"}</h1>
                <p className="mt-0.5 text-xs text-slate-500">
                  Generated {pack.generated_at ? new Date(pack.generated_at).toLocaleString("en-MY") : "—"}
                  {pack.job_reference && <span className="ml-2 font-mono text-slate-600">· {pack.job_reference}</span>}
                </p>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <Badge label={pack.pack_status} cls={PACK_STATUS_BADGE[pack.pack_status]} />

                {/* Status actions */}
                {pack.pack_status === "Generated" && (
                  <button
                    type="button" onClick={() => handleStatusChange("Shared")} disabled={!!statusOp}
                    className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-1.5 text-xs font-semibold text-emerald-400 hover:bg-emerald-500/20 transition-colors disabled:opacity-40"
                  >
                    {statusOp === "Shared" ? "Marking…" : "Mark Shared"}
                  </button>
                )}
                {pack.pack_status !== "Expired" && (
                  <button
                    type="button" onClick={() => handleStatusChange("Expired")} disabled={!!statusOp}
                    className="rounded-lg border border-amber-500/20 bg-amber-500/5 px-3 py-1.5 text-xs text-amber-400 hover:bg-amber-500/10 transition-colors disabled:opacity-40"
                  >
                    {statusOp === "Expired" ? "…" : "Expire"}
                  </button>
                )}

                {/* Copy share summary */}
                <button
                  type="button" onClick={handleCopyShareSummary}
                  className="rounded-lg border border-slate-700 bg-slate-800 px-3 py-1.5 text-xs font-semibold text-slate-300 hover:bg-slate-700 transition-colors"
                >
                  {copied ? "✓ Copied!" : "⎘ Copy Summary"}
                </button>

                {/* Print */}
                <button
                  type="button" onClick={() => window.print()}
                  className="rounded-lg border border-blue-600/40 bg-blue-600/15 px-3 py-1.5 text-xs font-semibold text-blue-400 hover:bg-blue-600/25 transition-colors"
                >
                  🖨 Print / PDF
                </button>
              </div>
            </div>
          </div>

          {/* ─────────────────────────────────────────────────────────────────
              SECTION 1 — Executive Summary
          ───────────────────────────────────────────────────────────────── */}
          <PackCard title="Executive Summary" icon="◆">
            {/* Hero amount */}
            {cs?.offerAmount != null && (
              <div className="hero-amount mb-4 rounded-xl border border-blue-500/20 bg-blue-950/20 p-4 no-print print:border-blue-200 print:bg-blue-50">
                <p className="text-[10px] text-blue-400 uppercase tracking-wider mb-1 print:text-blue-600">Simulated Offer Amount</p>
                <p className="text-4xl font-bold text-blue-300 tabular-nums print:text-blue-800">
                  {cs.currency} {cs.offerAmount.toLocaleString("en-MY")}
                </p>
                {cs.tenure != null && (
                  <p className="text-xs text-blue-400/70 mt-1 print:text-blue-600">over {cs.tenure} days</p>
                )}
              </div>
            )}
            <p className="text-sm text-slate-300 leading-relaxed mb-4 print:text-gray-700">{pack.executive_summary}</p>
            <div className="grid grid-cols-2 gap-x-8 gap-y-1.5">
              <Row label="Company"          value={cs?.companyName ?? "—"} />
              <Row label="Product Type"     value={cs?.productType ?? "—"} />
              <Row label="Readiness"        value={cs?.readinessStatus ? `${cs.readinessStatus} (${cs.readinessScore}/100)` : "—"} />
              <Row label="Repayment Source" value={cs?.repaymentSource ?? "—"} />
              <Row label="Estimated Fee"    value={cs?.estimatedFee != null ? `${cs.currency} ${cs.estimatedFee.toLocaleString("en-MY")}` : "—"} />
              <Row label="Rec. Amount"      value={cs?.recommendedAmount != null ? `${cs.currency} ${cs.recommendedAmount.toLocaleString("en-MY")}` : "—"} />
            </div>
          </PackCard>

          {/* ─────────────────────────────────────────────────────────────────
              SECTION 2 — Company Intelligence
          ───────────────────────────────────────────────────────────────── */}
          <PackCard title="Company Intelligence" icon="🏢">
            {cs ? (
              <div className="space-y-3">
                <div className="grid grid-cols-1 gap-y-2 sm:grid-cols-2 gap-x-8">
                  {cs.overallTrustScore != null && (
                    <div>
                      <p className="pack-label text-[9px] text-slate-500 uppercase tracking-wider mb-1">Overall Trust Score</p>
                      <ScoreBar value={cs.overallTrustScore} />
                      <span className="hidden print:block text-xs">{cs.overallTrustScore}/100</span>
                    </div>
                  )}
                  {cs.paymentBehaviorScore != null && (
                    <div>
                      <p className="pack-label text-[9px] text-slate-500 uppercase tracking-wider mb-1">Payment Behavior</p>
                      <ScoreBar value={cs.paymentBehaviorScore} />
                      <span className="hidden print:block text-xs">{cs.paymentBehaviorScore}/100</span>
                    </div>
                  )}
                  {cs.operationalReliabilityScore != null && (
                    <div>
                      <p className="pack-label text-[9px] text-slate-500 uppercase tracking-wider mb-1">Operational Reliability</p>
                      <ScoreBar value={cs.operationalReliabilityScore} />
                      <span className="hidden print:block text-xs">{cs.operationalReliabilityScore}/100</span>
                    </div>
                  )}
                </div>
                <div className="flex flex-wrap gap-2 pt-2">
                  {cs.riskLevel && (
                    <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${
                      cs.riskLevel === "Critical" ? "border-red-700/50 text-red-300" :
                      cs.riskLevel === "High"     ? "border-red-500/30 text-red-400" :
                      cs.riskLevel === "Medium"   ? "border-amber-500/30 text-amber-400" :
                      "border-emerald-500/30 text-emerald-400"
                    }`}>Risk: {cs.riskLevel}</span>
                  )}
                  {cs.trend && (
                    <span className={`text-xs font-semibold ${
                      cs.trend === "Improving" ? "text-emerald-400" :
                      cs.trend === "Deteriorating" ? "text-red-400" : "text-slate-400"
                    }`}>{cs.trend}</span>
                  )}
                  {cs.financingReadiness && (
                    <span className="rounded-full border border-blue-500/30 bg-blue-500/10 px-2 py-0.5 text-[10px] text-blue-400">
                      Readiness: {cs.financingReadiness}
                    </span>
                  )}
                  {cs.completedJobs != null && (
                    <span className="text-xs text-slate-500">{cs.completedJobs} completed jobs</span>
                  )}
                  {cs.criticalExceptions != null && cs.criticalExceptions > 0 && (
                    <span className="rounded-full border border-red-500/30 bg-red-500/10 px-2 py-0.5 text-[10px] text-red-400">
                      {cs.criticalExceptions} critical exception{cs.criticalExceptions > 1 ? "s" : ""}
                    </span>
                  )}
                </div>
              </div>
            ) : (
              <p className="text-xs text-slate-500">No company intelligence data.</p>
            )}
          </PackCard>

          {/* ─────────────────────────────────────────────────────────────────
              SECTION 3 — Trade / Job Evidence
          ───────────────────────────────────────────────────────────────── */}
          <PackCard title="Trade & Job Evidence" icon="📦">
            {es ? (
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-x-8 gap-y-1.5">
                  <Row label="Job Reference"   value={es.jobReference ?? "—"} />
                  <Row label="Service Type"    value={es.serviceType  ?? "—"} />
                  <Row label="Job Value"       value={es.jobValue != null ? `${es.jobCurrency} ${Number(es.jobValue).toLocaleString("en-MY")}` : "—"} />
                  <Row label="Job Status"      value={es.jobStatus    ?? "—"} />
                  <Row label="Payment Status"  value={es.paymentStatus ?? "—"} />
                  <Row label="Route"           value={es.route        ?? "—"} />
                  <Row label="Customer"        value={es.customer     ?? "—"} />
                  <Row label="Service Provider" value={es.serviceProvider ?? "—"} />
                </div>
                {/* Payment ledger */}
                {es.paymentObRows.length > 0 && (
                  <div className="mt-3">
                    <p className="pack-label text-[9px] text-slate-500 uppercase tracking-wider mb-1.5">Payment Ledger</p>
                    <div className="space-y-1">
                      {es.paymentObRows.map((ob, i) => (
                        <div key={i} className="flex items-center justify-between rounded border border-slate-800 bg-slate-900/60 px-3 py-1.5 text-[10px] print:border-gray-200 print:bg-white">
                          <span className="text-slate-400">{ob.type}</span>
                          <span className="tabular-nums text-slate-200">{ob.currency} {Number(ob.amount).toLocaleString("en-MY")}</span>
                          <span className={ob.status === "Verified" ? "text-emerald-400" : ob.status === "Overdue" ? "text-red-400" : "text-slate-500"}>
                            {ob.status}
                          </span>
                        </div>
                      ))}
                    </div>
                    <div className="mt-2 flex gap-4 text-[10px]">
                      <span className="text-slate-500">Outstanding: <span className={`font-bold ${es.totalOutstanding > 0 ? "text-amber-400" : "text-slate-400"}`}>{es.jobCurrency} {es.totalOutstanding.toLocaleString("en-MY")}</span></span>
                      <span className="text-slate-500">Verified obligations: <span className="text-emerald-400 font-bold">{es.verifiedObligations}</span></span>
                      {es.overdueCount > 0 && <span className="text-red-400 font-bold">⚠ {es.overdueCount} overdue</span>}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <p className="text-xs text-slate-500">No job evidence data available.</p>
            )}
          </PackCard>

          {/* ─────────────────────────────────────────────────────────────────
              SECTION 4 — Document Evidence
          ───────────────────────────────────────────────────────────────── */}
          <PackCard title="Document Evidence" icon="📋">
            {es ? (
              <div className="space-y-3">
                <div>
                  <p className="pack-label text-[9px] text-slate-500 uppercase tracking-wider mb-1.5">
                    Verified Documents ({es.verifiedDocTypes.length})
                  </p>
                  {es.verifiedDocTypes.length === 0 ? (
                    <p className="text-xs text-slate-600">No verified documents.</p>
                  ) : (
                    <div className="flex flex-wrap gap-1.5">
                      {es.verifiedDocTypes.map((d, i) => (
                        <span key={i} className="rounded border border-emerald-500/25 bg-emerald-500/5 px-2 py-0.5 text-[10px] text-emerald-400 pack-strength print:border-green-300 print:text-green-700">
                          ✓ {d}
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                {es.missingDocTypes.length > 0 && (
                  <div>
                    <p className="pack-label text-[9px] text-slate-500 uppercase tracking-wider mb-1.5">
                      Potentially Missing Standard Documents
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {es.missingDocTypes.map((d, i) => (
                        <span key={i} className="rounded border border-amber-500/25 bg-amber-500/5 px-2 py-0.5 text-[10px] text-amber-400 pack-cond print:border-yellow-300 print:text-yellow-700">
                          ? {d}
                        </span>
                      ))}
                    </div>
                    <p className="mt-1 text-[9px] text-slate-600">
                      Based on standard trade document checklist. Actual requirements depend on trade terms.
                    </p>
                  </div>
                )}

                {es.extractionAvgConfidence != null && (
                  <Row
                    label="Avg Extraction Confidence"
                    value={`${(es.extractionAvgConfidence * 100).toFixed(1)}%`}
                    cls={es.extractionAvgConfidence >= 0.85 ? "text-emerald-400" : "text-amber-400"}
                  />
                )}
              </div>
            ) : (
              <p className="text-xs text-slate-500">No document evidence data.</p>
            )}
          </PackCard>

          {/* ─────────────────────────────────────────────────────────────────
              SECTION 5 — Shipment Evidence
          ───────────────────────────────────────────────────────────────── */}
          <PackCard title="Shipment Evidence" icon="🚢">
            {es && (es.trackingStatus || es.blNumber || es.awbNumber) ? (
              <div className="grid grid-cols-2 gap-x-8 gap-y-1.5">
                <Row label="Tracking Status" value={es.trackingStatus ?? "—"} />
                <Row label="Delay Days"      value={es.delayDays > 0 ? `${es.delayDays} days` : "None"} cls={es.delayDays > 0 ? "text-amber-400 font-bold" : ""} />
                <Row label="ETA"             value={es.eta ? new Date(es.eta).toLocaleDateString("en-MY") : "—"} />
                <Row label="B/L Number"      value={es.blNumber ?? "—"} />
                <Row label="AWB Number"      value={es.awbNumber ?? "—"} />
                <Row label="Container"       value={es.containerNumber ?? "—"} />
                <Row label="Vessel"          value={es.vesselName ?? "—"} />
                <Row label="Flight"          value={es.flightNumber ?? "—"} />
                <Row label="Data Source"     value={es.dataSource ?? "—"} />
              </div>
            ) : (
              <p className="text-xs text-slate-500">No shipment tracking data available for this job.</p>
            )}
          </PackCard>

          {/* ─────────────────────────────────────────────────────────────────
              SECTION 6 — Risk Summary
          ───────────────────────────────────────────────────────────────── */}
          <PackCard title="Risk Summary" icon="⚠">
            {rs ? (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-x-8 gap-y-1.5 sm:grid-cols-4">
                  <Row label="Open Exceptions"    value={rs.openExceptions}    cls={rs.openExceptions > 0 ? "text-amber-400 font-bold" : ""} />
                  <Row label="Critical Exceptions" value={rs.criticalExceptions} cls={rs.criticalExceptions > 0 ? "text-red-400 font-bold" : ""} />
                  <Row label="Overdue Obligations" value={rs.overdueObligations} cls={rs.overdueObligations > 0 ? "text-red-400 font-bold" : ""} />
                  <Row label="Shipment Delay"      value={rs.shipmentDelay > 0 ? `${rs.shipmentDelay}d` : "None"} cls={rs.shipmentDelay > 0 ? "text-amber-400 font-bold" : ""} />
                  {rs.supplyDisruptionRisk && (
                    <Row label="Supply Disruption" value={rs.supplyDisruptionRisk} cls={rs.supplyDisruptionRisk === "Critical" || rs.supplyDisruptionRisk === "High" ? "text-red-400" : "text-slate-300"} />
                  )}
                  {rs.marginPercentage != null && (
                    <Row label="Margin %" value={`${rs.marginPercentage.toFixed(1)}%`} cls={rs.marginPercentage < 10 ? "text-red-400 font-bold" : "text-emerald-400"} />
                  )}
                </div>

                {rs.exceptionTypes.length > 0 && (
                  <div>
                    <p className="pack-label text-[9px] text-slate-500 uppercase tracking-wider mb-1">Open Exception Types</p>
                    <div className="flex flex-wrap gap-1.5">
                      {rs.exceptionTypes.map((e, i) => (
                        <span key={i} className="rounded border border-red-500/20 bg-red-500/5 px-2 py-0.5 text-[10px] text-red-400 pack-risk">{e}</span>
                      ))}
                    </div>
                  </div>
                )}

                {rs.keyRisks.length > 0 && (
                  <div>
                    <p className="pack-label text-[9px] text-slate-500 uppercase tracking-wider mb-1">Key Risk Factors (from Assessment)</p>
                    <ul className="space-y-1">
                      {rs.keyRisks.map((r, i) => (
                        <li key={i} className="flex items-start gap-1.5 text-xs text-amber-300/80 pack-risk print:text-yellow-800">
                          <span className="text-amber-400 mt-0.5">⚠</span><span>{r}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {rs.offerRiskNotes.length > 0 && (
                  <div>
                    <p className="pack-label text-[9px] text-slate-500 uppercase tracking-wider mb-1">Offer Risk Notes</p>
                    <ul className="space-y-1">
                      {rs.offerRiskNotes.map((r, i) => (
                        <li key={i} className="flex items-start gap-1.5 text-xs text-red-300/80 pack-risk">
                          <span>→</span><span>{r}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {rs.openExceptions === 0 && rs.overdueObligations === 0 && rs.criticalExceptions === 0 && rs.shipmentDelay <= 0 && (
                  <p className="text-xs text-emerald-400 pack-strength">✓ No material risk flags identified at time of generation.</p>
                )}
              </div>
            ) : (
              <p className="text-xs text-slate-500">No risk summary data.</p>
            )}
          </PackCard>

          {/* ─────────────────────────────────────────────────────────────────
              SECTION 7 — Nexum Brain Credit Memo
          ───────────────────────────────────────────────────────────────── */}
          <PackCard title="Nexum Brain — Credit Memo" icon="◆">
            {cs ? (
              <div className="space-y-4">
                {/* Why eligible */}
                {cs.keyStrengths.length > 0 && (
                  <div>
                    <p className="pack-label text-[9px] text-slate-500 uppercase tracking-wider mb-1.5">Why Eligible</p>
                    <ul className="space-y-1">
                      {cs.keyStrengths.map((s, i) => (
                        <li key={i} className="flex items-start gap-1.5 text-xs text-emerald-300/80 pack-strength print:text-green-800">
                          <span className="text-emerald-400">✓</span><span>{s}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Key risks */}
                {cs.keyRisks.length > 0 && (
                  <div>
                    <p className="pack-label text-[9px] text-slate-500 uppercase tracking-wider mb-1.5">Key Risk Factors</p>
                    <ul className="space-y-1">
                      {cs.keyRisks.map((r, i) => (
                        <li key={i} className="flex items-start gap-1.5 text-xs text-amber-300/80 pack-risk">
                          <span className="text-amber-400">⚠</span><span>{r}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Required conditions */}
                {cs.requiredConditions.length > 0 && (
                  <div>
                    <p className="pack-label text-[9px] text-slate-500 uppercase tracking-wider mb-1.5">Required Conditions Before Real Financing</p>
                    <ul className="space-y-1">
                      {cs.requiredConditions.map((c, i) => (
                        <li key={i} className="flex items-start gap-1.5 text-xs text-amber-300/80 pack-cond">
                          <span>→</span><span>{c}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Offer conditions */}
                {cs.offerConditions.length > 0 && (
                  <div>
                    <p className="pack-label text-[9px] text-slate-500 uppercase tracking-wider mb-1.5">Offer-Specific Conditions</p>
                    <ul className="space-y-1">
                      {cs.offerConditions.map((c, i) => (
                        <li key={i} className="flex items-start gap-1.5 text-xs text-amber-300/80">
                          <span>→</span><span>{c}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Recommended next action */}
                <div className="rounded-lg border border-blue-500/15 bg-blue-950/10 px-3 py-2.5 print:border-blue-200 print:bg-blue-50">
                  <p className="text-xs text-blue-300 print:text-blue-800">
                    💡 <strong>Recommended Next Action: </strong>
                    {cs.readinessStatus === "Priority"
                      ? "Proceed with full credit assessment and term sheet preparation. All key indicators are strong."
                      : cs.readinessStatus === "Eligible"
                      ? "Review all required conditions and verify document completeness before committing to term sheet."
                      : "Further assessment recommended — resolve blocking risk factors before progressing."}
                  </p>
                </div>
              </div>
            ) : (
              <p className="text-xs text-slate-500">No credit memo data.</p>
            )}
          </PackCard>

          {/* ─────────────────────────────────────────────────────────────────
              SECTION 8 — Disclaimer
          ───────────────────────────────────────────────────────────────── */}
          <div className="pack-disclaimer rounded-xl border border-amber-500/25 bg-amber-950/10 p-5 mb-6 print:border-2 print:border-amber-300 print:bg-amber-50">
            <p className="text-[10px] font-bold text-amber-400 uppercase tracking-wider mb-2 print:text-amber-800">⚠ Important Disclaimer</p>
            <p className="text-xs text-amber-300/80 leading-relaxed print:text-amber-900">{CREDIT_PACK_DISCLAIMER}</p>
            <p className="mt-2 text-[9px] text-amber-400/50 print:text-amber-700">
              Pack ID: {pack.id} · Generated: {pack.generated_at ? new Date(pack.generated_at).toLocaleString("en-MY") : "—"} · Status: {pack.pack_status}
            </p>
          </div>

          {/* Bottom action bar (no-print) */}
          <div className="no-print flex items-center gap-3 justify-between pt-4 border-t border-slate-800">
            <Link href="/admin/credit-packs" className="text-xs text-slate-500 hover:text-slate-300 transition-colors">
              ← All Credit Packs
            </Link>
            <div className="flex items-center gap-2">
              <button type="button" onClick={handleCopyShareSummary}
                className="rounded-lg border border-slate-700 bg-slate-800 px-4 py-2 text-xs font-semibold text-slate-300 hover:bg-slate-700 transition-colors"
              >
                {copied ? "✓ Copied!" : "⎘ Copy Share Summary"}
              </button>
              <button type="button" onClick={() => window.print()}
                className="rounded-lg border border-blue-600/40 bg-blue-600/15 px-4 py-2 text-xs font-semibold text-blue-400 hover:bg-blue-600/25 transition-colors"
              >
                🖨 Print / Save as PDF
              </button>
            </div>
          </div>
        </main>
      </div>
    </>
  );
}

