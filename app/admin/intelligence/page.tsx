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

interface IngestionEvent {
  id: string; source_module: string; event_type: string;
  processing_status: string; created_at: string;
}
interface Signal {
  id: string; signal_reference: string; signal_type: string;
  severity: string; status: string; created_at: string;
  related_company_id?: string;
}
interface Action {
  id: string; action_reference: string; action_type: string;
  priority: string; action_status: string; created_at: string;
}
interface Score {
  id: string; company_id: string; overall_score: number;
  financing_readiness: string; risk_level: string; calculated_at: string;
  companies?: { company_name?: string };
}

const SEVERITY_COLOR: Record<string, string> = {
  Critical: "bg-red-100 text-red-800",
  High: "bg-orange-100 text-orange-800",
  Medium: "bg-yellow-100 text-yellow-800",
  Low: "bg-blue-100 text-blue-800",
};
const READINESS_COLOR: Record<string, string> = {
  "Ready for Review": "bg-green-100 text-green-800",
  "Potentially Eligible": "bg-teal-100 text-teal-800",
  Monitor: "bg-yellow-100 text-yellow-800",
  "Not Enough Data": "bg-gray-100 text-gray-600",
  Rejected: "bg-red-100 text-red-800",
};

export default function IntelligenceDashboard() {
  const [ingest, setIngest] = useState<IngestionEvent[]>([]);
  const [signals, setSignals] = useState<Signal[]>([]);
  const [actions, setActions] = useState<Action[]>([]);
  const [scores, setScores] = useState<Score[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const token = await getToken();
      const h = { Authorization: `Bearer ${token}` };
      const [i, sg, ac, sc] = await Promise.all([
        fetch("/api/intelligence/ingest?limit=10", { headers: h }).then(r => r.json()),
        fetch("/api/intelligence/risk-signals?status=Open&limit=20", { headers: h }).then(r => r.json()),
        fetch("/api/intelligence/actions?action_status=Pending&limit=20", { headers: h }).then(r => r.json()),
        fetch("/api/intelligence/scores?limit=10", { headers: h }).then(r => r.json()),
      ]);
      setIngest(Array.isArray(i) ? i : []);
      setSignals(Array.isArray(sg) ? sg : []);
      setActions(Array.isArray(ac) ? ac : []);
      setScores(Array.isArray(sc) ? sc : []);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const openSignalsBySeverity = (sev: string) =>
    signals.filter(s => s.severity === sev && s.status === "Open").length;

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link href="/admin" className="text-gray-500 hover:text-gray-700 text-sm">← Admin</Link>
          <h1 className="text-xl font-bold text-gray-900">Intelligence Dashboard</h1>
        </div>
        <div className="flex items-center gap-3">
          <NotificationBell />
          <LogoutButton />
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-8 space-y-8">
        {error && <div className="bg-red-50 text-red-700 p-4 rounded-lg text-sm">{error}</div>}
        {loading && <p className="text-gray-500 text-sm">Loading intelligence data…</p>}

        {/* Quick nav */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          {[
            { label: "Entities", href: "/admin/intelligence/entities" },
            { label: "Risk Signals", href: "/admin/intelligence/risk-signals" },
            { label: "Actions", href: "/admin/intelligence/recommended-actions" },
            { label: "Evidence Packs", href: "/admin/intelligence/evidence-packs" },
            { label: "Ingest Log", href: "/admin/intelligence/ingest" },
          ].map(l => (
            <Link key={l.href} href={l.href}
              className="bg-white border rounded-lg px-4 py-3 text-sm font-medium text-blue-700 hover:bg-blue-50 text-center">
              {l.label}
            </Link>
          ))}
        </div>

        {/* Signal summary */}
        <section>
          <h2 className="text-lg font-semibold text-gray-800 mb-3">Open Risk Signals</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {["Critical","High","Medium","Low"].map(sev => (
              <div key={sev} className="bg-white border rounded-lg p-5 text-center">
                <p className="text-3xl font-bold text-gray-900">{openSignalsBySeverity(sev)}</p>
                <span className={`mt-1 inline-block text-xs font-medium px-2 py-0.5 rounded-full ${SEVERITY_COLOR[sev]}`}>{sev}</span>
              </div>
            ))}
          </div>
        </section>

        {/* Score distribution */}
        <section>
          <h2 className="text-lg font-semibold text-gray-800 mb-3">Latest Company Scores</h2>
          <div className="bg-white border rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-gray-600">
                <tr>
                  <th className="px-4 py-3 text-left">Company</th>
                  <th className="px-4 py-3 text-left">Score</th>
                  <th className="px-4 py-3 text-left">Risk</th>
                  <th className="px-4 py-3 text-left">Financing Readiness</th>
                  <th className="px-4 py-3 text-left">Calculated</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {scores.length === 0 && (
                  <tr><td colSpan={6} className="px-4 py-6 text-center text-gray-400">No score records yet.</td></tr>
                )}
                {scores.map(sc => (
                  <tr key={sc.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-medium text-gray-900">
                      {(sc as unknown as Record<string, unknown> & { companies?: { name?: string } })?.companies?.name ?? sc.company_id.slice(0, 8)}
                    </td>
                    <td className="px-4 py-3 font-bold">{sc.overall_score?.toFixed(1) ?? "–"}</td>
                    <td className="px-4 py-3">
                      <span className={`text-xs px-2 py-0.5 rounded-full ${SEVERITY_COLOR[sc.risk_level] ?? "bg-gray-100 text-gray-600"}`}>
                        {sc.risk_level}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`text-xs px-2 py-0.5 rounded-full ${READINESS_COLOR[sc.financing_readiness] ?? "bg-gray-100 text-gray-600"}`}>
                        {sc.financing_readiness}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-500">{new Date(sc.calculated_at).toLocaleDateString()}</td>
                    <td className="px-4 py-3">
                      <Link href={`/admin/intelligence/company/${sc.company_id}`}
                        className="text-blue-600 hover:underline text-xs">View</Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* Pending actions */}
        <section>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-lg font-semibold text-gray-800">Pending Actions</h2>
            <Link href="/admin/intelligence/recommended-actions" className="text-sm text-blue-600 hover:underline">View all →</Link>
          </div>
          <div className="bg-white border rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-gray-600">
                <tr>
                  <th className="px-4 py-3 text-left">Reference</th>
                  <th className="px-4 py-3 text-left">Type</th>
                  <th className="px-4 py-3 text-left">Priority</th>
                  <th className="px-4 py-3 text-left">Created</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {actions.length === 0 && (
                  <tr><td colSpan={4} className="px-4 py-6 text-center text-gray-400">No pending actions.</td></tr>
                )}
                {actions.slice(0, 8).map(a => (
                  <tr key={a.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-mono text-xs text-gray-700">{a.action_reference}</td>
                    <td className="px-4 py-3">{a.action_type}</td>
                    <td className="px-4 py-3">
                      <span className={`text-xs px-2 py-0.5 rounded-full ${SEVERITY_COLOR[a.priority] ?? "bg-gray-100"}`}>{a.priority}</span>
                    </td>
                    <td className="px-4 py-3 text-gray-500">{new Date(a.created_at).toLocaleDateString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* Ingestion health */}
        <section>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-lg font-semibold text-gray-800">Recent Ingestion Events</h2>
          </div>
          <div className="bg-white border rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-gray-600">
                <tr>
                  <th className="px-4 py-3 text-left">Module</th>
                  <th className="px-4 py-3 text-left">Event</th>
                  <th className="px-4 py-3 text-left">Status</th>
                  <th className="px-4 py-3 text-left">Time</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {ingest.length === 0 && (
                  <tr><td colSpan={4} className="px-4 py-6 text-center text-gray-400">No ingestion events yet.</td></tr>
                )}
                {ingest.map(ev => (
                  <tr key={ev.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-medium">{ev.source_module}</td>
                    <td className="px-4 py-3 text-gray-600">{ev.event_type}</td>
                    <td className="px-4 py-3">
                      <span className={`text-xs px-2 py-0.5 rounded-full ${
                        ev.processing_status === "Actioned" ? "bg-green-100 text-green-800" :
                        ev.processing_status === "Failed" ? "bg-red-100 text-red-800" :
                        ev.processing_status === "Needs Review" ? "bg-orange-100 text-orange-800" :
                        "bg-gray-100 text-gray-600"
                      }`}>{ev.processing_status}</span>
                    </td>
                    <td className="px-4 py-3 text-gray-500 text-xs">{new Date(ev.created_at).toLocaleString()}</td>
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
