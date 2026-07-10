"use client";
import { useState, useEffect, useCallback } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { AdminNav } from "@/components/AdminNav";
import { AuthGuard } from "@/components/AuthGuard";
import { useAuth } from "@/contexts/AuthContext";

// ─── Types ────────────────────────────────────────────────────────────────────

type SubScore = {
  name: string; score: number | null; grade: string;
  positives: string[]; risks: string[]; unavailable?: boolean;
};

type RiskFlag = { flag: string; severity: "low" | "medium" | "high"; detail: string };

type ReportData = {
  ok: true;
  reportDate: string;
  company: {
    id: string; name: string; type: string | null; country: string | null;
    registration_no: string | null; status: string | null; created_at: string | null;
  };
  profile: {
    risk_level: string | null; financeability_score: number | null;
    overall_trust_score: number | null; scoring_status: string | null;
    last_calculated_at: string | null; total_secured_amount: number;
    total_logistics_fee: number; total_cargo_value: number;
  } | null;
  scores: { overall: number | null; sub_scores: SubScore[] };
  jobStats: {
    total: number; completed: number; active: number; monthly: number;
    disputed: number; payment_verified: number; payment_mismatches: number;
    total_secured: number; monthly_secured: number;
    total_logistics_fee: number; total_cargo_value: number;
    avg_transaction_size: number | null;
    first_job_at: string | null; last_job_at: string | null;
    months_active: number | null; jobs_per_month: number | null;
  };
  paymentBehaviour: {
    verified_jobs: number; mismatches: number;
    verification_rate: number | null; score: number | null;
  };
  deliveryPerf: {
    completed: number; disputed: number;
    completion_rate: number | null; score: number | null;
  };
  riskFlags: RiskFlag[];
  peerStats: {
    peer_count: number; avg_completion_rate: number;
    avg_logistics_fee: number; avg_secured_amount: number;
  } | null;
  recommendation: {
    product: string; status: string;
    facility_type: string | null; suggested_tenor: string | null;
    suggested_limit: number | null; reasoning: string;
  };
  financialInputs: Record<string, unknown>[];
  marketInputs:    Record<string, unknown>[];
  requiredDocs:    string[];
  dataAvailability: {
    has_profile: boolean; has_jobs: boolean;
    has_financial_inputs: boolean; has_market_inputs: boolean; has_peers: boolean;
  };
};

// ─── Shared UI helpers ────────────────────────────────────────────────────────

function Section({ id, title, badge, children }: {
  id: string; title: string; badge?: string; children: React.ReactNode;
}) {
  return (
    <section id={id} className="rounded-xl border border-slate-800 bg-slate-900/60 overflow-hidden print:border-slate-300">
      <div className="flex items-center justify-between border-b border-slate-800 px-5 py-3 print:border-slate-300">
        <h2 className="text-sm font-semibold text-slate-200 print:text-slate-900">{title}</h2>
        {badge && (
          <span className="rounded border border-slate-700 px-2 py-0.5 text-[10px] text-slate-500 print:border-slate-400">
            {badge}
          </span>
        )}
      </div>
      <div className="p-5">{children}</div>
    </section>
  );
}

function Row({ label, value, mono }: { label: string; value: React.ReactNode; mono?: boolean }) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-slate-800/50 py-1.5 last:border-0 print:border-slate-200">
      <span className="shrink-0 text-xs text-slate-500">{label}</span>
      <span className={`text-right text-xs text-slate-200 print:text-slate-900 ${mono ? "font-mono" : ""}`}>{value}</span>
    </div>
  );
}

function Unavailable({ message }: { message: string }) {
  return (
    <div className="rounded-lg border border-slate-800 bg-slate-900/40 px-4 py-8 text-center">
      <p className="text-xs text-slate-500">{message}</p>
    </div>
  );
}

function MYR(v: number | null | undefined) {
  if (v == null || v === 0) return <span className="text-slate-600">—</span>;
  return <>RM {new Intl.NumberFormat("en-MY", { maximumFractionDigits: 0 }).format(v)}</>;
}

function Pct({ v }: { v: number | null | undefined }) {
  if (v == null) return <span className="text-slate-600">N/A</span>;
  return <>{v}%</>;
}

function gradeColor(grade: string) {
  if (grade === "A") return "text-emerald-400 border-emerald-500/40 bg-emerald-500/10";
  if (grade === "B") return "text-blue-400 border-blue-500/40 bg-blue-500/10";
  if (grade === "C") return "text-amber-400 border-amber-500/40 bg-amber-500/10";
  if (grade === "D") return "text-red-400 border-red-500/40 bg-red-500/10";
  return "text-slate-500 border-slate-700 bg-slate-800";
}

