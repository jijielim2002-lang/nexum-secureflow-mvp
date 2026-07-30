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

interface Entity {
  id: string; entity_type: string; source_table?: string; source_id?: string;
  canonical_name: string; normalized_key?: string; created_at: string;
}

export default function EntitiesPage() {
  const [entities, setEntities] = useState<Entity[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filterType, setFilterType] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    const token = await getToken();
    const params = new URLSearchParams({ limit: "200" });
    if (search)     params.set("search", search);
    if (filterType) params.set("entity_type", filterType);
    const res = await fetch(`/api/intelligence/entities?${params}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await res.json();
    setEntities(Array.isArray(data) ? data : []);
    setLoading(false);
  }, [search, filterType]);

  useEffect(() => { const t = setTimeout(load, 300); return () => clearTimeout(t); }, [load]);

  const TYPES = [
    "Company","Person","Document","Shipment","Shipment Leg","Trade Chain",
    "Payment Obligation","Invoice","Product","Other",
  ];

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link href="/admin/intelligence" className="text-gray-500 hover:text-gray-700 text-sm">← Intelligence</Link>
          <h1 className="text-xl font-bold text-gray-900">Entity Registry</h1>
        </div>
        <div className="flex items-center gap-3"><NotificationBell /><LogoutButton /></div>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-8">
        <div className="flex flex-wrap gap-3 mb-6">
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search name…"
            className="border rounded-lg px-3 py-2 text-sm w-56 bg-white" />
          <select value={filterType} onChange={e => setFilterType(e.target.value)}
            className="border rounded-lg px-3 py-2 text-sm bg-white">
            <option value="">All Types</option>
            {TYPES.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>

        <div className="bg-white border rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-600">
              <tr>
                <th className="px-4 py-3 text-left">Canonical Name</th>
                <th className="px-4 py-3 text-left">Type</th>
                <th className="px-4 py-3 text-left">Source Table</th>
                <th className="px-4 py-3 text-left">Source ID</th>
                <th className="px-4 py-3 text-left">Normalized Key</th>
                <th className="px-4 py-3 text-left">Created</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {loading && <tr><td colSpan={7} className="px-4 py-6 text-center text-gray-400">Loading…</td></tr>}
              {!loading && entities.length === 0 && (
                <tr><td colSpan={7} className="px-4 py-6 text-center text-gray-400">No entities found.</td></tr>
              )}
              {entities.map(e => (
                <tr key={e.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium text-gray-900">{e.canonical_name}</td>
                  <td className="px-4 py-3">
                    <span className="text-xs bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded-full">{e.entity_type}</span>
                  </td>
                  <td className="px-4 py-3 text-gray-500 text-xs">{e.source_table ?? "—"}</td>
                  <td className="px-4 py-3 text-gray-500 text-xs font-mono">{e.source_id?.slice(0, 8) ?? "—"}</td>
                  <td className="px-4 py-3 text-gray-500 text-xs">{e.normalized_key ?? "—"}</td>
                  <td className="px-4 py-3 text-gray-400 text-xs">{new Date(e.created_at).toLocaleDateString()}</td>
                  <td className="px-4 py-3">
                    <Link href={`/admin/intelligence/entities/${e.id}`}
                      className="text-blue-600 hover:underline text-xs">Detail</Link>
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
