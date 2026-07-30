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

interface Action {
  id: string; action_reference: string; action_type: string;
  priority: string; action_status: string; action_reason?: string;
  related_company_id?: string; related_bundle_reference?: string;
  related_job_reference?: string; related_signal_reference?: string;
  created_at: string;
}

const PRIORITY_COLOR: Record<string, string> = {
  Critical: "bg-red-100 text-red-800",
  High: "bg-orange-100 text-orange-800",
  Medium: "bg-yellow-100 text-yellow-800",
  Low: "bg-blue-100 text-blue-800",
};

export default function RecommendedActionsPage() {
  const [actions, setActions] = useState<Action[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState("Pending");
  const [filterPriority, setFilterPriority] = useState("");
  const [updating, setUpdating] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const token = await getToken();
    const params = new URLSearchParams({ limit: "100" });
    if (filterStatus)   params.set("action_status", filterStatus);
    if (filterPriority) params.set("priority", filterPriority);
    const res = await fetch(`/api/intelligence/actions?${params}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await res.json();
    setActions(Array.isArray(data) ? data : []);
    setLoading(false);
  }, [filterStatus, filterPriority]);

  useEffect(() => { load(); }, [load]);

  async function updateAction(reference: string, action_status: string) {
    setUpdating(reference);
    const token = await getToken();
    await fetch(`/api/intelligence/actions/${reference}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ action_status }),
    });
    await load();
    setUpdating(null);
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link href="/admin/intelligence" className="text-gray-500 hover:text-gray-700 text-sm">← Intelligence</Link>
          <h1 className="text-xl font-bold text-gray-900">Recommended Actions</h1>
        </div>
        <div className="flex items-center gap-3"><NotificationBell /><LogoutButton /></div>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-8">
        <div className="flex flex-wrap gap-3 mb-6">
          <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}
            className="border rounded-lg px-3 py-2 text-sm bg-white">
            <option value="">All Statuses</option>
            {["Pending","Accepted","Rejected","Completed","Cancelled"].map(s =>
              <option key={s} value={s}>{s}</option>)}
          </select>
          <select value={filterPriority} onChange={e => setFilterPriority(e.target.value)}
            className="border rounded-lg px-3 py-2 text-sm bg-white">
            <option value="">All Priorities</option>
            {["Critical","High","Medium","Low"].map(p => <option key={p} value={p}>{p}</option>)}
          </select>
        </div>

        <div className="bg-white border rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-600">
              <tr>
                <th className="px-4 py-3 text-left">Reference</th>
                <th className="px-4 py-3 text-left">Type</th>
                <th className="px-4 py-3 text-left">Priority</th>
                <th className="px-4 py-3 text-left">Status</th>
                <th className="px-4 py-3 text-left">Reason</th>
                <th className="px-4 py-3 text-left">Created</th>
                <th className="px-4 py-3 text-left">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {loading && (
                <tr><td colSpan={7} className="px-4 py-6 text-center text-gray-400">Loading…</td></tr>
              )}
              {!loading && actions.length === 0 && (
                <tr><td colSpan={7} className="px-4 py-6 text-center text-gray-400">No actions found.</td></tr>
              )}
              {actions.map(a => (
                <tr key={a.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-mono text-xs text-gray-700">{a.action_reference}</td>
                  <td className="px-4 py-3 text-gray-800">{a.action_type}</td>
                  <td className="px-4 py-3">
                    <span className={`text-xs px-2 py-0.5 rounded-full ${PRIORITY_COLOR[a.priority] ?? ""}`}>{a.priority}</span>
                  </td>
                  <td className="px-4 py-3 text-gray-600 text-xs">{a.action_status}</td>
                  <td className="px-4 py-3 text-gray-500 max-w-xs truncate text-xs">{a.action_reason ?? "—"}</td>
                  <td className="px-4 py-3 text-gray-500 text-xs">{new Date(a.created_at).toLocaleDateString()}</td>
                  <td className="px-4 py-3">
                    {a.action_status === "Pending" && (
                      <div className="flex gap-2">
                        <button onClick={() => updateAction(a.action_reference, "Accepted")}
                          disabled={updating === a.action_reference}
                          className="text-xs text-green-700 hover:underline disabled:opacity-50">Accept</button>
                        <button onClick={() => updateAction(a.action_reference, "Rejected")}
                          disabled={updating === a.action_reference}
                          className="text-xs text-red-600 hover:underline disabled:opacity-50">Reject</button>
                      </div>
                    )}
                    {a.action_status === "Accepted" && (
                      <button onClick={() => updateAction(a.action_reference, "Completed")}
                        disabled={updating === a.action_reference}
                        className="text-xs text-blue-700 hover:underline disabled:opacity-50">Complete</button>
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