function riskColor(level: string | null) {
  if (level === "Low")          return "text-emerald-400 border-emerald-500/40 bg-emerald-500/10";
  if (level === "Medium")       return "text-amber-400 border-amber-500/40 bg-amber-500/10";
  if (level === "High")         return "text-red-400 border-red-500/40 bg-red-500/10";
  if (level === "Critical")     return "text-rose-400 border-rose-500/40 bg-rose-500/10";
  return "text-slate-500 border-slate-700 bg-slate-800";
}

function statusColor(status: string) {
  if (status === "Simulation-ready")    return "text-emerald-400 border-emerald-500/40 bg-emerald-500/10";
  if (status === "Potentially suitable") return "text-blue-400 border-blue-500/40 bg-blue-500/10";
  if (status === "Requires review")     return "text-amber-400 border-amber-500/40 bg-amber-500/10";
  return "text-slate-500 border-slate-700 bg-slate-800";
}

function ScoreMini({ score }: { score: number | null }) {
  if (score == null) return <span className="text-slate-600 text-xs">N/A</span>;
  const pct   = Math.min(100, Math.max(0, score));
  const color = pct >= 80 ? "bg-emerald-500" : pct >= 60 ? "bg-blue-500" : pct >= 40 ? "bg-amber-500" : "bg-red-500";
  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 w-20 rounded-full bg-slate-800">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="tabular-nums text-xs text-slate-300">{score}</span>
    </div>
  );
}

function flagSeverityStyle(sev: string) {
  if (sev === "high")   return "text-red-400 border-red-500/40 bg-red-500/10";
  if (sev === "medium") return "text-amber-400 border-amber-500/40 bg-amber-500/10";
  return "text-slate-400 border-slate-700 bg-slate-800/40";
}

function fmtDate(iso: string | null | undefined) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-MY", { year: "numeric", month: "short", day: "numeric" });
}

// ─── CSV export ───────────────────────────────────────────────────────────────

