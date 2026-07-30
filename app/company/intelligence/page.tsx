"use client";
import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { LogoutButton } from "@/components/LogoutButton";
import { NotificationBell } from "@/components/NotificationBell";

async function getToken(): Promise<string> {
  try {
    const { supabase } = await import("@/lib/supabaseClient");
    const { data: { session } } = await supabase.auth.getSession();
    if (session?.access_token) return session.access_token;
  } catch { /**/ }
  try {
    const s = localStorage.getItem("supabase.auth.token");
    if (s) return (JSON.parse(s) as { access_token?: string }).access_token ?? "";
  } catch { /**/ }
  return "";
}

async function getMyCompanyId(): Promise<string | null> {
  try {
    const { supabase } = await import("@/lib/supabaseClient");
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return null;
    const { data } = await supabase.from("profiles").select("company_id").eq("id", user.id).single();
    return (data as { company_id?: string } | null)?.company_id ?? null;
  } catch { return null; }
}

interface Score {
  overall_score: number; payment_behaviour_score: number; document_accuracy_score: number;
  shipment_performance_score: number; counterparty_quality_score: number;
  trade_consistency_score: number; exception_rate_score: number;
  risk_level: string; financing_readiness: string;
  recommended_limit: number; currency: string;
  score_reason: Record<string, number>; calculated_at: string;
}
interface Signal {
  id: string; signal_reference: string; signal_type: string;
  severity: string; status: string; description?: string; created_at: string;
}
interface Action {
  id: string; action_reference: string; action_type: string;
  priority: string; action_status: string; action_reason?: string; created_at: string;
}

const SEV_COLOR: Record<string, string> = {
  Critical: "bg-red-100 text-red-800", High: "bg-orange-100 text-orange-800",
  Medium: "bg-yellow-100 text-yellow-800", Low: "bg-blue-100 text-blue-800",
};
const READINESS_LABEL: Record<string, { color: string; description: string }> = {
  "Ready for Review": { color: "bg-green-100 text-green-800", description: "Your trade profile is strong. Our team will review financing options." },
  "Potentially Eligible": { color: "bg-teal-100 text-teal-800", description: "You may qualify for financing support. Keep building your trade history." },
  Monitor: { color: "bg-yellow-100 text-yellow-800", description: "Some areas need improvement before we can assess financing eligibility." },
  "Not Enough Data": { color: "bg-gray-100 text-gray-600", description: "Complete more trade cycles to generate your profile." },
  "Approved Internally": { color: "bg-green-200 text-green-900", description: "Financing has been internally approved. Our team will be in touch." },
  Rejected: { color: "bg-red-100 text-red-800", description: "Financing is not available at this time." },
};

