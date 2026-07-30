"use client";
import { useState, useEffect, useCallback, use } from "react";
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

interface Score {
  overall_score: number; payment_behaviour_score: number; document_accuracy_score: number;
  shipment_performance_score: number; counterparty_quality_score: number;
  trade_consistency_score: number; exception_rate_score: number;
  risk_level: string; financing_readiness: string; recommended_limit: number;
  currency: string; score_reason: Record<string, number>; calculated_at: string;
}
interface Signal {
  id: string; signal_reference: string; signal_type: string;
  severity: string; status: string; description?: string; created_at: string;
}
interface Action {
  id: string; action_reference: string; action_type: string;
  priority: string; action_status: string; action_reason?: string; created_at: string;
}
interface Pack {
  id: string; evidence_pack_reference: string; pack_type: string;
  report_status: string; created_at: string;
}

const SEV_COLOR: Record<string, string> = {
  Critical: "bg-red-100 text-red-800", High: "bg-orange-100 text-orange-800",
  Medium: "bg-yellow-100 text-yellow-800", Low: "bg-blue-100 text-blue-800",
};
const READINESS_COLOR: Record<string, string> = {
  "Ready for Review": "bg-green-100 text-green-800",
  "Potentially Eligible": "bg-teal-100 text-teal-800",
  Monitor: "bg-yellow-100 text-yellow-800",
  "Not Enough Data": "bg-gray-100 text-gray-600",
  Rejected: "bg-red-100 text-red-800",
};

