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

interface Pack {
  id: string; evidence_pack_reference: string; pack_type: string;
  related_company_id?: string; report_status: string; created_at: string;
}

const STATUS_COLOR: Record<string, string> = {
  Draft: "bg-gray-100 text-gray-600",
  Generated: "bg-blue-100 text-blue-700",
  Reviewed: "bg-yellow-100 text-yellow-700",
  Shared: "bg-green-100 text-green-700",
  Archived: "bg-gray-200 text-gray-500",
};

const PACK_TYPES = [
  "Company Credit Report","Shipment Bundle Report","Trade Chain Report",
  "Financing Review Pack","Provider Performance Report",
  "Customer Payment Behaviour Report","Other",
];

export default function EvidencePacksPage() {
  const [packs, setPacks] = useState<Pack[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState("");
  const [filterType, setFilterType] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ pack_type: PACK_TYPES[0], related_company_id: "" });

  const load = useCallback(async () => {
    setLoading(true);
    const token = await getToken();
    const params = new URLSearchParams({ limit: "100" });
    if (filterStatus) params.set("report_status", filterStatus);
    if (filterType)   params.set("pack_type", filterType);
    const res = await fetch(`/api/intelligence/evidence-packs?${params}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await res.json();
    setPacks(Array.isArray(data) ? data : []);
    setLoading(false);
  }, [filterStatus, filterType]);

  useEffect(() => { load(); }, [load]);

  async function create() {
    if (!form.related_company_id) return;
    setCreating(true);
    const token = await getToken();
    await fetch("/api/intelligence/evidence-packs", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify(form),
    });
    setShowCreate(false);
    setForm({ pack_type: PACK_TYPES[0], related_company_id: "" });
    await load();
    setCreating(false);
  }

  async function updateStatus(reference: string, report_status: string) {
    const token = await getToken();
    await fetch(`/api/intelligence/evidence-packs/${reference}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ report_status }),
    });
    await load();
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link href="/admin/intelligence" className="text-gray-500 hover:text-gray-700 text-sm">← Intelligence</Link>
          <h1 className="text-xl font-bold text-gray-900">Evidence Packs</h1>
        </div>
        <div className="flex items-center gap-3">
          <button onClick={() => setShowCreate(true)}
            className="bg-blue-600 text-white text-sm px-4 py-2 rounded-lg hover:bg-blue-700">
            + New Pack
          </button>
          <NotificationBell /><LogoutButton />
        </div>
      </header>

      {showCreate && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-xl p-6 w-full max-w-md space-y-4">
            <h3 className="text-lg font-semibold">New Evidence Pack</h3>
            <div>
              <label className="block text-sm text-gray-600 mb-1">Pack Type</label>
              <select value={form.pack_type} onChange={e => setForm(f => ({ ...f, pack_type: e.target.value }))}
                className="w-full border rounded-lg px-3 py-2 text-sm">
                {PACK_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm text-gray-600 mb-1">Company ID</label>
              <input value={form.related_company_id} onChange={e => setForm(f => ({ ...f, related_company_id: e.target.value }))}
                placeholder="UUID…" className="w-full border rounded-lg px-3 py-2 text-sm" />
            </div>
            <div className="flex gap-3 pt-2">
              <button onClick={create} disabled={creating || !form.related_company_id}
                className="flex-1 bg-blue-600 text-white py-2 rounded-lg text-sm hover:bg-blue-700 disabled:opacity-50">
                {creating ? "Creating…" : "Create"}
              </button>
              <button onClick={() => setShowCreate(false)}
                className="flex-1 border py-2 rounded-lg text-sm hover:bg-gray-50">Cancel</button>
            </div>
          </div>
        </div>
      )}

      <main className="max-w-6xl mx-auto px-6 py-8">
        <div className="flex flex-wrap gap-3 mb-6">
          <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}
            className="border rounded-lg px-3 py-2 text-sm bg-white">
            <option value="">All Statuses</option>
            {["Draft","Generated","Reviewed","Shared","Archived"].map(s => <option key={s} value={s}>{s}</option>)}
          </select>
          <select value={filterType} onChange={e => setFilterType(e.target.value)}
            className="border rounded-lg px-3 py-2 text-sm bg-white">
            <option value="">All Types</option>
            {PACK_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>

        <div className="bg-white border rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-600">
              <tr>
                <th className="px-4 py-3 text-left">Reference</th>
                <th className="px-4 py-3 text-left">Type</th>
                <th className="px-4 py-3 text-left">Company</th>
                <th className="px-4 py-3 text-left">Status</th>
                <th className="px-4 py-3 text-left">Created</th>
                <th className="px-4 py-3 text-left">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {loading && <tr><td colSpan={6} className="px-4 py-6 text-center text-gray-400">Loading…</td></tr>}
              {!loading && packs.length === 0 && (
                <tr><td colSpan={6} className="px-4 py-6 text-center text-gray-400">No evidence packs found.</td></tr>
              )}
              {packs.map(p => (
                <tr key={p.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-mono text-xs">{p.evidence_pack_reference}</td>
                  <td className="px-4 py-3 text-sm">{p.pack_type}</td>
                  <td className="px-4 py-3 text-xs text-gray-500 font-mono">
                    {p.related_company_id
                      ? <Link href={`/admin/intelligence/company/${p.related_company_id}`} className="text-blue-600 hover:underline">
                          {p.related_company_id.slice(0, 8)}…
                        </Link>
                      : "—"}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`text-xs px-2 py-0.5 rounded-full ${STATUS_COLOR[p.report_status] ?? "bg-gray-100"}`}>
                      {p.report_status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-xs text-gray-500">{new Date(p.created_at).toLocaleDateString()}</td>
                  <td className="px-4 py-3">
                    <div className="flex gap-2">
                      {p.report_status === "Generated" && (
                        <button onClick={() => updateStatus(p.evidence_pack_reference, "Reviewed")}
                          className="text-xs text-yellow-700 hover:underline">Review</button>
                      )}
                      {p.report_status === "Reviewed" && (
                        <button onClick={() => updateStatus(p.evidence_pack_reference, "Shared")}
                          className="text-xs text-green-700 hover:underline">Share</button>
                      )}
                      {p.report_status !== "Archived" && (
                        <button onClick={() => updateStatus(p.evidence_pack_reference, "Archived")}
                          className="text-xs text-gray-400 hover:underline">Archive</button>
                      )}
                    </div>
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