function ScoreBar({ label, value, weight }: { label: string; value: number; weight: string }) {
  const pct = Math.max(0, Math.min(100, value ?? 0));
  const color = pct >= 75 ? "bg-green-500" : pct >= 50 ? "bg-yellow-500" : "bg-red-400";
  return (
    <div>
      <div className="flex justify-between text-xs text-gray-600 mb-1">
        <span>{label} <span className="text-gray-400">({weight})</span></span>
        <span className="font-medium">{pct.toFixed(0)}/100</span>
      </div>
      <div className="w-full bg-gray-100 rounded-full h-2">
        <div className={`h-2 rounded-full ${color} transition-all`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

export default function CompanyIntelligencePage() {
  const [score, setScore] = useState<Score | null>(null);
  const [signals, setSignals] = useState<Signal[]>([]);
  const [actions, setActions] = useState<Action[]>([]);
  const [loading, setLoading] = useState(true);
  const [companyId, setCompanyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const cid = await getMyCompanyId();
    setCompanyId(cid);
    if (!cid) { setLoading(false); return; }
    const token = await getToken();
    const h = { Authorization: `Bearer ${token}` };
    const [sc, sg, ac] = await Promise.all([
      fetch(`/api/intelligence/scores/${cid}`, { headers: h }).then(r => r.json()),
      fetch(`/api/intelligence/risk-signals?company_id=${cid}&status=Open&limit=10`, { headers: h }).then(r => r.json()),
      fetch(`/api/intelligence/actions?company_id=${cid}&action_status=Pending&limit=10`, { headers: h }).then(r => r.json()),
    ]);
    setScore(sc?.overall_score !== undefined ? sc : null);
    setSignals(Array.isArray(sg) ? sg : []);
    setActions(Array.isArray(ac) ? ac : []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const readinessInfo = READINESS_LABEL[score?.financing_readiness ?? ""] ?? READINESS_LABEL["Not Enough Data"];

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link href="/company/trade-chains" className="text-gray-500 hover:text-gray-700 text-sm">← Trade Chains</Link>
          <h1 className="text-xl font-bold text-gray-900">My Trade Intelligence</h1>
        </div>
        <div className="flex items-center gap-3"><NotificationBell /><LogoutButton /></div>
      </header>

      <main className="max-w-4xl mx-auto px-6 py-8 space-y-8">
        {loading && <p className="text-gray-400 text-sm">Loading your intelligence profile…</p>}

        {!loading && !companyId && (
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 text-yellow-800 text-sm">
            Company profile not found. Please contact support.
          </div>
        )}

        {/* Financing readiness banner */}
        {!loading && (
          <div className={`rounded-xl p-5 border ${score ? "bg-white border-gray-200" : "bg-gray-50 border-gray-200"}`}>
            <h2 className="text-lg font-semibold text-gray-800 mb-2">Financing Readiness</h2>
            <div className="flex items-center gap-3">
              <span className={`text-sm px-3 py-1 rounded-full font-medium ${readinessInfo.color}`}>
                {score?.financing_readiness ?? "Not Enough Data"}
              </span>
              <p className="text-sm text-gray-600">{readinessInfo.description}</p>
            </div>
            {score?.recommended_limit && score.recommended_limit > 0 && (
              <p className="text-xs text-gray-500 mt-2">
                Estimated capacity: <strong>{score.currency} {score.recommended_limit.toLocaleString()}</strong>.
                Trade capacity is an estimate only and is subject to credit review and approval.
              </p>
            )}
          </div>
        )}

        {/* Score breakdown */}
        {score && (
          <section className="bg-white border rounded-xl p-6">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-lg font-semibold text-gray-800">Your Trade Score</h2>
              <div className="text-4xl font-bold text-gray-900">{score.overall_score?.toFixed(0)}/100</div>
            </div>
            <div className="space-y-4">
              <ScoreBar label="Payment Behaviour" weight="30%" value={score.payment_behaviour_score} />
              <ScoreBar label="Document Accuracy" weight="20%" value={score.document_accuracy_score} />
              <ScoreBar label="Shipment Performance" weight="20%" value={score.shipment_performance_score} />
              <ScoreBar label="Counterparty Quality" weight="10%" value={score.counterparty_quality_score} />
              <ScoreBar label="Trade Consistency" weight="10%" value={score.trade_consistency_score} />
              <ScoreBar label="Exception Rate" weight="10%" value={score.exception_rate_score} />
            </div>
            <div className="mt-4 pt-4 border-t">
              <h3 className="text-sm font-medium text-gray-700 mb-2">How to improve</h3>
              <ul className="text-sm text-gray-600 space-y-1 list-disc list-inside">
                {(score.payment_behaviour_score ?? 0) < 70 && <li>Pay invoices on time to improve payment behaviour.</li>}
                {(score.document_accuracy_score ?? 0) < 70 && <li>Ensure uploaded documents are complete and verified.</li>}
                {(score.shipment_performance_score ?? 0) < 70 && <li>Resolve open shipment delays and submit PODs promptly.</li>}
                {(score.trade_consistency_score ?? 0) < 70 && <li>Complete more trade cycles to build a track record.</li>}
                {(score.exception_rate_score ?? 0) < 70 && <li>Reduce open disputes and exception flags.</li>}
              </ul>
            </div>
            <p className="text-xs text-gray-400 mt-3">
              Last updated {new Date(score.calculated_at).toLocaleDateString()}.
              Scores are informational only — no action can be taken automatically based on this score.
            </p>
          </section>
        )}

        {!score && !loading && (
          <section className="bg-white border rounded-xl p-6 text-center text-gray-400">
            <p className="text-sm">Not enough data to generate a trade score yet.</p>
            <p className="text-xs mt-1">Complete payments, upload documents, and finish shipments to build your profile.</p>
          </section>
        )}

        {/* Open signals */}
        {signals.length > 0 && (
          <section>
            <h2 className="text-lg font-semibold text-gray-800 mb-3">Items Requiring Attention</h2>
            <div className="space-y-2">
              {signals.map(s => (
                <div key={s.id} className="bg-white border rounded-lg p-4 flex items-start gap-3">
                  <span className={`mt-0.5 text-xs px-2 py-0.5 rounded-full shrink-0 ${SEV_COLOR[s.severity] ?? "bg-gray-100"}`}>
                    {s.severity}
                  </span>
                  <div>
                    <p className="text-sm font-medium text-gray-800">{s.signal_type}</p>
                    {s.description && <p className="text-xs text-gray-500 mt-0.5">{s.description}</p>}
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Recommended actions */}
        {actions.length > 0 && (
          <section>
            <h2 className="text-lg font-semibold text-gray-800 mb-3">Recommended Actions</h2>
            <div className="space-y-2">
              {actions.map(a => (
                <div key={a.id} className="bg-white border rounded-lg p-4 flex items-start gap-3">
                  <span className={`mt-0.5 text-xs px-2 py-0.5 rounded-full shrink-0 ${SEV_COLOR[a.priority] ?? "bg-gray-100"}`}>
                    {a.priority}
                  </span>
                  <div>
                    <p className="text-sm font-medium text-gray-800">{a.action_type}</p>
                    {a.action_reason && <p className="text-xs text-gray-500 mt-0.5">{a.action_reason}</p>}
                  </div>
                </div>
              ))}
            </div>
            <p className="text-xs text-gray-400 mt-2">
              These are system recommendations only. No action will be taken automatically.
              Contact your Nexum account manager if you have questions.
            </p>
          </section>
        )}

        {/* Quick links */}
        <section className="grid grid-cols-2 md:grid-cols-3 gap-3">
          {[
            { label: "Trade Chains", href: "/company/trade-chains" },
            { label: "TradeCycle Wallet", href: "/customer/tradecycle" },
            { label: "Vendor Credit", href: "/customer/vendor-credit" },
            { label: "Shipments", href: "/customer/shipments" },
            { label: "Documents", href: "/customer/tradeflow" },
          ].map(l => (
            <Link key={l.href} href={l.href}
              className="bg-white border rounded-lg px-4 py-3 text-sm text-blue-700 hover:bg-blue-50 text-center font-medium">
              {l.label}
            </Link>
          ))}
        </section>
      </main>
    </div>
  );
}
