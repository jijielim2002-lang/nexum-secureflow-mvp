"use client";
import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useAuth } from "@/contexts/AuthContext";
import { AuthGuard } from "@/components/AuthGuard";
import { LogoutButton } from "@/components/LogoutButton";
import { NotificationBell } from "@/components/NotificationBell";
import { supabase } from "@/lib/supabaseClient";
import {
  COMPLIANCE_STATUS_BADGE,
  COMPLIANCE_STATUS_ICON,
  type PaymentComplianceCheck,
  type PaymentPartnerSetup,
  type ComplianceStatus,
} from "@/lib/paymentCompliance";

const STATUS_TABS: { label: string; value: string }[] = [
  { label: "All",                  value: "" },
  { label: "Not Checked",          value: "Not Checked" },
  { label: "Requires Review",      value: "Requires Review" },
  { label: "Blocked",              value: "Blocked" },
  { label: "Compliant for Pilot",  value: "Compliant for Pilot" },
  { label: "Approved",             value: "Approved" },
];

function MetricCard({ label, value, color = "text-slate-200", highlight = false, sub }: {
  label: string; value: string | number; color?: string; highlight?: boolean; sub?: string;
}) {
  return (
    <div className={`rounded-xl border px-4 py-3 ${highlight ? "border-amber-500/30 bg-amber-500/5" : "border-slate-800 bg-slate-900/60"}`}>
      <p className={`text-2xl font-bold tabular-nums ${color}`}>{value}</p>
      <p className="mt-0.5 text-[10px] text-slate-500">{label}</p>
      {sub && <p className="text-[9px] text-slate-700">{sub}</p>}
    </div>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h2 className="text-[11px] font-semibold uppercase tracking-widest text-slate-500">{children}</h2>;
}

function Badge({ label, cls }: { label: string; cls: string }) {
  return <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium ${cls}`}>{label}</span>;
}

export default function PaymentCompliancePage() {
  return <AuthGuard requiredRole="admin"><Inner /></AuthGuard>;
}

function Inner() {
  const { profile } = useAuth();

  const [checks,   setChecks]   = useState<PaymentComplianceCheck[]>([]);
  const [partners, setPartners] = useState<PaymentPartnerSetup[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [tab,      setTab]      = useState("");
  const [busy,     setBusy]     = useState<string | null>(null);
  const [toast,    setToast]    = useState<string | null>(null);

  const partnerMap = new Map(partners.map((p) => [p.id, p]));

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(null), 4000); };

  const load = useCallback(async () => {
    setLoading(true);
    const [cr, pr] = await Promise.all([
      supabase.from("payment_compliance_checks").select("*").order("created_at", { ascending: false }).limit(500),
      supabase.from("payment_partner_setups").select("id, partner_name, holding_model, status").order("status"),
    ]);
    setChecks((cr.data ?? []) as PaymentComplianceCheck[]);
    setPartners((pr.data ?? []) as PaymentPartnerSetup[]);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  // Derived metrics
  const blocked        = checks.filter((c) => c.check_status === "Blocked");
  const reqReview      = checks.filter((c) => c.check_status === "Requires Review");
  const notChecked     = checks.filter((c) => c.check_status === "Not Checked");
  const legalRequired  = checks.filter((c) => c.legal_review_required && c.check_status !== "Approved");
  const missingDisc    = checks.filter((c) => !c.customer_disclaimer_shown || !c.provider_disclaimer_shown);

  const filtered = tab ? checks.filter((c) => c.check_status === tab) : checks;

  async function quickAction(checkId: string, action: string) {
    setBusy(checkId);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token ?? "";
      const res = await fetch(`/api/payment-compliance/${checkId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ action, actorName: profile?.full_name ?? "Nexum Admin" }),
      });
      const json = await res.json();
      if (!res.ok) { showToast(`Error: ${json.error}`); return; }
      showToast("Check updated.");
      load();
    } finally { setBusy(null); }
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-200">
      {toast && (
        <div className="fixed bottom-4 right-4 z-50 rounded-xl border border-emerald-500/30 bg-emerald-900/80 px-4 py-2.5 text-xs text-emerald-300 shadow-lg">{toast}</div>
      )}

      <header className="sticky top-0 z-40 flex items-center justify-between border-b border-slate-800 bg-slate-950/90 px-6 py-3 backdrop-blur">
        <div className="flex items-center gap-4">
          <Link href="/admin" className="text-xs text-slate-500 hover:text-slate-300 transition-colors">← Admin</Link>
          <span className="text-slate-800">|</span>
          <h1 className="text-sm font-semibold tracking-tight text-slate-100">Payment Compliance Overview</h1>
        </div>
        <div className="flex items-center gap-3"><NotificationBell /><LogoutButton /></div>
      </header>

      {/* Compliance banner */}
      <div className="border-b border-slate-800 bg-amber-950/10 px-6 py-2.5">
        <p className="text-[10px] text-amber-400/70">
          <span className="font-semibold text-amber-400">Pilot Mode</span>
          {" — "}
          This pilot records payment holding and release workflow status. Actual fund holding, transfer, or escrow service must be performed through approved bank, licensed partner, or designated legal arrangement.
        </p>
      </div>

      <main className="mx-auto max-w-6xl px-6 py-8">
        {/* ── Metrics ──────────────────────────────────────────────────────────── */}
        <div className="mb-8 grid grid-cols-2 gap-3 sm:grid-cols-5">
          <MetricCard label="Total Checks"      value={checks.length}       />
          <MetricCard label="Not Checked"       value={notChecked.length}   color={notChecked.length > 0 ? "text-slate-400" : "text-slate-600"}  sub="Needs attention" />
          <MetricCard label="Requires Review"   value={reqReview.length}    color={reqReview.length > 0 ? "text-amber-400" : "text-slate-600"} highlight={reqReview.length > 0} />
          <MetricCard label="Blocked"           value={blocked.length}      color={blocked.length > 0 ? "text-red-400" : "text-slate-600"} highlight={blocked.length > 0} />
          <MetricCard label="Legal Review Req." value={legalRequired.length} color={legalRequired.length > 0 ? "text-amber-400" : "text-slate-600"} sub="Not yet Approved" />
        </div>

        {/* ── Alert banners ────────────────────────────────────────────────────── */}
        {blocked.length > 0 && (
          <div className="mb-4 flex items-start gap-3 rounded-xl border border-red-500/30 bg-red-950/15 px-4 py-3">
            <span className="mt-0.5 text-sm">✕</span>
            <div>
              <p className="text-xs font-semibold text-red-300">{blocked.length} payment{blocked.length !== 1 ? "s" : ""} blocked by compliance review</p>
              <p className="text-[10px] text-slate-500">Review and resolve blocked payments. Funds must not be treated as secured until resolved.</p>
            </div>
          </div>
        )}

        {missingDisc.length > 0 && (
          <div className="mb-6 flex items-start gap-3 rounded-xl border border-amber-500/30 bg-amber-950/20 px-4 py-3">
            <span className="mt-0.5 text-sm">⚠</span>
            <div>
              <p className="text-xs font-semibold text-amber-300">{missingDisc.length} check{missingDisc.length !== 1 ? "s" : ""} missing customer or provider disclaimer</p>
              <p className="text-[10px] text-slate-500">Disclaimer confirmation is required before treating payments as secured.</p>
            </div>
          </div>
        )}

        {/* ── Partner summary ──────────────────────────────────────────────────── */}
        {partners.length > 0 && (
          <div className="mb-8">
            <div className="mb-3 flex items-center justify-between">
              <SectionTitle>Partner Setups</SectionTitle>
              <Link href="/admin/payment-partners" className="text-[10px] text-blue-400 hover:text-blue-300 transition-colors">Manage →</Link>
            </div>
            <div className="flex flex-wrap gap-2">
              {partners.map((p) => (
                <div key={p.id} className="rounded-lg border border-slate-800 bg-slate-900/40 px-3 py-2">
                  <p className="text-[11px] font-medium text-slate-300">{p.partner_name}</p>
                  <p className="text-[10px] text-slate-600">{p.holding_model}</p>
                  <span className={`mt-1 inline-flex items-center rounded-full border px-2 py-0.5 text-[9px] ${
                    p.status === "Active" ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-400"
                    : p.status === "Pilot Ready" ? "border-blue-500/30 bg-blue-500/10 text-blue-400"
                    : "border-slate-700 bg-slate-800/40 text-slate-500"
                  }`}>{p.status}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── Filter tabs + table ──────────────────────────────────────────────── */}
        <div className="mb-4 flex items-center justify-between">
          <SectionTitle>Compliance Checks</SectionTitle>
          <Link href="/admin/jobs" className="text-[10px] text-slate-600 hover:text-slate-400">Add check from job page →</Link>
        </div>

        <div className="mb-4 flex flex-wrap gap-1">
          {STATUS_TABS.map((t) => (
            <button key={t.value} onClick={() => setTab(t.value)}
              className={`rounded-lg border px-3 py-1.5 text-[10px] font-medium transition-colors ${tab === t.value ? "border-blue-500/30 bg-blue-500/10 text-blue-400" : "border-slate-800 bg-slate-900/60 text-slate-500 hover:text-slate-300"}`}>
              {t.label} {t.value === "" ? `(${checks.length})` : `(${checks.filter((c) => c.check_status === t.value).length})`}
            </button>
          ))}
        </div>

        {loading ? (
          <p className="text-xs text-slate-600">Loading…</p>
        ) : filtered.length === 0 ? (
          <div className="rounded-xl border border-slate-800 bg-slate-900/60 px-6 py-8 text-center">
            <p className="text-xs text-slate-600">
              {tab ? `No checks with status "${tab}".` : "No compliance checks yet. Create checks from the job detail page."}
            </p>
          </div>
        ) : (
          <div className="overflow-hidden rounded-2xl border border-slate-800">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-slate-800 bg-slate-900/80">
                  {["Job / Payment", "Status", "Partner", "Hold OK", "Rel OK", "Cust Disc", "Prov Disc", "Legal", "Actions"].map((h) => (
                    <th key={h} className="px-3 py-3 text-left text-[10px] font-medium text-slate-500 whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((c) => {
                  const p = c.payment_partner_setup_id ? partnerMap.get(c.payment_partner_setup_id) : null;
                  const isBusy = busy === c.id;
                  return (
                    <tr key={c.id} className="border-b border-slate-800/60 hover:bg-slate-800/20 transition-colors">
                      <td className="px-3 py-3">
                        {c.job_reference ? (
                          <Link href={`/admin/jobs/${c.job_reference}`} className="font-mono text-blue-400 hover:text-blue-300">{c.job_reference}</Link>
                        ) : (
                          <span className="font-mono text-slate-500 text-[10px]">{c.held_payment_id?.slice(0, 8) ?? "—"}</span>
                        )}
                        {c.compliance_note && <p className="text-[9px] text-slate-600 mt-0.5 truncate max-w-[140px]">{c.compliance_note}</p>}
                      </td>
                      <td className="px-3 py-3">
                        <Badge label={`${COMPLIANCE_STATUS_ICON[c.check_status as ComplianceStatus]} ${c.check_status}`} cls={COMPLIANCE_STATUS_BADGE[c.check_status as ComplianceStatus] ?? ""} />
                      </td>
                      <td className="px-3 py-3 text-slate-500 max-w-[100px] truncate">{p?.partner_name ?? "—"}</td>
                      {[c.holding_wording_ok, c.release_wording_ok, c.customer_disclaimer_shown, c.provider_disclaimer_shown, c.legal_review_required].map((v, i) => (
                        <td key={i} className="px-3 py-2 text-center">
                          <span className={`text-xs ${v ? "text-emerald-400" : i < 4 ? "text-red-400" : "text-amber-400"}`}>
                            {v ? "✓" : i === 4 ? "⚠" : "✕"}
                          </span>
                        </td>
                      ))}
                      <td className="px-3 py-3">
                        <div className="flex flex-wrap gap-1">
                          {c.check_status !== "Approved" && (
                            <button onClick={() => quickAction(c.id, "approve")} disabled={isBusy}
                              className="rounded border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[9px] text-emerald-400 hover:bg-emerald-500/20 disabled:opacity-40 transition-colors">
                              Approve
                            </button>
                          )}
                          {c.check_status !== "Blocked" && (
                            <button onClick={() => quickAction(c.id, "block")} disabled={isBusy}
                              className="rounded border border-red-500/30 bg-red-500/10 px-2 py-0.5 text-[9px] text-red-400 hover:bg-red-500/20 disabled:opacity-40 transition-colors">
                              Block
                            </button>
                          )}
                          {c.job_reference && (
                            <Link href={`/admin/jobs/${c.job_reference}`}
                              className="rounded border border-slate-700 px-2 py-0.5 text-[9px] text-slate-500 hover:bg-slate-800 transition-colors">
                              Job →
                            </Link>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        <p className="mt-4 text-[9px] text-slate-700">
          Compliance checks are internal records. They do not constitute legal advice or regulated compliance certification.
          Legal review by qualified professionals is required where legal_review_required = true.
        </p>
      </main>
    </div>
  );
}