function exportCSV(d: ReportData) {
  const rows: (string | number | null)[][] = [
    ["Nexum SecureFlow — Company Credit & Financial Health Report"],
    ["Report Date", d.reportDate.slice(0, 10)],
    [""],
    ["COMPANY"],
    ["Name", d.company.name],
    ["Type", d.company.type],
    ["Country", d.company.country],
    ["Status", d.company.status],
    [""],
    ["INDICATIVE SCORES (system-derived / subject to lender review)"],
    ["Overall Score", d.scores.overall],
    ...d.scores.sub_scores.map((s) => [s.name, s.score, s.grade]),
    [""],
    ["TRANSACTION ACTIVITY"],
    ["Total Jobs", d.jobStats.total],
    ["Completed Jobs", d.jobStats.completed],
    ["Monthly Jobs", d.jobStats.monthly],
    ["Total Secured (MYR)", d.jobStats.total_secured],
    ["Monthly Secured (MYR)", d.jobStats.monthly_secured],
    ["Total Logistics Fee (MYR)", d.jobStats.total_logistics_fee],
    ["Avg Transaction Size (MYR)", d.jobStats.avg_transaction_size],
    [""],
    ["RISK FLAGS"],
    ...d.riskFlags.map((f) => [f.severity.toUpperCase(), f.flag, f.detail]),
    [""],
    ["RECOMMENDATION"],
    ["Product", d.recommendation.product],
    ["Status", d.recommendation.status],
    ["Facility Type", d.recommendation.facility_type],
    ["Suggested Tenor", d.recommendation.suggested_tenor],
    ["Suggested Limit (MYR)", d.recommendation.suggested_limit],
    ["Reasoning", d.recommendation.reasoning],
    [""],
    ["DISCLAIMER"],
    ["This report is system-derived and indicative only. All scores and recommendations are for decision-support purposes and are subject to lender review. Not a credit approval or commitment."],
  ];
  const csv = rows.map((r) => r.map((c) => `"${String(c ?? "").replace(/"/g, '""')}"`).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement("a");
  a.href     = url;
  a.download = `credit-report-${d.company.name.replace(/\s+/g, "-")}-${d.reportDate.slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

// ─── Page shell ───────────────────────────────────────────────────────────────

export default function CreditHealthReportPage() {
  return (
    <AuthGuard requiredRole="admin">
      <ReportInner />
    </AuthGuard>
  );
}

// ─── Inner component ──────────────────────────────────────────────────────────

function ReportInner() {
  const params     = useParams();
  const companyId  = params.companyId as string;
  const { isBypass } = useAuth();

  const [data,    setData]    = useState<ReportData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res  = await fetch(`/api/admin/companies/${companyId}/credit-report`, {
        headers: isBypass ? { "x-nexum-dev-bypass": "1" } : {},
      });
      const json = await res.json() as ReportData | { ok: false; error: string };
      if (!json.ok) { setError((json as { ok: false; error: string }).error); return; }
      setData(json as ReportData);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load report");
    } finally {
      setLoading(false);
    }
  }, [companyId, isBypass]);

  useEffect(() => { void load(); }, [load]);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-200 print:bg-white print:text-slate-900">
      <AdminNav />
      <main className="mx-auto max-w-5xl px-4 py-8 print:px-0">
        {/* Back + actions */}
        <div className="mb-6 flex items-center justify-between print:hidden">
          <Link href={`/admin/companies/${companyId}`}
            className="text-xs text-slate-500 hover:text-slate-300 transition-colors">
            ← Company Detail
          </Link>
          {data && (
            <div className="flex items-center gap-2">
              <button onClick={() => exportCSV(data)}
                className="rounded border border-slate-700 bg-slate-800 px-3 py-1.5 text-xs text-slate-400 hover:text-slate-200 transition-colors">
                ↓ Export CSV
              </button>
              <button onClick={() => window.print()}
                className="rounded border border-slate-700 bg-slate-800 px-3 py-1.5 text-xs text-slate-400 hover:text-slate-200 transition-colors">
                ⎙ Print
              </button>
            </div>
          )}
        </div>

        {loading && (
          <div className="flex flex-col items-center justify-center gap-3 py-24 text-slate-500">
            <span className="h-6 w-6 animate-spin rounded-full border-2 border-blue-500 border-t-transparent" />
            <p className="text-sm">Loading credit health report…</p>
          </div>
        )}

        {!loading && error && (
          <div className="rounded-xl border border-red-500/30 bg-red-500/5 px-5 py-8 text-center">
            <p className="text-sm font-semibold text-red-300 mb-2">Failed to load report</p>
            <p className="text-xs text-red-400 font-mono">{error}</p>
            <button onClick={load} className="mt-4 rounded border border-red-500/30 px-4 py-2 text-xs text-red-400 hover:bg-red-500/10 transition-colors">
              ↺ Retry
            </button>
          </div>
        )}

        {!loading && data && <ReportLayout data={data} />}
      </main>
    </div>
  );
}

// ─── Full report layout ───────────────────────────────────────────────────────

function ReportLayout({ data: d }: { data: ReportData }) {
  const overallGrade = d.scores.overall != null
    ? (d.scores.overall >= 80 ? "A" : d.scores.overall >= 60 ? "B" : d.scores.overall >= 40 ? "C" : "D")
    : "N/A";

  return (
    <div className="flex flex-col gap-6">
      {/* Report title */}
      <div>
        <p className="text-[10px] font-medium uppercase tracking-widest text-slate-600">Nexum SecureFlow · Admin · Decision Support Only</p>
        <h1 className="mt-1 text-xl font-bold text-slate-100 print:text-slate-900">Company Credit &amp; Financial Health Report</h1>
        <p className="mt-0.5 text-xs text-slate-500">Report date: {fmtDate(d.reportDate)} · Data source: System-derived from Nexum workflow</p>
        <p className="mt-1 rounded border border-amber-500/20 bg-amber-500/5 px-3 py-1.5 text-[10px] text-amber-500/80">
          Indicative scores only. All assessments are system-derived and subject to lender review. This is not a credit approval, commitment, or guarantee of financing.
        </p>
      </div>

      {/* TOC */}
      <nav className="rounded-xl border border-slate-800 bg-slate-900/40 px-5 py-4 print:hidden">
        <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-slate-600">Sections</p>
        <div className="flex flex-wrap gap-x-4 gap-y-1">
          {[
            ["s1", "Executive Summary"], ["s2", "Score Explanation"],
            ["s3", "Transaction Activity"], ["s4", "Cash Flow Health"],
            ["s5", "Margin & Unit Economics"], ["s6", "Demand & Business Quality"],
            ["s7", "Market Competitiveness"], ["s8", "Peer Intelligence"],
            ["s9", "Payment Behaviour"], ["s10", "Delivery Performance"],
            ["s11", "Risk Flags"], ["s12", "Bank / Lender View"],
            ["s13", "Financing Product"], ["s14", "Conclusion"],
          ].map(([id, label]) => (
            <a key={id} href={`#${id}`} className="text-xs text-slate-500 hover:text-blue-400 transition-colors">{label}</a>
          ))}
        </div>
      </nav>

      {/* ── S1: Executive Summary ──────────────────────────────────────── */}
      <Section id="s1" title="1. Executive Summary" badge="System-derived">
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
          <div>
            <Row label="Company Name"       value={<span className="font-semibold">{d.company.name}</span>} />
            <Row label="Company Type"       value={d.company.type ?? "—"} />
            <Row label="Country"            value={d.company.country ?? "—"} />
            <Row label="Status"             value={
              <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
                d.company.status === "Active" ? "bg-emerald-500/10 text-emerald-400" : "bg-slate-800 text-slate-500"
              }`}>{d.company.status ?? "—"}</span>
            } />
            <Row label="Reg No"             value={d.company.registration_no ?? "—"} mono />
            <Row label="Report Date"        value={fmtDate(d.reportDate)} />
            <Row label="Data Source"        value="System-derived · Nexum workflow" />
          </div>
          <div>
            <Row label="Overall Trade Health Score" value={
              <div className="flex items-center gap-2">
                <ScoreMini score={d.scores.overall} />
                {d.scores.overall != null && (
                  <span className={`rounded border px-1.5 py-0.5 text-[10px] font-bold ${gradeColor(overallGrade)}`}>{overallGrade}</span>
                )}
              </div>
            } />
            <Row label="Risk Level" value={
              <span className={`rounded border px-2 py-0.5 text-[10px] font-semibold ${riskColor(d.profile?.risk_level ?? null)}`}>
                {d.profile?.risk_level ?? "Not Scored"}
              </span>
            } />
            <Row label="Financeability Score" value={<ScoreMini score={d.profile?.financeability_score ?? null} />} />
            <Row label="Recommended Exposure Limit" value={MYR(d.recommendation.suggested_limit)} />
            <Row label="Recommended Financing Amount" value={MYR(d.recommendation.suggested_limit)} />
            <Row label="Last Scored" value={fmtDate(d.profile?.last_calculated_at)} />
            <Row label="Scoring Status" value={d.profile?.scoring_status ?? "Not Scored"} />
          </div>
        </div>
      </Section>

      {/* ── S2: Score Explanation ─────────────────────────────────────── */}
      <Section id="s2" title="2. Score Explanation" badge="System-derived">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {d.scores.sub_scores.map((s) => (
            <div key={s.name} className="rounded-lg border border-slate-800 bg-slate-900/40 p-4">
              <div className="mb-2 flex items-center justify-between">
                <p className="text-xs font-semibold text-slate-300">{s.name}</p>
                <span className={`rounded border px-1.5 py-0.5 text-[10px] font-bold ${gradeColor(s.grade)}`}>{s.grade}</span>
              </div>
              <ScoreMini score={s.score} />
              {s.unavailable && (
                <p className="mt-2 text-[10px] italic text-slate-600">No data — score unavailable</p>
              )}
              {s.positives.length > 0 && (
                <ul className="mt-2 space-y-0.5">
                  {s.positives.map((p) => (
                    <li key={p} className="flex gap-1.5 text-[10px] text-emerald-400">
                      <span>+</span><span>{p}</span>
                    </li>
                  ))}
                </ul>
              )}
              {s.risks.length > 0 && (
                <ul className="mt-1 space-y-0.5">
                  {s.risks.map((r) => (
                    <li key={r} className="flex gap-1.5 text-[10px] text-red-400">
                      <span>−</span><span>{r}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ))}
        </div>
      </Section>

      {/* ── S3: Transaction Activity ──────────────────────────────────── */}
      <Section id="s3" title="3. Transaction Activity" badge="System-derived">
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
          <div>
            <Row label="Total Jobs"           value={d.jobStats.total} />
            <Row label="Completed Jobs"       value={d.jobStats.completed} />
            <Row label="Active Jobs"          value={d.jobStats.active} />
            <Row label="Monthly Jobs (30d)"   value={d.jobStats.monthly} />
            <Row label="Disputed Jobs"        value={d.jobStats.disputed > 0 ? <span className="text-red-400">{d.jobStats.disputed}</span> : 0} />
            <Row label="First Job"            value={fmtDate(d.jobStats.first_job_at)} />
            <Row label="Latest Job"           value={fmtDate(d.jobStats.last_job_at)} />
            <Row label="Months Active"        value={d.jobStats.months_active ?? "—"} />
            <Row label="Jobs / Month (avg)"   value={d.jobStats.jobs_per_month ?? "—"} />
          </div>
          <div>
            <Row label="Total Secured Amount"   value={MYR(d.jobStats.total_secured)} />
            <Row label="Monthly Secured (30d)"  value={MYR(d.jobStats.monthly_secured)} />
            <Row label="Total Logistics Fee"    value={MYR(d.jobStats.total_logistics_fee)} />
            <Row label="Total Cargo Value"      value={MYR(d.jobStats.total_cargo_value)} />
            <Row label="Avg Transaction Size"   value={MYR(d.jobStats.avg_transaction_size)} />
            <Row label="Payment Verified Jobs"  value={d.jobStats.payment_verified} />
            <Row label="Payment Mismatches"     value={d.jobStats.payment_mismatches > 0 ? <span className="text-amber-400">{d.jobStats.payment_mismatches}</span> : 0} />
            <Row label="Growth Trend"           value={
              d.jobStats.monthly > 0 && d.jobStats.months_active && d.jobStats.months_active > 1
                ? "Active" : d.jobStats.total > 0 ? "Stable" : "No data"
            } />
          </div>
        </div>
      </Section>

      {/* ── S4: Cash Flow Health ─────────────────────────────────────── */}
      <Section id="s4" title="4. Cash Flow Health" badge={d.dataAvailability.has_financial_inputs ? "Self-Reported" : "Not Available"}>
        {!d.dataAvailability.has_financial_inputs ? (
          <Unavailable message="Cash-flow data not available yet. Add company cash-flow items via the financial inputs form, or connect bank/API later." />
        ) : (
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
            {d.financialInputs.slice(0, 1).map((fi, i) => (
              <div key={i}>
                <Row label="Period"               value={`${fi.period_start ?? "?"} → ${fi.period_end ?? "?"}`} />
                <Row label="Cash Balance"         value={MYR(fi.cash_balance as number)} />
                <Row label="Receivables"          value={MYR(fi.receivables as number)} />
                <Row label="Payables"             value={MYR(fi.payables as number)} />
                <Row label="Bank Facility Limit"  value={MYR(fi.bank_facility_limit as number)} />
                <Row label="Bank Facility Used"   value={MYR(fi.bank_facility_used as number)} />
                <Row label="Source"               value={fi.source_type as string} />
              </div>
            ))}
            <div>
              <Row label="Revenue"      value={MYR(d.financialInputs[0]?.revenue as number)} />
              <Row label="Gross Profit" value={MYR(d.financialInputs[0]?.gross_profit as number)} />
              <Row label="Gross Margin" value={<Pct v={d.financialInputs[0]?.gross_margin_percent as number} />} />
              <Row label="Net Profit"   value={MYR(d.financialInputs[0]?.net_profit as number)} />
              <Row label="Note"         value={(d.financialInputs[0]?.note as string) ?? "—"} />
            </div>
          </div>
        )}
      </Section>

      {/* ── S5: Margin / Unit Economics ──────────────────────────────── */}
      <Section id="s5" title="5. Margin / Unit Economics" badge={d.dataAvailability.has_market_inputs ? "Self-Reported" : "Not Available"}>
        {!d.dataAvailability.has_market_inputs ? (
          <Unavailable message="Margin data not available yet. Add product/margin data via the market inputs form to enable profitability analysis." />
        ) : (
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
            {d.marketInputs.map((mi, i) => (
              <div key={i} className="rounded-lg border border-slate-800 bg-slate-900/40 p-4">
                <p className="mb-2 text-xs font-semibold text-slate-400">
                  {(mi.commodity_category as string) ?? "—"} · {(mi.product_description as string) ?? "—"}
                </p>
                <Row label="Selling Price"      value={MYR(mi.selling_price as number)} />
                <Row label="Purchase Cost"      value={MYR(mi.purchase_cost as number)} />
                <Row label="Landed Cost"        value={MYR(mi.landed_cost as number)} />
                <Row label="Logistics Cost"     value={MYR(mi.logistics_cost as number)} />
                <Row label="Duty / Tax"         value={MYR(mi.duty_tax as number)} />
                <Row label="Gross Margin"       value={<Pct v={mi.margin_percent as number} />} />
                <Row label="Competitor Low"     value={MYR(mi.competitor_price_low as number)} />
                <Row label="Competitor High"    value={MYR(mi.competitor_price_high as number)} />
                <Row label="Source"             value={mi.source_type as string} />
              </div>
            ))}
          </div>
        )}
      </Section>

      {/* ── S6: Demand & Business Quality ────────────────────────────── */}
      <Section id="s6" title="6. Demand & Business Quality" badge="System-derived">
        {!d.dataAvailability.has_jobs ? (
          <Unavailable message="No transaction data. Business quality analysis requires at least 1 secured job on record." />
        ) : (
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
            <div>
              <Row label="Monthly Activity (30d)"   value={`${d.jobStats.monthly} job(s)`} />
              <Row label="Repeat Business"          value={d.jobStats.total >= 3 ? "Yes — 3+ transactions" : "Building track record"} />
              <Row label="Jobs / Month (avg)"       value={d.jobStats.jobs_per_month ?? "—"} />
              <Row label="Active vs Completed"      value={`${d.jobStats.active} active · ${d.jobStats.completed} completed`} />
            </div>
            <div>
              <Row label="Demand Signal"  value={
                d.jobStats.total >= 5 ? <span className="text-emerald-400">Strong</span>
                : d.jobStats.total >= 2 ? <span className="text-blue-400">Developing</span>
                : <span className="text-slate-500">Weak</span>
              } />
              <Row label="Dispute Rate"   value={
                d.jobStats.total > 0
                  ? <Pct v={Math.round((d.jobStats.disputed / d.jobStats.total) * 100)} />
                  : <span className="text-slate-600">N/A</span>
              } />
              <Row label="Completion Rate" value={<Pct v={d.deliveryPerf.completion_rate} />} />
              <Row label="Quotation Conversion" value={<span className="text-slate-600 italic">Not tracked yet</span>} />
            </div>
          </div>
        )}
      </Section>

      {/* ── S7: Market Competitiveness ───────────────────────────────── */}
      <Section id="s7" title="7. Market Competitiveness" badge="Internal Nexum Benchmark">
        {!d.peerStats ? (
          <Unavailable message="Insufficient peer data for benchmarking. More companies of the same type need to be onboarded to enable internal benchmarks." />
        ) : (
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
            <div>
              <p className="mb-3 text-[10px] font-semibold uppercase tracking-wider text-slate-600">This Company</p>
              <Row label="Completion Rate" value={<Pct v={d.deliveryPerf.completion_rate} />} />
              <Row label="Avg Logistics Fee" value={MYR(d.jobStats.total > 0 ? Math.round(d.jobStats.total_logistics_fee / d.jobStats.total) : null)} />
              <Row label="Avg Secured Amount" value={MYR(d.jobStats.avg_transaction_size)} />
            </div>
            <div>
              <p className="mb-3 text-[10px] font-semibold uppercase tracking-wider text-slate-600">Peer Average ({d.peerStats.peer_count} peers)</p>
              <Row label="Completion Rate"    value={<Pct v={Math.round(d.peerStats.avg_completion_rate * 100)} />} />
              <Row label="Avg Logistics Fee"  value={MYR(Math.round(d.peerStats.avg_logistics_fee))} />
              <Row label="Avg Secured Amount" value={MYR(Math.round(d.peerStats.avg_secured_amount))} />
            </div>
          </div>
        )}
      </Section>

      {/* ── S8: Market / Peer Intelligence ───────────────────────────── */}
      <Section id="s8" title="8. Market / Peer Intelligence" badge="Internal · Admin Only">
        {!d.peerStats ? (
          <Unavailable message="No peer data available for this company type yet." />
        ) : (
          <div>
            <Row label="Similar Companies (same type)" value={d.peerStats.peer_count} />
            <Row label="Avg Completion Rate (peers)"   value={<Pct v={Math.round(d.peerStats.avg_completion_rate * 100)} />} />
            <Row label="Avg Logistics Fee (peers)"     value={MYR(Math.round(d.peerStats.avg_logistics_fee))} />
            <Row label="Avg Secured Amount (peers)"    value={MYR(Math.round(d.peerStats.avg_secured_amount))} />
            <p className="mt-3 text-[10px] text-slate-600 italic">Peer company names are not disclosed to non-admin users.</p>
          </div>
        )}
      </Section>

      {/* ── S9: Payment Behaviour ─────────────────────────────────────── */}
      <Section id="s9" title="9. Payment Behaviour" badge="System-derived">
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
          <div>
            <Row label="Payment Verified Jobs"    value={d.paymentBehaviour.verified_jobs} />
            <Row label="Payment Mismatch Count"   value={
              d.paymentBehaviour.mismatches > 0
                ? <span className="text-amber-400">{d.paymentBehaviour.mismatches}</span>
                : 0
            } />
            <Row label="Verification Rate"        value={<Pct v={d.paymentBehaviour.verification_rate} />} />
            <Row label="Avg Days to Payment"      value={<span className="italic text-slate-600">Not tracked yet</span>} />
            <Row label="Third-Party Payments"     value={<span className="italic text-slate-600">Not tracked yet</span>} />
          </div>
          <div>
            <Row label="Payment Behaviour Score"  value={<ScoreMini score={d.paymentBehaviour.score} />} />
            <Row label="Late Payment Count"       value={<span className="italic text-slate-600">Not tracked yet</span>} />
            <Row label="Exact Match Rate"         value={
              d.jobStats.completed > 0
                ? <Pct v={Math.round(((d.jobStats.completed - d.jobStats.payment_mismatches) / d.jobStats.completed) * 100)} />
                : <span className="text-slate-600">N/A</span>
            } />
            <Row label="Avg Days to Secured"      value={<span className="italic text-slate-600">Not tracked yet</span>} />
          </div>
        </div>
      </Section>

      {/* ── S10: Delivery / Execution Performance ────────────────────── */}
      <Section id="s10" title="10. Delivery / Execution Performance" badge="System-derived">
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
          <div>
            <Row label="Completed Jobs"       value={d.deliveryPerf.completed} />
            <Row label="Dispute Count"        value={
              d.deliveryPerf.disputed > 0
                ? <span className="text-red-400">{d.deliveryPerf.disputed}</span>
                : 0
            } />
            <Row label="Completion Rate"      value={<Pct v={d.deliveryPerf.completion_rate} />} />
            <Row label="POD Uploaded"         value={<span className="italic text-slate-600">Not tracked yet</span>} />
            <Row label="Customer Confirmed"   value={<span className="italic text-slate-600">Not tracked yet</span>} />
          </div>
          <div>
            <Row label="Delivery Performance Score"   value={<ScoreMini score={d.deliveryPerf.score} />} />
            <Row label="Avg Days to Delivery"         value={<span className="italic text-slate-600">Not tracked yet</span>} />
            <Row label="Avg Days to POD"              value={<span className="italic text-slate-600">Not tracked yet</span>} />
            <Row label="Auto-Confirmed Jobs"          value={<span className="italic text-slate-600">Not tracked yet</span>} />
          </div>
        </div>
      </Section>

      {/* ── S11: Risk Flags ──────────────────────────────────────────── */}
      <Section id="s11" title="11. Risk Flags" badge="System-derived">
        {d.riskFlags.length === 0 ? (
          <p className="text-xs text-emerald-400">No risk flags detected based on available data.</p>
        ) : (
          <div className="flex flex-col gap-2">
            {d.riskFlags.map((f) => (
              <div key={f.flag} className={`flex gap-3 rounded-lg border px-4 py-3 ${flagSeverityStyle(f.severity)}`}>
                <span className="mt-0.5 shrink-0 text-[10px] font-bold uppercase">{f.severity}</span>
                <div>
                  <p className="text-xs font-semibold">{f.flag}</p>
                  <p className="text-[11px] opacity-80">{f.detail}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </Section>

      {/* ── S12: Bank / Lender View ──────────────────────────────────── */}
      <Section id="s12" title="12. Bank / Lender View" badge="Decision-Support · Subject to Lender Review">
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
          <div>
            <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-slate-600">Borrower Profile</p>
            <Row label="Entity Name"       value={d.company.name} />
            <Row label="Business Type"     value={d.company.type ?? "—"} />
            <Row label="Country"           value={d.company.country ?? "—"} />
            <Row label="Platform Status"   value={d.company.status ?? "—"} />
            <Row label="Trade History"     value={`${d.jobStats.total} job(s) · ${d.jobStats.months_active ?? 0} month(s)`} />
            <Row label="Repayment Source"  value="Secured job payments via Nexum workflow" />
          </div>
          <div>
            <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-slate-600">Credit Indicators (Indicative)</p>
            <Row label="Evidence Quality Score"  value={<ScoreMini score={d.scores.sub_scores.find((s) => s.name === "Evidence Quality")?.score ?? null} />} />
            <Row label="Repayment Risk"          value={
              d.profile?.risk_level === "Low" ? <span className="text-emerald-400">Lower risk</span>
              : d.profile?.risk_level === "High" ? <span className="text-red-400">Higher risk</span>
              : <span className="text-amber-400">Monitor</span>
            } />
            <Row label="Cash-Flow Gap"           value={
              d.dataAvailability.has_financial_inputs
                ? "See Cash Flow Health section"
                : <span className="italic text-slate-600">Not calculable — no cash-flow data</span>
            } />
            <Row label="Financing Use Case"      value="Logistics Working Capital" />
            <Row label="Suggested Facility"      value={d.recommendation.facility_type ?? "—"} />
            <Row label="Suggested Tenor"         value={d.recommendation.suggested_tenor ?? "—"} />
            <Row label="Suggested Limit"         value={MYR(d.recommendation.suggested_limit)} />
          </div>
        </div>

        {/* Required documents */}
        <div className="mt-5">
          <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-slate-600">Required Documents Checklist</p>
          <div className="grid grid-cols-1 gap-1 sm:grid-cols-2">
            {d.requiredDocs.map((doc) => (
              <div key={doc} className="flex items-start gap-2 text-[11px] text-slate-400">
                <span className="mt-0.5 text-slate-600">□</span>
                <span>{doc}</span>
              </div>
            ))}
          </div>
        </div>
      </Section>

      {/* ── S13: Recommended Financing Product ───────────────────────── */}
      <Section id="s13" title="13. Recommended Financing Product" badge="Indicative · Not an Approval">
        <div className={`mb-4 rounded-lg border px-4 py-4 ${statusColor(d.recommendation.status)}`}>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-bold">{d.recommendation.product}</p>
              <p className="text-xs opacity-80 mt-0.5">{d.recommendation.reasoning}</p>
            </div>
            <span className="shrink-0 rounded border px-2 py-1 text-[11px] font-semibold">{d.recommendation.status}</span>
          </div>
        </div>
        <Row label="Facility Type"      value={d.recommendation.facility_type ?? "—"} />
        <Row label="Suggested Tenor"    value={d.recommendation.suggested_tenor ?? "—"} />
        <Row label="Suggested Limit"    value={MYR(d.recommendation.suggested_limit)} />
        <p className="mt-4 text-[10px] italic text-slate-600">
          Indicative suggestions only. Not an approved facility. Final credit decision is at the sole discretion of the lender and subject to full underwriting review.
          Use terms: "Potentially suitable", "Simulation-ready", or "Requires review" only.
        </p>
      </Section>

      {/* ── S14: Report Conclusion ───────────────────────────────────── */}
      <Section id="s14" title="14. Report Conclusion" badge="Decision-Support Summary">
        {(() => {
          const score   = d.scores.overall;
          const risk    = d.profile?.risk_level ?? "Not Available";
          const hasJobs = d.dataAvailability.has_jobs;
          const strongPoints: string[] = [];
          const weakPoints:   string[] = [];
          const missing:      string[] = [];
          const actions:      string[] = [];

          if (d.jobStats.completed >= 3)                strongPoints.push(`${d.jobStats.completed} completed transactions — demonstrated trade activity`);
          if (d.jobStats.payment_mismatches === 0 && d.jobStats.completed > 0) strongPoints.push("Clean payment record — no mismatches");
          if (d.jobStats.disputed === 0 && hasJobs)     strongPoints.push("Zero dispute history");
          if (risk === "Low")                            strongPoints.push("Low risk classification based on system data");

          if (d.jobStats.total < 3)                     weakPoints.push("Limited transaction history — less than 3 jobs");
          if (d.jobStats.disputed > 0)                  weakPoints.push(`${d.jobStats.disputed} unresolved dispute(s)`);
          if (d.jobStats.payment_mismatches > 0)        weakPoints.push("Payment mismatches detected");
          if (!hasJobs)                                  weakPoints.push("No transaction history on record");

          if (!d.dataAvailability.has_financial_inputs) missing.push("Cash-flow and P&L data (company_financial_inputs)");
          if (!d.dataAvailability.has_market_inputs)    missing.push("Margin and market pricing data (company_market_inputs)");
          if (d.jobStats.total < 3)                     missing.push("Minimum 3 completed job transactions");

          if (!d.dataAvailability.has_financial_inputs) actions.push("Collect and enter financial statements / management accounts");
          if (!d.dataAvailability.has_market_inputs)    actions.push("Add product margin and market pricing data");
          if (d.jobStats.total < 3)                     actions.push("Onboard more transactions to build scoring history");
          if (d.recommendation.status === "Simulation-ready") actions.push("Run financing simulation with lender parameters");
          actions.push("Collect required documents for lender submission");

          return (
            <div className="space-y-4">
              <div>
                <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-slate-600">Overall Assessment</p>
                <p className="text-xs text-slate-300">
                  {!hasJobs
                    ? "No trade history available. The company is registered on Nexum but has no secured jobs. Financing assessment cannot be initiated."
                    : score == null
                      ? "Transaction data available but scoring is incomplete. Additional financial and market data is required."
                      : score >= 70
                        ? `Trade health score of ${score}/100 (Grade ${overallGrade}). Company shows ${risk.toLowerCase()} risk profile with consistent transaction activity. Indicatively suitable for further assessment.`
                        : `Trade health score of ${score}/100 (Grade ${overallGrade}). ${risk} risk profile. Review outstanding risk flags before proceeding.`}
                </p>
              </div>
              {strongPoints.length > 0 && (
                <div>
                  <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-emerald-600">What Is Strong</p>
                  <ul className="space-y-1">
                    {strongPoints.map((p) => <li key={p} className="flex gap-2 text-xs text-emerald-400"><span>✓</span><span>{p}</span></li>)}
                  </ul>
                </div>
              )}
              {weakPoints.length > 0 && (
                <div>
                  <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-red-600">What Is Weak</p>
                  <ul className="space-y-1">
                    {weakPoints.map((p) => <li key={p} className="flex gap-2 text-xs text-red-400"><span>✗</span><span>{p}</span></li>)}
                  </ul>
                </div>
              )}
              {missing.length > 0 && (
                <div>
                  <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-amber-600">Data Missing</p>
                  <ul className="space-y-1">
                    {missing.map((m) => <li key={m} className="flex gap-2 text-xs text-amber-400"><span>○</span><span>{m}</span></li>)}
                  </ul>
                </div>
              )}
              {actions.length > 0 && (
                <div>
                  <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-blue-600">Next Actions</p>
                  <ol className="space-y-1 list-none">
                    {actions.map((a, i) => <li key={a} className="flex gap-2 text-xs text-blue-400"><span className="font-mono">{i + 1}.</span><span>{a}</span></li>)}
                  </ol>
                </div>
              )}
              <p className="border-t border-slate-800 pt-3 text-[10px] italic text-slate-600">
                This report is system-derived from Nexum platform data and is indicative only. All scores, risk assessments, and financing suggestions are for decision-support purposes.
                They do not constitute a credit approval, confirmed financial health assessment, or guaranteed financing commitment. Subject to full lender review and underwriting.
              </p>
            </div>
          );
        })()}
      </Section>
    </div>
  );
}
