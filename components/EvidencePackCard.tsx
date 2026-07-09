"use client";
// ─── Evidence Pack Card ────────────────────────────────────────────────────────
// Displays a full audit trail evidence pack for a job.
// Admin: full view (all 8 sections + timeline).
// Provider/Customer: scoped view relevant to their role.
//
// Usage:
//   <EvidencePackCard jobReference="NX-2025-001" role="admin" />

import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/lib/supabaseClient";
import {
  buildTimeline, buildEvidenceSummary, fmtEvidence, fmtEvidenceDate,
  SOURCE_COLOR, SOURCE_ICON, SOURCE_LABEL,
  EVIDENCE_AUDIT_ACTIONS,
  type EvidencePackData, type TimelineEvent, type TimelineSource,
} from "@/lib/evidencePack";
import { DEFAULT_REQUIRED_DOCUMENTS } from "@/lib/jobTermsSnapshot";
import { insertAuditLog } from "@/lib/auditLog";

// ── Props ─────────────────────────────────────────────────────────────────────

interface Props {
  jobReference: string;
  role:         "admin" | "service_provider" | "customer";
  actorId?:     string;
  actorName?:   string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const GOVERNANCE_COLOR: Record<string, string> = {
  "Draft":                        "text-slate-400",
  "Pending Checker Approval":     "text-amber-400",
  "Checker Approved":             "text-emerald-400",
  "Checker Rejected":             "text-red-400",
  "Ready for Finance Instruction": "text-blue-400",
  "Instructed":                   "text-cyan-400",
  "Completed":                    "text-emerald-300",
  "Cancelled":                    "text-slate-500",
};

function SectionHeader({ title, icon, count, open, onToggle }: {
  title: string; icon: string; count?: number; open: boolean; onToggle: () => void;
}) {
  return (
    <button
      onClick={onToggle}
      className="w-full flex items-center justify-between px-4 py-3 rounded-xl border border-slate-800 bg-slate-900/60 hover:bg-slate-900/80 transition-colors print:hidden"
    >
      <span className="flex items-center gap-2 text-sm font-semibold text-slate-200">
        <span>{icon}</span> {title}
        {count !== undefined && (
          <span className="rounded-full border border-slate-700 bg-slate-800 px-2 py-0.5 text-[10px] text-slate-500">
            {count}
          </span>
        )}
      </span>
      <span className="text-slate-600 text-xs">{open ? "▲" : "▼"}</span>
    </button>
  );
}

function BadgeStatus({ text, type }: { text: string; type?: "ok" | "warn" | "error" | "info" | "neutral" }) {
  const cls =
    type === "ok"      ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-400" :
    type === "warn"    ? "border-amber-500/30 bg-amber-500/10 text-amber-400" :
    type === "error"   ? "border-red-500/30 bg-red-500/10 text-red-400" :
    type === "info"    ? "border-blue-500/30 bg-blue-500/10 text-blue-400" :
                         "border-slate-700 bg-slate-800 text-slate-400";
  return (
    <span className={`rounded-full border px-2 py-0.5 text-[9px] font-medium ${cls}`}>
      {text}
    </span>
  );
}

function EvidRow({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-start justify-between gap-4 py-1.5 border-b border-slate-800/50 last:border-0">
      <span className="text-[11px] text-slate-500 shrink-0">{label}</span>
      <span className={`text-[11px] text-slate-300 text-right ${mono ? "font-mono" : ""}`}>{value}</span>
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────

export function EvidencePackCard({ jobReference, role, actorId, actorName }: Props) {
  const [data,        setData]        = useState<EvidencePackData | null>(null);
  const [timeline,    setTimeline]    = useState<TimelineEvent[]>([]);
  const [loading,     setLoading]     = useState(true);
  const [error,       setError]       = useState("");
  const [copyDone,    setCopyDone]    = useState(false);
  const [srcFilter,   setSrcFilter]   = useState<TimelineSource | "all">("all");

  // Collapsible sections
  const [open, setOpen] = useState<Record<string, boolean>>({
    terms:          true,
    summary:        true,
    timeline:       true,
    payment:        role === "admin" || role === "service_provider",
    delivery:       true,
    docs:           true,
    comms:          role === "admin",
    governance:     role === "admin" || role === "service_provider",
    disputes:          true,
    changeRequests:    true,
    serviceQuotation:  true,
    paymentTermsRec:   true,
    liabilityReview:   true,
    claimReserves:     true,
    netSettlement:     true,
  });

  function toggle(key: string) {
    setOpen((prev) => ({ ...prev, [key]: !prev[key] }));
  }

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token ?? "";
      const res = await fetch(`/api/evidence-pack/${encodeURIComponent(jobReference)}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        setError(json.error ?? "Failed to load evidence pack.");
        return;
      }
      const json = await res.json();
      const pack = json.data as EvidencePackData;
      setData(pack);
      setTimeline(buildTimeline(pack));
    } catch {
      setError("Network error loading evidence pack.");
    } finally {
      setLoading(false);
    }
  }, [jobReference]);

  useEffect(() => { void load(); }, [load]);

  // ── Export actions ───────────────────────────────────────────────────────────

  async function handlePrint() {
    if (!data) return;
    await logAction(EVIDENCE_AUDIT_ACTIONS.pack_exported, "PDF/Print export");
    window.print();
  }

  async function handleCopySummary() {
    if (!data) return;
    const summary = buildEvidenceSummary(data);
    await navigator.clipboard.writeText(summary).catch(() => { /* best-effort */ });
    await logAction(EVIDENCE_AUDIT_ACTIONS.summary_copied, "Summary copied to clipboard");
    setCopyDone(true);
    setTimeout(() => setCopyDone(false), 2500);
  }

  async function handleExportJson() {
    if (!data) return;
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a");
    a.href     = url;
    a.download = `evidence-pack-${jobReference}-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    await logAction(EVIDENCE_AUDIT_ACTIONS.pack_exported, "JSON export");
  }

  async function logAction(action: string, detail: string) {
    await insertAuditLog({
      job_reference: jobReference,
      actor_id:   actorId,
      actor_role: role,
      actor_name: actorName ?? "User",
      action,
      description: `${detail} for job ${jobReference}.`,
    }).catch(() => { /* silent */ });
  }

  // ── Render states ─────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-6">
        <div className="flex items-center gap-3">
          <span className="text-lg">📋</span>
          <div>
            <p className="text-sm font-semibold text-slate-300">Evidence Pack</p>
            <p className="text-[10px] text-slate-600 animate-pulse">Loading evidence…</p>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-xl border border-red-500/20 bg-red-950/10 p-5 text-sm text-red-400">
        {error}
        <button onClick={load} className="ml-3 text-[11px] underline hover:no-underline">Retry</button>
      </div>
    );
  }

  if (!data) return null;

  const j = data.job;
  const filteredTimeline = srcFilter === "all"
    ? timeline
    : timeline.filter((e) => e.source === srcFilter);

  const hp       = data.heldPayments[0];
  const dc       = data.deliveryConfirmations[0];
  const ri       = data.releaseInstructions[0];
  const st       = data.settlements[0];
  const dispute  = data.disputeCases[0];

  // ── Print-specific style ─────────────────────────────────────────────────

  const printStyle = `
    @media print {
      body { background: #fff !important; color: #111 !important; }
      .print\\:hidden { display: none !important; }
      .evidence-section { break-inside: avoid; }
      .evidence-pack-root { background: #fff !important; color: #111 !important; }
      .evidence-pack-root * { border-color: #ddd !important; background: transparent !important; color: #111 !important; }
      .evidence-pack-root .print-title { font-size: 14pt; font-weight: bold; margin-bottom: 4px; }
      .evidence-pack-root .print-sub { font-size: 9pt; color: #555 !important; margin-bottom: 12px; }
    }
  `;

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: printStyle }} />
      <div className="evidence-pack-root space-y-4">

        {/* ── Header ── */}
        <div className="rounded-xl border border-slate-800 bg-slate-900/60 px-5 py-4 flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-lg">📋</span>
              <h2 className="text-sm font-bold text-slate-100">Audit Trail Evidence Pack</h2>
              <BadgeStatus text="Pilot" type="warn" />
            </div>
            <p className="text-[10px] text-slate-600">
              Generated {fmtEvidenceDate(data.generatedAt)} · {data.viewerRole} view · {timeline.length} timeline events
            </p>
          </div>

          {/* Export controls */}
          <div className="flex items-center gap-2 shrink-0 print:hidden">
            <button
              onClick={handleCopySummary}
              className="rounded-lg border border-slate-700 bg-slate-800/60 px-3 py-1.5 text-[10px] text-slate-400 hover:text-slate-200 transition-colors"
            >
              {copyDone ? "✓ Copied" : "Copy Summary"}
            </button>
            <button
              onClick={handleExportJson}
              className="rounded-lg border border-slate-700 bg-slate-800/60 px-3 py-1.5 text-[10px] text-slate-400 hover:text-slate-200 transition-colors"
            >
              Export JSON
            </button>
            <button
              onClick={handlePrint}
              className="rounded-lg border border-blue-500/30 bg-blue-500/10 px-3 py-1.5 text-[10px] text-blue-300 hover:bg-blue-500/20 transition-colors"
            >
              🖨 Print / PDF
            </button>
          </div>
        </div>

        {/* Disclaimer */}
        <div className="rounded-xl border border-slate-800 bg-slate-900/30 px-5 py-3">
          <p className="text-[10px] text-slate-600 italic">
            This evidence pack is generated from Nexum SecureFlow records for operational reference
            and dispute review. It is not a legal determination unless reviewed and adopted under
            applicable agreement.
          </p>
        </div>

        {/* ── 1. Job Summary ── */}
        <div className="evidence-section">
          <SectionHeader title="Job Summary" icon="🗂" open={open.summary} onToggle={() => toggle("summary")} />
          {/* Always visible for print */}
          <div className={`mt-2 rounded-xl border border-slate-800 bg-slate-900/40 px-5 py-4 ${!open.summary ? "hidden print:block" : ""}`}>
            <div className="print-title hidden print:block">Job Evidence Pack — {j.job_reference}</div>
            <div className="print-sub hidden print:block">Generated: {fmtEvidenceDate(data.generatedAt)}</div>
            <div className="grid grid-cols-2 gap-x-8 gap-y-0 sm:grid-cols-3">
              <EvidRow label="Reference"      value={j.job_reference} mono />
              <EvidRow label="Customer"       value={j.customer} />
              <EvidRow label="Provider"       value={j.service_provider} />
              <EvidRow label="Service Type"   value={j.service_type} />
              <EvidRow label="Route"          value={j.route} />
              <EvidRow label="Cargo"          value={j.cargo_description} />
              <EvidRow label="Job Value"      value={fmtEvidence(j.job_value, j.currency)} />
              <EvidRow label="Payment Terms"  value={j.payment_terms} />
              {j.required_deposit != null && (
                <EvidRow label="Required Deposit" value={fmtEvidence(j.required_deposit, j.currency)} />
              )}
              <EvidRow label="Job Status"     value={j.job_status} />
              <EvidRow label="Payment Status" value={j.payment_status} />
              <EvidRow label="Milestone"      value={j.current_milestone} />
              <EvidRow label="Risk Level"     value={j.risk_level} />
              <EvidRow label="Created"        value={fmtEvidenceDate(j.created_at)} />
              <EvidRow label="Last Updated"   value={fmtEvidenceDate(j.updated_at)} />
            </div>
          </div>
        </div>

        {/* ── 2. Agreed Terms Snapshot ── */}
        <div className="evidence-section">
          <SectionHeader
            title="Agreed Commercial Terms"
            icon="📋"
            open={open.terms}
            onToggle={() => toggle("terms")}
          />
          <div className={`mt-2 ${!open.terms ? "hidden print:block" : ""}`}>
            {!data.termsSnapshot ? (
              <div className="rounded-xl border border-slate-800 bg-slate-900/40 px-5 py-5 text-center">
                <p className="text-xs text-amber-400 font-medium">⚠ No terms snapshot</p>
                <p className="text-[10px] text-slate-600 mt-1">
                  Terms snapshot is created when the customer accepts the job.
                </p>
              </div>
            ) : (
              <div className="rounded-xl border border-emerald-500/20 bg-slate-900/40 px-5 py-4 space-y-4">
                {/* Acceptance record */}
                <div>
                  <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-slate-600">Acceptance Record</p>
                  <EvidRow label="Accepted At"       value={fmtEvidenceDate(data.termsSnapshot.accepted_at)} />
                  <EvidRow label="Terms Version"     value={data.termsSnapshot.terms_version} />
                  <EvidRow label="Snapshot Version"  value={`v${data.termsSnapshot.version_number}`} />
                  {data.termsSnapshot.amendment_reason && (
                    <EvidRow label="Amendment Reason" value={data.termsSnapshot.amendment_reason} />
                  )}
                  {data.termsSnapshot.amended_at && (
                    <EvidRow label="Amended At" value={fmtEvidenceDate(data.termsSnapshot.amended_at)} />
                  )}
                </div>

                {/* Payment terms */}
                <div>
                  <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-slate-600">Payment Terms (Frozen)</p>
                  <EvidRow label="Payment Terms"    value={data.termsSnapshot.payment_terms ?? "—"} />
                  {data.termsSnapshot.required_deposit != null && (
                    <EvidRow label="Required Deposit" value={fmtEvidence(data.termsSnapshot.required_deposit, data.termsSnapshot.currency ?? "")} />
                  )}
                  {data.termsSnapshot.balance_terms && (
                    <EvidRow label="Balance Terms" value={data.termsSnapshot.balance_terms} />
                  )}
                </div>

                {/* Rules */}
                <div>
                  <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-slate-600">Operational Rules</p>
                  <EvidRow label="Delivery Confirmation Window" value={`${data.termsSnapshot.delivery_confirmation_window_hours} working hours`} />
                  <div className="mt-2 space-y-2">
                    <div className="rounded-lg border border-slate-800 bg-slate-900/40 px-3 py-2">
                      <p className="text-[9px] font-semibold text-slate-600 mb-1">Release Condition</p>
                      <p className="text-[10px] text-slate-400 leading-relaxed">{data.termsSnapshot.release_condition ?? "—"}</p>
                    </div>
                    <div className="rounded-lg border border-slate-800 bg-slate-900/40 px-3 py-2">
                      <p className="text-[9px] font-semibold text-slate-600 mb-1">Dispute Condition</p>
                      <p className="text-[10px] text-slate-400 leading-relaxed">{data.termsSnapshot.dispute_condition ?? "—"}</p>
                    </div>
                  </div>
                </div>

                {/* Required docs */}
                <div>
                  <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-slate-600">Required Documents</p>
                  <div className="flex flex-wrap gap-1.5">
                    {(data.termsSnapshot.required_documents ?? DEFAULT_REQUIRED_DOCUMENTS).map((d) => (
                      <span key={d} className="rounded-full border border-slate-700 bg-slate-800 px-2.5 py-0.5 text-[9px] text-slate-300">
                        📄 {d}
                      </span>
                    ))}
                  </div>
                </div>

                {/* Pilot disclaimer */}
                <div className="rounded-lg border border-amber-500/20 bg-amber-950/10 px-3 py-2">
                  <p className="text-[9px] font-semibold text-amber-400 mb-1">Pilot Disclaimer</p>
                  <p className="text-[9px] text-slate-500 leading-relaxed">{data.termsSnapshot.pilot_disclaimer ?? "—"}</p>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* ── 3. Timeline ── */}
        <div className="evidence-section">
          <SectionHeader
            title="Event Timeline"
            icon="⏱"
            count={filteredTimeline.length}
            open={open.timeline}
            onToggle={() => toggle("timeline")}
          />
          <div className={`mt-2 ${!open.timeline ? "hidden print:block" : ""}`}>
            {/* Source filter */}
            <div className="mb-3 flex flex-wrap gap-1.5 print:hidden">
              {(["all", "audit_log", "payment_ledger", "delivery", "dispute", "communication", "release", "settlement", "document", "notification"] as const).map((s) => {
                const count = s === "all" ? timeline.length : timeline.filter((e) => e.source === s).length;
                if (count === 0 && s !== "all") return null;
                return (
                  <button
                    key={s}
                    onClick={() => setSrcFilter(s)}
                    className={`rounded-full border px-2.5 py-1 text-[10px] transition-colors ${
                      srcFilter === s
                        ? "border-slate-500 bg-slate-700 text-slate-200"
                        : "border-slate-800 bg-slate-900/40 text-slate-500 hover:text-slate-300"
                    }`}
                  >
                    {s === "all" ? `All (${count})` : `${SOURCE_ICON[s as TimelineSource]} ${SOURCE_LABEL[s as TimelineSource]} (${count})`}
                  </button>
                );
              })}
            </div>

            {filteredTimeline.length === 0 ? (
              <div className="rounded-xl border border-slate-800 bg-slate-900/40 px-5 py-6 text-center text-xs text-slate-600">
                No events recorded yet for this source.
              </div>
            ) : (
              <div className="rounded-xl border border-slate-800 bg-slate-900/40 overflow-hidden">
                <ol className="divide-y divide-slate-800/50 max-h-96 overflow-y-auto print:max-h-none">
                  {filteredTimeline.map((ev) => (
                    <li key={ev.id} className="flex items-start gap-3 px-4 py-3">
                      <span className="mt-0.5 text-sm shrink-0">{ev.icon}</span>
                      <span className="mt-0.5 font-mono text-[10px] text-slate-600 shrink-0 whitespace-nowrap w-32">
                        {ev.timestamp.slice(0, 16).replace("T", " ")}
                      </span>
                      <span className={`mt-0.5 shrink-0 text-[9px] font-semibold uppercase tracking-wide ${ev.color}`}>
                        {SOURCE_LABEL[ev.source]}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="text-[11px] font-medium text-slate-300 capitalize">{ev.title}</p>
                        {ev.detail && <p className="text-[10px] text-slate-600 mt-0.5 line-clamp-2">{ev.detail}</p>}
                      </div>
                      {ev.actorRole && (
                        <span className="shrink-0 text-[9px] text-slate-700 capitalize">{ev.actorRole}</span>
                      )}
                    </li>
                  ))}
                </ol>
              </div>
            )}
          </div>
        </div>

        {/* ── 4. Payment Evidence ── */}
        {(role === "admin" || role === "service_provider") && (
          <div className="evidence-section">
            <SectionHeader
              title="Payment Evidence"
              icon="💳"
              count={data.heldPayments.length + data.obligations.length + data.ledgerEvents.length}
              open={open.payment}
              onToggle={() => toggle("payment")}
            />
            <div className={`mt-2 space-y-3 ${!open.payment ? "hidden print:block" : ""}`}>

              {/* Obligations */}
              {data.obligations.length > 0 && (
                <div className="rounded-xl border border-slate-800 bg-slate-900/40 px-5 py-4">
                  <p className="mb-3 text-[11px] font-semibold text-slate-400">Payment Obligations ({data.obligations.length})</p>
                  <div className="overflow-x-auto">
                    <table className="w-full text-[11px]">
                      <thead>
                        <tr className="text-left text-slate-600">
                          <th className="pb-2 font-medium">Type</th>
                          <th className="pb-2 font-medium">Amount</th>
                          <th className="pb-2 font-medium">Due</th>
                          <th className="pb-2 font-medium">Status</th>
                          <th className="pb-2 font-medium">Verified</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800/50">
                        {data.obligations.map((ob) => (
                          <tr key={ob.id}>
                            <td className="py-2 text-slate-300">{ob.obligation_type}</td>
                            <td className="py-2 font-mono text-slate-300">{fmtEvidence(ob.amount, ob.currency)}</td>
                            <td className="py-2 text-slate-500">{ob.due_date ?? "—"}</td>
                            <td className="py-2">
                              <BadgeStatus
                                text={ob.status}
                                type={ob.status === "Verified" ? "ok" : ob.status === "Overdue" ? "error" : ob.status === "Disputed" ? "error" : "neutral"}
                              />
                            </td>
                            <td className="py-2 text-slate-500">{ob.verified_at ? ob.verified_at.slice(0, 10) : "—"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Held payment record */}
              {hp && (
                <div className="rounded-xl border border-slate-800 bg-slate-900/40 px-5 py-4">
                  <p className="mb-3 text-[11px] font-semibold text-slate-400">Held Payment Record</p>
                  <div className="grid grid-cols-2 gap-x-8 gap-y-0">
                    <EvidRow label="Amount"          value={fmtEvidence(hp.amount, hp.currency)} />
                    <EvidRow label="Holding Status"  value={hp.holding_status} />
                    <EvidRow label="Proof Document"  value={hp.proof_document_id ? "Attached" : "—"} />
                    <EvidRow label="Bank Reference"  value={hp.bank_reference ?? "—"} mono />
                    <EvidRow label="Payment Secured" value={fmtEvidenceDate(hp.payment_secured_at)} />
                    <EvidRow label="Release Eligible" value={fmtEvidenceDate(hp.release_eligible_at)} />
                    <EvidRow label="Release Approved" value={fmtEvidenceDate(hp.release_approved_at)} />
                    <EvidRow label="Released At"     value={fmtEvidenceDate(hp.released_at)} />
                  </div>
                </div>
              )}

              {/* Ledger events */}
              {data.ledgerEvents.length > 0 && (
                <div className="rounded-xl border border-slate-800 bg-slate-900/40 px-5 py-4">
                  <p className="mb-3 text-[11px] font-semibold text-slate-400">Ledger Events ({data.ledgerEvents.length})</p>
                  <ol className="space-y-2 max-h-48 overflow-y-auto print:max-h-none">
                    {data.ledgerEvents.map((le) => (
                      <li key={le.id} className="flex items-start gap-3 text-[11px]">
                        <span className="font-mono text-slate-600 shrink-0 whitespace-nowrap">{le.created_at.slice(0, 16).replace("T", " ")}</span>
                        <span className="text-emerald-400 shrink-0">{le.event_type ?? "Event"}</span>
                        <span className="text-slate-400">{le.event_description ?? (le.amount ? `${le.currency} ${le.amount}` : "")}</span>
                      </li>
                    ))}
                  </ol>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── 5. Delivery Evidence ── */}
        <div className="evidence-section">
          <SectionHeader
            title="Delivery Evidence"
            icon="📦"
            count={data.deliveryConfirmations.length}
            open={open.delivery}
            onToggle={() => toggle("delivery")}
          />
          <div className={`mt-2 ${!open.delivery ? "hidden print:block" : ""}`}>
            {data.deliveryConfirmations.length === 0 ? (
              <div className="rounded-xl border border-slate-800 bg-slate-900/40 px-5 py-5 text-center text-xs text-slate-600">
                No delivery confirmation records.
              </div>
            ) : (
              data.deliveryConfirmations.map((dc2) => (
                <div key={dc2.id} className="rounded-xl border border-slate-800 bg-slate-900/40 px-5 py-4">
                  <div className="mb-2 flex items-center gap-2">
                    <BadgeStatus
                      text={dc2.status}
                      type={dc2.status === "Confirmed" || dc2.status === "Auto Confirmed" ? "ok" : dc2.status === "Disputed" ? "error" : "warn"}
                    />
                    {dc2.pod_document_id && <BadgeStatus text="POD Attached" type="info" />}
                  </div>
                  <div className="grid grid-cols-2 gap-x-8">
                    <EvidRow label="Status"           value={dc2.status} />
                    <EvidRow label="Requested"        value={fmtEvidenceDate(dc2.requested_at)} />
                    <EvidRow label="Due"              value={fmtEvidenceDate(dc2.due_at)} />
                    <EvidRow label="Responded At"     value={fmtEvidenceDate(dc2.responded_at)} />
                    <EvidRow label="Auto-confirmed At" value={fmtEvidenceDate(dc2.auto_confirmed_at)} />
                    {dc2.response_note && <EvidRow label="Response Note" value={dc2.response_note} />}
                    {dc2.dispute_reason && <EvidRow label="Dispute Reason" value={dc2.dispute_reason} />}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* ── 6. Document Evidence ── */}
        <div className="evidence-section">
          <SectionHeader
            title="Document Evidence"
            icon="📄"
            count={data.documents.length}
            open={open.docs}
            onToggle={() => toggle("docs")}
          />
          <div className={`mt-2 ${!open.docs ? "hidden print:block" : ""}`}>
            {data.documents.length === 0 ? (
              <div className="rounded-xl border border-slate-800 bg-slate-900/40 px-5 py-5 text-center text-xs text-slate-600">
                No documents uploaded.
              </div>
            ) : (
              <div className="rounded-xl border border-slate-800 overflow-hidden">
                <table className="w-full text-[11px]">
                  <thead>
                    <tr className="border-b border-slate-800 bg-slate-900/80">
                      <th className="px-4 py-2.5 text-left font-medium text-slate-500">Type</th>
                      <th className="px-4 py-2.5 text-left font-medium text-slate-500">File</th>
                      <th className="px-4 py-2.5 text-left font-medium text-slate-500">Uploaded By</th>
                      <th className="px-4 py-2.5 text-left font-medium text-slate-500">Extracted</th>
                      <th className="px-4 py-2.5 text-left font-medium text-slate-500">Verified</th>
                      <th className="px-4 py-2.5 text-left font-medium text-slate-500">Confidence</th>
                      <th className="px-4 py-2.5 text-left font-medium text-slate-500">Date</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.documents.map((d, i) => (
                      <tr key={d.id} className={`border-b border-slate-800/50 ${i % 2 === 0 ? "bg-slate-900/20" : ""}`}>
                        <td className="px-4 py-2.5 text-slate-300">{d.document_type}</td>
                        <td className="px-4 py-2.5 text-slate-400 font-mono text-[10px] max-w-[180px] truncate" title={d.file_name}>{d.file_name}</td>
                        <td className="px-4 py-2.5 text-slate-500 capitalize">{d.uploaded_by_role}</td>
                        <td className="px-4 py-2.5">
                          <BadgeStatus text={d.extracted ? "Yes" : "No"} type={d.extracted ? "info" : "neutral"} />
                        </td>
                        <td className="px-4 py-2.5">
                          <BadgeStatus text={d.verified ? "Verified" : "—"} type={d.verified ? "ok" : "neutral"} />
                        </td>
                        <td className="px-4 py-2.5 text-slate-500">
                          {d.confidence_score != null ? `${d.confidence_score}%` : "—"}
                        </td>
                        <td className="px-4 py-2.5 text-slate-600">{d.created_at.slice(0, 10)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

        {/* ── 7. Communication Evidence ── */}
        {(role === "admin") && (
          <div className="evidence-section">
            <SectionHeader
              title="Communication Evidence"
              icon="✉"
              count={data.communications.length + data.notifications.length}
              open={open.comms}
              onToggle={() => toggle("comms")}
            />
            <div className={`mt-2 space-y-3 ${!open.comms ? "hidden print:block" : ""}`}>
              {/* Notifications */}
              {data.notifications.length > 0 && (
                <div className="rounded-xl border border-slate-800 bg-slate-900/40 px-5 py-4">
                  <p className="mb-3 text-[11px] font-semibold text-slate-400">Notifications ({data.notifications.length})</p>
                  <ol className="space-y-2 max-h-48 overflow-y-auto print:max-h-none">
                    {data.notifications.map((n) => (
                      <li key={n.id} className="flex items-start gap-3 text-[11px]">
                        <span className="font-mono text-slate-600 shrink-0 whitespace-nowrap">{n.created_at.slice(0, 16).replace("T", " ")}</span>
                        <span className={`shrink-0 ${n.priority === "Critical" ? "text-red-400" : n.priority === "High" ? "text-amber-400" : "text-slate-400"}`}>
                          🔔 {n.priority}
                        </span>
                        <span className="text-slate-300">{n.title}</span>
                        <span className="ml-auto text-slate-600 shrink-0 capitalize">{n.recipient_role} · {n.delivery_channel}</span>
                      </li>
                    ))}
                  </ol>
                </div>
              )}

              {/* Communications */}
              {data.communications.length > 0 && (
                <div className="rounded-xl border border-slate-800 bg-slate-900/40 px-5 py-4">
                  <p className="mb-3 text-[11px] font-semibold text-slate-400">Communications ({data.communications.length})</p>
                  <ol className="space-y-2 max-h-48 overflow-y-auto print:max-h-none">
                    {data.communications.map((c) => (
                      <li key={c.id} className="flex items-start gap-3 text-[11px]">
                        <span className="font-mono text-slate-600 shrink-0 whitespace-nowrap">{(c.sent_at ?? c.created_at).slice(0, 16).replace("T", " ")}</span>
                        <span className="text-cyan-400 shrink-0">✉ {c.channel}</span>
                        <span className="text-slate-400">{c.subject ?? `To: ${c.recipient_role ?? "—"}`}</span>
                        <BadgeStatus text={c.status} type={c.status === "Sent" || c.status === "Simulated" ? "ok" : c.status === "Failed" ? "error" : "neutral"} />
                      </li>
                    ))}
                  </ol>
                </div>
              )}

              {data.notifications.length === 0 && data.communications.length === 0 && (
                <div className="rounded-xl border border-slate-800 bg-slate-900/40 px-5 py-5 text-center text-xs text-slate-600">
                  No communications recorded.
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── 8. Governance Evidence ── */}
        {(role === "admin" || role === "service_provider") && (
          <div className="evidence-section">
            <SectionHeader
              title="Governance Evidence"
              icon="⚖"
              count={data.releaseInstructions.length + data.settlements.length}
              open={open.governance}
              onToggle={() => toggle("governance")}
            />
            <div className={`mt-2 space-y-3 ${!open.governance ? "hidden print:block" : ""}`}>
              {/* Release instructions */}
              {data.releaseInstructions.length === 0 && data.settlements.length === 0 ? (
                <div className="rounded-xl border border-slate-800 bg-slate-900/40 px-5 py-5 text-center text-xs text-slate-600">
                  No governance records.
                </div>
              ) : (
                <>
                  {data.releaseInstructions.map((r) => (
                    <div key={r.id} className="rounded-xl border border-slate-800 bg-slate-900/40 px-5 py-4">
                      <div className="mb-2 flex items-center gap-2">
                        <p className="text-[11px] font-semibold text-slate-400">{r.release_type}</p>
                        <span className={`text-[10px] font-medium ${GOVERNANCE_COLOR[r.governance_status] ?? "text-slate-400"}`}>
                          {r.governance_status}
                        </span>
                      </div>
                      <div className="grid grid-cols-2 gap-x-8">
                        <EvidRow label="Amount"      value={fmtEvidence(r.amount, r.currency)} />
                        <EvidRow label="Maker"       value={r.created_by ?? "—"} />
                        <EvidRow label="Checker"     value={r.checked_by ?? "—"} />
                        <EvidRow label="Checked At"  value={fmtEvidenceDate(r.checked_at)} />
                        <EvidRow label="Approved By" value={r.approved_by ?? "—"} />
                        <EvidRow label="Approved At" value={fmtEvidenceDate(r.approved_at)} />
                        <EvidRow label="Instructed By" value={r.instructed_by ?? "—"} />
                        <EvidRow label="Instructed"  value={fmtEvidenceDate(r.instructed_at)} />
                        <EvidRow label="Completed"   value={fmtEvidenceDate(r.completed_at)} />
                      </div>
                    </div>
                  ))}

                  {/* Settlement */}
                  {data.settlements.map((s) => (
                    <div key={s.id} className="rounded-xl border border-slate-800 bg-slate-900/40 px-5 py-4">
                      <div className="mb-2 flex items-center gap-2">
                        <p className="text-[11px] font-semibold text-slate-400">Settlement Reconciliation</p>
                        <BadgeStatus
                          text={s.settlement_status}
                          type={s.settlement_status === "Reconciled" ? "ok" : s.settlement_status === "Failed" || s.settlement_status === "Amount Mismatch" || s.settlement_status === "Reference Mismatch" ? "error" : "neutral"}
                        />
                      </div>
                      <div className="grid grid-cols-2 gap-x-8">
                        <EvidRow label="Expected Amount" value={fmtEvidence(s.expected_release_amount, s.currency)} />
                        <EvidRow label="Actual Released" value={s.actual_released_amount ? fmtEvidence(s.actual_released_amount, s.currency) : "—"} />
                        <EvidRow label="Payee"           value={s.payee_name ?? "—"} />
                        <EvidRow label="Payee Bank"      value={s.payee_bank_name ?? "—"} />
                        <EvidRow label="Release Ref"     value={s.release_reference ?? "—"} mono />
                        <EvidRow label="Bank Txn Ref"    value={s.bank_transaction_reference ?? "—"} mono />
                        <EvidRow label="Released At"     value={fmtEvidenceDate(s.released_at)} />
                        <EvidRow label="Reconciled At"   value={fmtEvidenceDate(s.reconciled_at)} />
                        {s.reconciliation_note && <EvidRow label="Note" value={s.reconciliation_note} />}
                      </div>
                    </div>
                  ))}
                </>
              )}
            </div>
          </div>
        )}

        {/* ── 9. Dispute Evidence ── */}
        {data.disputeCases.length > 0 && (
          <div className="evidence-section">
            <SectionHeader
              title="Dispute Evidence"
              icon="⚠"
              count={data.disputeCases.length}
              open={open.disputes}
              onToggle={() => toggle("disputes")}
            />
            <div className={`mt-2 space-y-3 ${!open.disputes ? "hidden print:block" : ""}`}>
              {data.disputeCases.map((d2) => (
                <div key={d2.id} className="rounded-xl border border-red-500/20 bg-red-950/10 px-5 py-4">
                  <div className="mb-2 flex items-center gap-2 flex-wrap">
                    <BadgeStatus text={d2.severity} type={d2.severity === "Critical" ? "error" : d2.severity === "High" ? "warn" : "neutral"} />
                    <BadgeStatus text={d2.status} type={d2.status === "Resolved" || d2.status === "Closed" ? "ok" : d2.status === "Open" ? "error" : "warn"} />
                    {d2.resolution_type && <BadgeStatus text={d2.resolution_type} type="info" />}
                  </div>
                  <div className="grid grid-cols-2 gap-x-8">
                    <EvidRow label="Type"       value={d2.dispute_type ?? "—"} />
                    <EvidRow label="Raised By"  value={d2.raised_by_role ?? "—"} />
                    <EvidRow label="Claim"      value={d2.claim_amount ? fmtEvidence(d2.claim_amount, d2.currency) : "—"} />
                    <EvidRow label="Raised"     value={fmtEvidenceDate(d2.created_at)} />
                    <EvidRow label="Resolved"   value={fmtEvidenceDate(d2.resolved_at)} />
                    {d2.dispute_reason && <EvidRow label="Reason" value={d2.dispute_reason} />}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── 10. Change Requests ── */}
        {(data.changeRequests ?? []).length > 0 && (
          <div className="evidence-section">
            <SectionHeader
              title="Change Requests"
              icon="🔄"
              count={(data.changeRequests ?? []).length}
              open={open.changeRequests}
              onToggle={() => toggle("changeRequests")}
            />
            <div className={`mt-2 space-y-3 ${!open.changeRequests ? "hidden print:block" : ""}`}>
              {(data.changeRequests ?? []).map((cr) => {
                const hasFinancial = cr.financial_impact_amount != null;
                return (
                  <div key={cr.id} className={`rounded-xl border px-5 py-4 ${
                    cr.status === "Applied"   ? "border-violet-500/20 bg-violet-950/10"
                    : cr.status === "Approved" ? "border-emerald-500/20 bg-emerald-950/10"
                    : cr.status === "Rejected" ? "border-red-500/20 bg-red-950/10"
                    : "border-slate-800 bg-slate-900/40"
                  }`}>
                    <div className="mb-2 flex items-center gap-2 flex-wrap">
                      <BadgeStatus
                        text={cr.status}
                        type={cr.status === "Applied" ? "ok" : cr.status === "Approved" ? "ok" : cr.status === "Rejected" ? "error" : "warn"}
                      />
                      <span className="text-[10px] font-medium text-slate-400">{cr.change_type}</span>
                      {hasFinancial && (
                        <span className="rounded border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-[9px] font-semibold text-amber-400">
                          {cr.currency} {Number(cr.financial_impact_amount).toLocaleString()}
                        </span>
                      )}
                    </div>
                    <div className="grid grid-cols-2 gap-x-8">
                      <EvidRow label="Requested By"    value={cr.requested_by_role ?? "—"} />
                      <EvidRow label="Approval Reqd"   value={cr.approval_required_from} />
                      <EvidRow label="Submitted"       value={fmtEvidenceDate(cr.created_at)} />
                      <EvidRow label="Applied At"      value={fmtEvidenceDate(cr.applied_at)} />
                      <EvidRow label="Admin Approved"  value={fmtEvidenceDate(cr.admin_approved_at)} />
                      <EvidRow label="Cust. Approved"  value={fmtEvidenceDate(cr.customer_approved_at)} />
                      <EvidRow label="Prov. Approved"  value={fmtEvidenceDate(cr.provider_approved_at)} />
                      {cr.change_reason && <EvidRow label="Reason" value={cr.change_reason} />}
                      {cr.rejection_reason && <EvidRow label="Rejection" value={cr.rejection_reason} />}
                      {cr.proposed_value && (
                        <EvidRow label="Proposed" value={
                          (cr.proposed_value as Record<string,unknown>).description as string
                          ?? JSON.stringify(cr.proposed_value)
                        } />
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ── 11. Service Quotation Origin ── */}
        {data.serviceQuotation && (
          <div className="evidence-section">
            <SectionHeader
              title="Commercial Quotation Origin"
              icon="📝"
              open={open.serviceQuotation ?? true}
              onToggle={() => toggle("serviceQuotation")}
            />
            <div className={`mt-2 space-y-3 ${!(open.serviceQuotation ?? true) ? "hidden print:block" : ""}`}>
              {(() => {
                const sq = data.serviceQuotation!;
                return (
                  <div className="rounded-xl border border-purple-500/20 bg-purple-950/10 px-5 py-4">
                    <div className="mb-3 flex items-center gap-2 flex-wrap">
                      <span className="text-xs font-mono font-semibold text-purple-300">{sq.quotation_reference}</span>
                      <span className="rounded border border-purple-500/30 bg-purple-500/10 px-2 py-0.5 text-[9px] font-semibold text-purple-400">
                        {sq.quotation_status}
                      </span>
                    </div>
                    <div className="grid grid-cols-2 gap-x-8">
                      <EvidRow label="Service Type"   value={sq.service_type ?? "—"} />
                      <EvidRow label="Route"          value={sq.route ?? "—"} />
                      <EvidRow label="Incoterm"       value={sq.incoterm ?? "—"} />
                      <EvidRow label="Currency"       value={sq.currency} />
                      <EvidRow label="Quoted Amount"  value={`${sq.currency} ${sq.quoted_amount.toLocaleString()}`} />
                      <EvidRow label="Deposit"        value={sq.required_deposit > 0 ? `${sq.currency} ${sq.required_deposit.toLocaleString()}` : "None"} />
                      {sq.balance_amount != null && (
                        <EvidRow label="Balance"      value={`${sq.currency} ${sq.balance_amount.toLocaleString()}`} />
                      )}
                      <EvidRow label="Payment Terms"  value={sq.payment_terms ?? "—"} />
                      <EvidRow label="Valid Until"    value={fmtEvidenceDate(sq.validity_until)} />
                      <EvidRow label="Sent At"        value={fmtEvidenceDate(sq.sent_at)} />
                      <EvidRow label="Viewed At"      value={fmtEvidenceDate(sq.viewed_at)} />
                      <EvidRow label="Accepted At"    value={fmtEvidenceDate(sq.accepted_at)} />
                      <EvidRow label="Converted At"   value={fmtEvidenceDate(sq.converted_at)} />
                      <EvidRow label="Delivery Confirmation Window" value={`${sq.delivery_confirmation_window_hours}h`} />
                    </div>
                    {sq.scope_of_service && (
                      <div className="mt-3 border-t border-slate-800/50 pt-3">
                        <p className="text-[9px] text-slate-500 mb-1">Scope of Service</p>
                        <p className="text-[10px] text-slate-400 whitespace-pre-wrap leading-relaxed">{sq.scope_of_service}</p>
                      </div>
                    )}
                    {sq.exclusions && (
                      <div className="mt-2">
                        <p className="text-[9px] text-slate-500 mb-1">Exclusions</p>
                        <p className="text-[10px] text-slate-400 whitespace-pre-wrap leading-relaxed">{sq.exclusions}</p>
                      </div>
                    )}
                    {sq.required_documents && sq.required_documents.length > 0 && (
                      <div className="mt-2">
                        <p className="text-[9px] text-slate-500 mb-1">Required Documents</p>
                        <ul className="space-y-0.5">
                          {sq.required_documents.map((d) => (
                            <li key={d} className="text-[10px] text-slate-400">✓ {d}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                );
              })()}
            </div>
          </div>
        )}

        {/* ── 12. Payment Terms Recommendation ── */}
        {data.paymentTermsRecommendation && (
          <div className="evidence-section">
            <SectionHeader
              title="Payment Terms Recommendation"
              icon="💰"
              open={open.paymentTermsRec ?? true}
              onToggle={() => toggle("paymentTermsRec")}
            />
            <div className={`mt-2 ${!(open.paymentTermsRec ?? true) ? "hidden print:block" : ""}`}>
              {(() => {
                const ptr = data.paymentTermsRecommendation!;
                const riskColor: Record<string, string> = {
                  Low: "text-emerald-400", Medium: "text-blue-400",
                  High: "text-amber-400",  Critical: "text-red-400",
                };
                return (
                  <div className="rounded-xl border border-blue-500/20 bg-blue-950/10 px-5 py-4 space-y-3">
                    <div className="flex flex-wrap items-center gap-3">
                      <span className="text-xs font-semibold text-slate-100 bg-slate-800 border border-slate-700 rounded-full px-3 py-1">
                        {ptr.recommendation_type}
                      </span>
                      <span className={`text-xs font-semibold ${riskColor[ptr.risk_level] ?? "text-slate-400"}`}>
                        {ptr.risk_level} Risk
                      </span>
                      {ptr.was_overridden && (
                        <span className="text-xs text-orange-400 border border-orange-500/30 rounded-full px-2 py-0.5">Overridden</span>
                      )}
                      {ptr.was_accepted && !ptr.was_overridden && (
                        <span className="text-xs text-emerald-400 border border-emerald-500/30 rounded-full px-2 py-0.5">Accepted</span>
                      )}
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                      {[
                        { label: "Deposit %", value: ptr.recommended_deposit_percentage != null ? `${ptr.recommended_deposit_percentage}%` : "—" },
                        { label: "Deposit Amount", value: ptr.recommended_deposit_amount != null ? `${ptr.currency} ${ptr.recommended_deposit_amount.toLocaleString()}` : "—" },
                        { label: "Balance Amount", value: ptr.recommended_balance_amount != null ? `${ptr.currency} ${ptr.recommended_balance_amount.toLocaleString()}` : "—" },
                        { label: "Confirm Window", value: ptr.recommended_delivery_confirmation_window_hours != null ? `${ptr.recommended_delivery_confirmation_window_hours}h` : "48h" },
                      ].map((s) => (
                        <div key={s.label}>
                          <p className="text-[9px] text-slate-500 mb-0.5">{s.label}</p>
                          <p className="text-[11px] font-semibold text-slate-200">{s.value}</p>
                        </div>
                      ))}
                    </div>

                    {ptr.recommended_release_condition && (
                      <div>
                        <p className="text-[9px] text-slate-500 mb-0.5">Release Condition</p>
                        <p className="text-[10px] text-slate-300 leading-relaxed">{ptr.recommended_release_condition}</p>
                      </div>
                    )}

                    {ptr.rationale && (
                      <div>
                        <p className="text-[9px] text-slate-500 mb-0.5">Rationale</p>
                        <p className="text-[10px] text-slate-400 leading-relaxed">{ptr.rationale}</p>
                      </div>
                    )}

                    {Array.isArray(ptr.key_risk_factors) && ptr.key_risk_factors.length > 0 && (
                      <div>
                        <p className="text-[9px] text-slate-500 mb-1">Key Risk Factors</p>
                        <ul className="space-y-0.5">
                          {ptr.key_risk_factors.map((f: string, i: number) => (
                            <li key={i} className="text-[10px] text-amber-400">• {f}</li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {ptr.was_overridden && ptr.override_reason && (
                      <div className="rounded-lg border border-orange-500/25 bg-orange-950/15 px-3 py-2">
                        <p className="text-[9px] text-orange-500 mb-0.5">Override Reason</p>
                        <p className="text-[10px] text-orange-300">{ptr.override_reason}</p>
                        {ptr.override_by_name && (
                          <p className="text-[9px] text-slate-500 mt-0.5">By: {ptr.override_by_name}</p>
                        )}
                      </div>
                    )}

                    <p className="text-[9px] text-slate-600">
                      Decision-support only. Nexum does not enforce payment terms or guarantee outcomes.
                      Generated {new Date(ptr.created_at).toLocaleDateString("en-MY")}.
                    </p>
                  </div>
                );
              })()}
            </div>
          </div>
        )}

        {/* ── 13. Liability Review ── */}
        {data.liabilityReview && (
          <div className="evidence-section">
            <SectionHeader
              title="Liability Review"
              icon="⚖"
              open={open.liabilityReview ?? true}
              onToggle={() => toggle("liabilityReview")}
            />
            <div className={`mt-2 ${!(open.liabilityReview ?? true) ? "hidden print:block" : ""}`}>
              {(() => {
                const lr = data.liabilityReview!;
                return (
                  <div className="rounded-xl border border-red-500/20 bg-red-500/5 p-4 space-y-3">
                    {/* Compliance header */}
                    <div className="rounded-lg border border-red-500/20 bg-red-950/20 px-3 py-2">
                      <p className="text-[9px] text-red-400/80">
                        Preliminary review for evidence collection purposes only. All positions are preliminary and require admin, legal, and insurance review. Nexum does not make legal liability determinations.
                      </p>
                    </div>

                    {/* Status + incident */}
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <p className="text-[9px] text-slate-500 mb-0.5">Review Status</p>
                        <p className="text-[10px] font-semibold text-red-300">{lr.liability_review_status}</p>
                      </div>
                      {lr.incident_type && (
                        <div>
                          <p className="text-[9px] text-slate-500 mb-0.5">Incident Type</p>
                          <p className="text-[10px] text-slate-300">{lr.incident_type}</p>
                        </div>
                      )}
                    </div>

                    {/* Financial */}
                    <div className="grid grid-cols-2 gap-3">
                      {lr.claimed_amount != null && (
                        <div>
                          <p className="text-[9px] text-slate-500 mb-0.5">Claimed Amount</p>
                          <p className="text-[10px] font-semibold text-slate-200">{lr.currency} {lr.claimed_amount.toLocaleString("en-MY", { minimumFractionDigits: 2 })}</p>
                        </div>
                      )}
                      {lr.cargo_value != null && (
                        <div>
                          <p className="text-[9px] text-slate-500 mb-0.5">Cargo Value</p>
                          <p className="text-[10px] text-slate-300">{lr.currency} {lr.cargo_value.toLocaleString("en-MY", { minimumFractionDigits: 2 })}</p>
                        </div>
                      )}
                    </div>

                    {/* Insurance */}
                    <div>
                      <p className="text-[9px] text-slate-500 mb-0.5">Insurance</p>
                      <p className="text-[10px] text-slate-300">
                        {lr.insurance_available === true ? "Available" : lr.insurance_available === false ? "Not Available" : "Unknown"}
                        {" · "}Claim Status: {lr.insurance_claim_status}
                      </p>
                    </div>

                    {/* Evidence summary */}
                    {lr.evidence_summary && (
                      <div>
                        <p className="text-[9px] text-slate-500 mb-0.5">Evidence Summary</p>
                        <p className="text-[10px] text-slate-400 leading-relaxed">{lr.evidence_summary}</p>
                      </div>
                    )}

                    {/* Preliminary position (admin only) */}
                    {lr.preliminary_position && (
                      <div className="rounded-lg border border-amber-500/20 bg-amber-950/15 px-3 py-2">
                        <p className="text-[9px] text-amber-500 mb-0.5">Preliminary Position (Admin Only — Confidential)</p>
                        <p className="text-[10px] text-amber-300">{lr.preliminary_position}</p>
                      </div>
                    )}

                    {/* Resolution note */}
                    {lr.resolution_note && (
                      <div>
                        <p className="text-[9px] text-slate-500 mb-0.5">Resolution Note</p>
                        <p className="text-[10px] text-slate-300 leading-relaxed">{lr.resolution_note}</p>
                      </div>
                    )}

                    {/* Uploaded evidence items */}
                    {data.liabilityEvidence && data.liabilityEvidence.length > 0 && (
                      <div>
                        <p className="text-[9px] text-slate-500 mb-1">Liability Evidence Items ({data.liabilityEvidence.length})</p>
                        <div className="space-y-1">
                          {data.liabilityEvidence.map((ev) => (
                            <div key={ev.id} className="flex items-center gap-2 text-[10px]">
                              <span className="text-slate-500">📎</span>
                              <span className="text-slate-300 font-medium">{ev.evidence_type ?? "Other"}</span>
                              <span className="text-slate-600">by {ev.uploaded_by_role ?? "—"}</span>
                              {ev.remarks && <span className="text-slate-500 truncate">· {ev.remarks}</span>}
                              <span className="ml-auto text-slate-700 tabular-nums">{ev.created_at.slice(0, 10)}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    <p className="text-[9px] text-slate-600">
                      Preliminary review — not a legal determination. Reviewed {lr.reviewed_at ? new Date(lr.reviewed_at).toLocaleDateString("en-MY") : "pending"}. Opened {new Date(lr.created_at).toLocaleDateString("en-MY")}.
                    </p>
                  </div>
                );
              })()}
            </div>
          </div>
        )}

        {/* ── 14. Claim Reserves ── */}
        {data.claimReserves && data.claimReserves.length > 0 && (
          <div className="evidence-section">
            <SectionHeader
              title={`Claim Reserves (${data.claimReserves.length})`}
              icon="🏦"
              open={open.claimReserves ?? true}
              onToggle={() => toggle("claimReserves")}
            />
            <div className={`mt-2 ${!(open.claimReserves ?? true) ? "hidden print:block" : ""}`}>
              <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-4 space-y-3">
                <div className="rounded-lg border border-amber-500/20 bg-amber-950/20 px-3 py-2">
                  <p className="text-[9px] text-amber-400/80">
                    Internal payment-control records only. No funds auto-deducted. All reserves require admin approval. Reserve recorded — not a legal determination or binding financial obligation.
                  </p>
                </div>
                {data.claimReserves.map((cr) => (
                  <div key={cr.id} className="border-b border-slate-800/60 pb-3 last:border-0 last:pb-0 space-y-2">
                    <div className="flex flex-wrap items-center gap-2 text-[10px]">
                      <span className={`rounded-full border px-2 py-0.5 font-medium ${
                        cr.reserve_status === "Active" ? "border-amber-500/30 bg-amber-500/10 text-amber-400" :
                        cr.reserve_status === "Applied" ? "border-purple-500/30 bg-purple-500/10 text-purple-400" :
                        cr.reserve_status === "Released" ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-400" :
                        "border-slate-700 bg-slate-800/50 text-slate-400"
                      }`}>
                        {cr.reserve_status}
                      </span>
                      <span className="text-slate-300 font-medium">{cr.reserve_type ?? "Other"}</span>
                      <span className="font-semibold text-slate-100 tabular-nums">
                        {cr.currency} {cr.reserve_amount.toLocaleString("en-MY", { minimumFractionDigits: 2 })}
                      </span>
                      <span className="ml-auto text-slate-600">{cr.created_at.slice(0, 10)}</span>
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-[10px]">
                      {cr.reason && (
                        <div className="col-span-2">
                          <p className="text-slate-500 mb-0.5">Basis</p>
                          <p className="text-slate-300 leading-relaxed">{cr.reason}</p>
                        </div>
                      )}
                      {cr.approved_at && (
                        <div>
                          <p className="text-slate-500 mb-0.5">Approved</p>
                          <p className="text-slate-400">{cr.approved_at.slice(0, 10)}</p>
                        </div>
                      )}
                      {cr.applied_amount != null && (
                        <div>
                          <p className="text-slate-500 mb-0.5">Applied Amount</p>
                          <p className="font-semibold text-purple-400">{cr.currency} {cr.applied_amount.toLocaleString("en-MY", { minimumFractionDigits: 2 })}</p>
                        </div>
                      )}
                      {cr.released_amount != null && (
                        <div>
                          <p className="text-slate-500 mb-0.5">Released Amount</p>
                          <p className="font-semibold text-emerald-400">{cr.currency} {cr.released_amount.toLocaleString("en-MY", { minimumFractionDigits: 2 })}</p>
                        </div>
                      )}
                      {cr.resolution_note && (
                        <div className="col-span-2">
                          <p className="text-slate-500 mb-0.5">Resolution Note</p>
                          <p className="text-slate-300 leading-relaxed">{cr.resolution_note}</p>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
                <p className="text-[9px] text-slate-600">
                  Reserve recorded — no funds auto-deducted. Release subject to review. Not a legal determination or binding financial obligation.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* ── Section 15: Net Settlement Statement ── */}
        {data.netSettlement && (
          <div className="evidence-section">
            <SectionHeader
              title="Net Settlement Statement"
              icon="≡"
              open={open.netSettlement ?? true}
              onToggle={() => toggle("netSettlement")}
            />
            <div className={`mt-2 ${!(open.netSettlement ?? true) ? "hidden print:block" : ""}`}>
              <div className="rounded-xl border border-cyan-500/20 bg-cyan-500/5 p-4 space-y-3">
                {(() => {
                  const ns = data.netSettlement!;
                  const cur = ns.currency;
                  const fmt = (n: number) => `${cur} ${n.toLocaleString("en-MY", { minimumFractionDigits: 2 })}`;
                  const statusColor = ns.statement_status === "Finalized" ? "text-emerald-300"
                    : ns.statement_status === "Approved" ? "text-emerald-400"
                    : ns.statement_status === "Disputed" ? "text-red-400"
                    : "text-cyan-400";
                  return (
                    <>
                      <div className="flex flex-wrap items-center gap-2 text-[10px]">
                        <span className={`font-semibold ${statusColor}`}>{ns.statement_status}</span>
                        <span className="text-slate-500">Net Settlement Statement</span>
                        <span className="ml-auto text-slate-600">{ns.generated_at?.slice(0, 10) ?? ns.created_at.slice(0, 10)}</span>
                      </div>
                      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 text-[10px]">
                        {[
                          { label: "Gross Job Value",       value: fmt(ns.gross_job_value),         color: "text-slate-200" },
                          { label: "Verified Payments",      value: fmt(ns.total_verified_payments),  color: "text-emerald-400" },
                          { label: "Additional Charges",     value: fmt(ns.total_additional_charges), color: "text-amber-400" },
                          { label: "Active Reserves",        value: fmt(ns.total_claim_reserves),     color: "text-red-400" },
                          { label: "Claims Applied",         value: fmt(ns.total_claim_applied),      color: "text-orange-400" },
                          { label: "Total Released",         value: fmt(ns.total_released),           color: "text-blue-400" },
                        ].map(({ label, value, color }) => (
                          <div key={label}>
                            <p className="text-slate-600 mb-0.5">{label}</p>
                            <p className={`font-semibold tabular-nums ${color}`}>{value}</p>
                          </div>
                        ))}
                      </div>
                      <div className="rounded-lg border border-cyan-500/30 bg-cyan-950/30 px-3 py-2.5">
                        <p className="text-[10px] text-cyan-500/70 uppercase tracking-wider mb-1">Net Release Eligible (Statement Reference)</p>
                        <p className="text-sm font-bold text-cyan-300 tabular-nums">{fmt(ns.net_release_eligible)}</p>
                        {ns.outstanding_amount > 0 && (
                          <p className="mt-1 text-[10px] text-amber-400">Outstanding: {fmt(ns.outstanding_amount)}</p>
                        )}
                      </div>
                      {ns.statement_status === "Disputed" && (
                        <div className="rounded-lg border border-red-500/30 bg-red-950/20 px-3 py-2">
                          <p className="text-[10px] text-red-400">⛔ Settlement Disputed — Release Blocked. Admin resolution required before release can proceed.</p>
                        </div>
                      )}
                      <div className="text-[10px] text-slate-600 space-y-0.5">
                        {ns.approved_at  && <p>Approved:  {ns.approved_at.slice(0, 10)}</p>}
                        {ns.finalized_at && <p>Finalized: {ns.finalized_at.slice(0, 10)}</p>}
                      </div>
                      <p className="text-[9px] text-slate-600">
                        Net settlement statement for operational reference only. Release eligible amount is subject to admin approval. Not a legal settlement or final financial determination.
                      </p>
                    </>
                  );
                })()}
              </div>
            </div>
          </div>
        )}

        {/* ── Footer / disclaimer ── */}
        <div className="rounded-xl border border-slate-800 bg-slate-900/30 px-5 py-4">
          <p className="text-[10px] text-slate-700">
            Evidence pack generated for <span className="text-slate-600 capitalize">{data.viewerRole.replace("_", " ")}</span> view ·{" "}
            {fmtEvidenceDate(data.generatedAt)} ·{" "}
            {timeline.length} total events · Job: {j.job_reference}
          </p>
        </div>
      </div>
    </>
  );
}