function ScoreBar({ label, value }: { label: string; value: number }) {
  const pct = Math.max(0, Math.min(100, value ?? 0));
  return (
    <div>
      <div className="flex justify-between text-xs text-gray-600 mb-1">
        <span>{label}</span><span>{pct.toFixed(0)}</span>
      </div>
      <div className="w-full bg-gray-200 rounded-full h-2">
        <div className="h-2 rounded-full bg-blue-500 transition-all" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

export default function CompanyIntelligencePage({ params }: { params: Promise<{ company_id: string }> }) {
  const { company_id } = use(params);
  const [score, setScore] = useState<Score | null>(null);
  const [signals, setSignals] = useState<Signal[]>([]);
  const [actions, setActions] = useState<Action[]>([]);
  const [packs, setPacks] = useState<Pack[]>([]);
  const [loading, setLoading] = useState(true);
  const [recomputing, setRecomputing] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const token = await getToken();
    const h = { Authorization: `Bearer ${token}` };
    const [sc, sg, ac, pk] = await Promise.all([
      fetch(`/api/intelligence/scores/${company_id}`, { headers: h }).then(r => r.json()),
      fetch(`/api/intelligence/risk-signals?company_id=${company_id}&limit=20`, { headers: h }).then(r => r.json()),
      fetch(`/api/intelligence/actions?company_id=${company_id}&limit=20`, { headers: h }).then(r => r.json()),
      fetch(`/api/intelligence/evidence-packs?company_id=${company_id}`, { headers: h }).then(r => r.json()),
    ]);
    setScore(sc?.score === null ? null : (sc?.overall_score !== undefined ? sc : null));
    setSignals(Array.isArray(sg) ? sg : []);
    setActions(Array.isArray(ac) ? ac : []);
    setPacks(Array.isArray(pk) ? pk : []);
    setLoading(false);
  }, [company_id]);

  useEffect(() => { load(); }, [load]);

  async function recompute() {
    setRecomputing(true);
    const token = await getToken();
    await fetch("/api/intelligence/scores", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ company_id }),
    });
    await load();
    setRecomputing(false);
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link href="/admin/intelligence" className="text-gray-500 hover:text-gray-700 text-sm">← Intelligence</Link>
          <h1 className="text-xl font-bold text-gray-900">Company Intelligence</h1>
          <span className="text-xs text-gray-400 font-mono">{company_id}</span>
        </div>
        <div className="flex items-center gap-3"><NotificationBell /><LogoutButton /></div>
      </header>

      <main className="max-w-5xl mx-auto px-6 py-8 space-y-8">
        {loading && <p className="text-gray-400 text-sm">Loading…</p>}

        {/* Score card */}
        <section className="bg-white border rounded-xl p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-gray-800">Intelligence Score</h2>
            <button onClick={recompute} disabled={recomputing}
              className="text-sm bg-blue-600 text-white px-4 py-1.5 rounded-lg hover:bg-blue-700 disabled:opacity-50">
              {recomputing ? "Recomputing…" : "Recompute"}
            </button>
          </div>
          {!score && !loading && (
            <p className="text-gray-400 text-sm">Not enough data. Run recompute once some payments/documents exist.</p>
          )}
          {score && (
            <div className="grid md:grid-cols-2 gap-6">
              <div className="flex items-center gap-4">
                <div className="text-5xl font-bold text-gray-900">{score.overall_score?.toFixed(0)}</div>
                <div>
                  <span className={`text-xs px-2 py-0.5 rounded-full ${SEV_COLOR[score.risk_level] ?? "bg-gray-100"}`}>
                    {score.risk_level}
                  </span>
                  <div className="mt-1">
                    <span className={`text-xs px-2 py-0.5 rounded-full ${READINESS_COLOR[score.financing_readiness] ?? "bg-gray-100"}`}>
                      {score.financing_readiness}
                    </span>
                  </div>
                  {score.recommended_limit > 0 && (
                    <p className="text-xs text-gray-500 mt-1">
                      Suggested limit: {score.currency} {score.recommended_limit.toLocaleString()}
                    </p>
                  )}
                </div>
              </div>
              <div className="space-y-3">
                <ScoreBar label="Payment Behaviour (30%)" value={score.payment_behaviour_score} />
                <ScoreBar label="Document Accuracy (20%)" value={score.document_accuracy_score} />
                <ScoreBar label="Shipment Performance (20%)" value={score.shipment_performance_score} />
                <ScoreBar label="Counterparty Quality (10%)" value={score.counterparty_quality_score} />
                <ScoreBar label="Trade Consistency (10%)" value={score.trade_consistency_score} />
                <ScoreBar label="Exception Rate (10%)" value={score.exception_rate_score} />
              </div>
            </div>
          )}
          {score && (
            <p className="text-xs text-gray-400 mt-4">
              Calculated {new Date(score.calculated_at).toLocaleString()}. Trade capacity and financing readiness are estimates only. No AI recommendation can directly move money.
            </p>
          )}
        </section>

        {/* Risk signals */}
        <section>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-lg font-semibold text-gray-800">Risk Signals</h2>
            <Link href={`/admin/intelligence/risk-signals?company_id=${company_id}`}
              className="text-sm text-blue-600 hover:underline">View all →</Link>
          </div>
          <div className="bg-white border rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-gray-600">
                <tr>
                  <th className="px-4 py-3 text-left">Reference</th>
                  <th className="px-4 py-3 text-left">Type</th>
                  <th className="px-4 py-3 text-left">Severity</th>
                  <th className="px-4 py-3 text-left">Status</th>
                  <th className="px-4 py-3 text-left">Created</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {signals.length === 0 && <tr><td colSpan={5} className="px-4 py-5 text-center text-gray-400">No signals.</td></tr>}
                {signals.map(s => (
                  <tr key={s.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-mono text-xs">{s.signal_reference}</td>
                    <td className="px-4 py-3">{s.signal_type}</td>
                    <td className="px-4 py-3">
                      <span className={`text-xs px-2 py-0.5 rounded-full ${SEV_COLOR[s.severity] ?? ""}`}>{s.severity}</span>
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-600">{s.status}</td>
                    <td className="px-4 py-3 text-xs text-gray-500">{new Date(s.created_at).toLocaleDateString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* Actions */}
        <section>
          <h2 className="text-lg font-semibold text-gray-800 mb-3">Recommended Actions</h2>
          <div className="bg-white border rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-gray-600">
                <tr>
                  <th className="px-4 py-3 text-left">Reference</th>
                  <th className="px-4 py-3 text-left">Type</th>
                  <th className="px-4 py-3 text-left">Priority</th>
                  <th className="px-4 py-3 text-left">Status</th>
                  <th className="px-4 py-3 text-left">Reason</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {actions.length === 0 && <tr><td colSpan={5} className="px-4 py-5 text-center text-gray-400">No actions.</td></tr>}
                {actions.map(a => (
                  <tr key={a.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-mono text-xs">{a.action_reference}</td>
                    <td className="px-4 py-3">{a.action_type}</td>
                    <td className="px-4 py-3">
                      <span className={`text-xs px-2 py-0.5 rounded-full ${SEV_COLOR[a.priority] ?? ""}`}>{a.priority}</span>
                    </td>
                    <td className="px-4 py-3 text-xs">{a.action_status}</td>
                    <td className="px-4 py-3 text-xs text-gray-500 max-w-xs truncate">{a.action_reason ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* Evidence packs */}
        <section>
          <h2 className="text-lg font-semibold text-gray-800 mb-3">Evidence Packs</h2>
          <div className="bg-white border rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-gray-600">
                <tr>
                  <th className="px-4 py-3 text-left">Reference</th>
                  <th className="px-4 py-3 text-left">Type</th>
                  <th className="px-4 py-3 text-left">Status</th>
                  <th className="px-4 py-3 text-left">Created</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {packs.length === 0 && <tr><td colSpan={4} className="px-4 py-5 text-center text-gray-400">No evidence packs.</td></tr>}
                {packs.map(p => (
                  <tr key={p.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-mono text-xs">{p.evidence_pack_reference}</td>
                    <td className="px-4 py-3">{p.pack_type}</td>
                    <td className="px-4 py-3 text-xs text-gray-600">{p.report_status}</td>
                    <td className="px-4 py-3 text-xs text-gray-500">{new Date(p.created_at).toLocaleDateString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </main>
    </div>
  );
}
