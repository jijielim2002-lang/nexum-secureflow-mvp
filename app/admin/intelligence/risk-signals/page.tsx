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

interface Signal {
  id: string; signal_reference: string; signal_type: string;
  severity: string; status: string; description?: string;
  related_company_id?: string; related_bundle_reference?: string;
  related_job_reference?: string; created_at: string;
}

const SEV_COLOR: Record<string, string> = {
  Critical: "bg-red-100 text-red-800",
  High: "bg-orange-100 text-orange-800",
  Medium: "bg-yellow-100 text-yellow-800",
  Low: "bg-blue-100 text-blue-800",
};
const STATUS_COLOR: Record<string, string> = {
  Open: "bg-red-50 text-red-700",
  "In Review": "bg-yellow-50 text-yellow-700",
  Resolved: "bg-green-50 text-green-700",
  Waived: "bg-gray-50 text-gray-600",
  "False Positive": "bg-gray-50 text-gray-500",
};

export default function RiskSignalsPage() {
  const [signals, setSignals] = useState<Signal[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterSeverity, setFilterSeverity] = useState("");
  const [filterStatus, setFilterStatus] = useState("Open");
  const [updating, setUpdating] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const token = await getToken();
    const params = new URLSearchParams({ limit: "100" });
    if (filterSeverity) params.set("severity", filterSeverity);
    if (filterStatus)   params.set("status", filterStatus);
    const res = await fetch(`/api/intelligence/risk-signals?${params}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await res.json();
    setSignals(Array.isArray(data) ? data : []);
    setLoading(false);
  }, [filterSeverity, filterStatus]);

  useEffect(() => { load(); }, [load]);

  async function updateStatus(reference: string, status: string) {
    setUpdating(reference);
    const token = await getToken();
    await fetch(`/api/intelligence/risk-signals/${reference}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ status }),
    });
    await load();
    setUpdating(null);
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link href="/admin/intelligence" className="text-gray-500 hover:text-gray-700 text-sm">← Intelligence</Link>
          <h1 className="text-xl font-bold text-gray-900">Risk Signals</h1>
        </div>
        <div className="flex items-center gap-3"><NotificationBell /><LogoutButton /></div>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-8">
        {/* Filters */}
        <div className="flex flex-wrap gap-3 mb-6">
          <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}
            className="border rounded-lg px-3 py-2 text-sm bg-white">
            <option value="">All Statuses</option>
            {["Open","In Review","Resolved","Waived","False Positive"].map(s =>
              <option key={s} value={s}>{s}</option>)}
          </select>
          <select value={filterSeverity} onChange={e => setFilterSeverity(e.target.value)}
            className="border rounded-lg px-3 py-2 text-sm bg-white">
            <option value="">All Severities</option>
            {["Critical","High","Medium","Low"].map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>

        <div className="bg-white border rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-600">
              <tr>
                <th className="px-4 py-3 text-left">Reference</th>
                <th className="px-4 py-3 text-left">Type</th>
                <th className="px-4 py-3 text-left">Severity</th>
                <th className="px-4 py-3 text-left">Status</th>
                <th className="px-4 py-3 text-left">Description</th>
                <th className="px-4 py-3 text-left">Created</th>
                <th className="px-4 py-3 text-left">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {loading && (
                <tr><td colSpan={7} className="px-4 py-6 text-center text-gray-400">Loading…</td></tr>
              )}
              {!loading && signals.length === 0 && (
                <tr><td colSpan={7} className="px-4 py-6 text-center text-gray-400">No signals found.</td></tr>
              )}
              {signals.map(s => (
                <tr key={s.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-mono text-xs text-gray-700">{s.signal_reference}</td>
                  <td className="px-4 py-3 text-gray-800">{s.signal_type}</td>
                  <td className="px-4 py-3">
                    <span className={`text-xs px-2 py-0.5 rounded-full ${SEV_COLOR[s.severity] ?? ""}`}>{s.severity}</span>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`text-xs px-2 py-0.5 rounded-full ${STATUS_COLOR[s.status] ?? ""}`}>{s.status}</span>
                  </td>
                  <td className="px-4 py-3 text-gray-600 max-w-xs truncate">{s.description ?? "—"}</td>
                  <td className="px-4 py-3 text-gray-500 text-xs">{new Date(s.created_at).toLocaleDateString()}</td>
                  <td className="px-4 py-3">
                    {s.status === "Open" && (
                      <div className="flex gap-2">
                        <button onClick={() => updateStatus(s.signal_reference, "In Review")}
                          disabled={updating === s.signal_reference}
                          className="text-xs text-yellow-700 hover:underline disabled:opacity-50">
                          Review
                        </button>
                        <button onClick={() => updateStatus(s.signal_reference, "Resolved")}
                          disabled={updating === s.signal_reference}
                          className="text-xs text-green-700 hover:underline disabled:opacity-50">
                          Resolve
                        </button>
                        <button onClick={() => updateStatus(s.signal_reference, "False Positive")}
                          disabled={updating === s.signal_reference}
                          className="text-xs text-gray-500 hover:underline disabled:opacity-50">
                          FP
                        </button>
                      </div>
                    )}
                    {s.status === "In Review" && (
                      <button onClick={() => updateStatus(s.signal_reference, "Resolved")}
                        disabled={updating === s.signal_reference}
                        className="text-xs text-green-700 hover:underline disabled:opacity-50">
                        Resolve
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </main>
    </div>
  );
}
