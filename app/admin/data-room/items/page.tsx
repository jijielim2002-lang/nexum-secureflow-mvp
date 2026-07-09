"use client";

// ─── /admin/data-room/items ───────────────────────────────────────────────────
// Full list of all data room items with filters and bulk actions.

import { useEffect, useState, useCallback } from "react";
import { createClient } from "@supabase/supabase-js";
import Link from "next/link";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
);

interface DataRoomItem {
  id: string;
  item_name: string;
  item_category: string;
  item_type: string;
  item_status: string;
  source_type: string;
  source_id: string | null;
  source_url: string | null;
  item_description: string | null;
  notes: string | null;
  prepared_by_name: string | null;
  last_reviewed_at: string | null;
  next_review_date: string | null;
  is_confidential: boolean;
  created_at: string;
  updated_at: string;
}

const STATUS_BG: Record<string, string> = {
  "Ready":        "bg-emerald-400/10 text-emerald-400 border-emerald-400/20",
  "Draft":        "bg-yellow-400/10 text-yellow-400 border-yellow-400/20",
  "Needs Update": "bg-orange-400/10 text-orange-400 border-orange-400/20",
  "Archived":     "bg-slate-700 text-slate-400 border-slate-600",
};

export default function DataRoomItemsPage() {
  const [items,        setItems]        = useState<DataRoomItem[]>([]);
  const [loading,      setLoading]      = useState(true);
  const [error,        setError]        = useState<string | null>(null);
  const [token,        setToken]        = useState<string | null>(null);
  const [role,         setRole]         = useState<string | null>(null);
  const [filterStatus, setFilterStatus] = useState("");
  const [filterCat,    setFilterCat]    = useState("");
  const [search,       setSearch]       = useState("");
  const [showArchived, setShowArchived] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) { setError("Not authenticated"); setLoading(false); return; }
      setToken(session.access_token);
      supabase.from("profiles").select("role").eq("id", session.user.id).single()
        .then(({ data: p }) => setRole(p?.role ?? null));
    });
  }, []);

  const fetchItems = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const res = await fetch("/api/fundraising-data-room?limit=500", {
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = await res.json();
      if (!res.ok) { setError(json.error ?? "Failed"); return; }
      setItems(json.data ?? []);
    } catch { setError("Network error"); }
    finally { setLoading(false); }
  }, [token]);

  useEffect(() => { if (token) fetchItems(); }, [token, fetchItems]);

  const updateStatus = useCallback(async (id: string, newStatus: string) => {
    if (!token) return;
    const action = newStatus === "Archived" ? "archive" :
                   newStatus === "Ready"    ? "mark_ready" :
                   newStatus === "Needs Update" ? "mark_needs_update" : undefined;
    await fetch(`/api/fundraising-data-room/${id}`, {
      method: "PATCH",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(action ? { action } : { item_status: newStatus }),
    });
    fetchItems();
  }, [token, fetchItems]);

  if (loading) return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center">
      <div className="text-slate-400 animate-pulse">Loading items…</div>
    </div>
  );
  if (error || role !== "admin") return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center">
      <div className="text-red-400">{error ?? "Access restricted."}</div>
    </div>
  );

  const categories = [...new Set(items.map(i => i.item_category))].sort();
  const filtered = items.filter(i => {
    if (!showArchived && i.item_status === "Archived") return false;
    if (filterStatus && i.item_status !== filterStatus) return false;
    if (filterCat    && i.item_category !== filterCat)  return false;
    if (search && !i.item_name.toLowerCase().includes(search.toLowerCase()) &&
        !(i.item_description ?? "").toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  return (
    <div className="min-h-screen bg-slate-950 text-slate-200 p-6">
      {/* Header */}
      <div className="mb-6 flex items-start justify-between flex-wrap gap-4">
        <div>
          <div className="flex items-center gap-2 text-xs text-slate-500 mb-1">
            <Link href="/admin" className="hover:text-slate-300">Admin</Link>
            <span>/</span>
            <Link href="/admin/data-room" className="hover:text-slate-300">Data Room</Link>
            <span>/</span>
            <span className="text-slate-300">All Items</span>
          </div>
          <h1 className="text-2xl font-bold text-slate-100">Data Room Items</h1>
          <p className="text-sm text-slate-500 mt-1">{filtered.length} of {items.length} items shown</p>
        </div>
        <Link
          href="/admin/data-room/items/new"
          className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-medium transition-colors"
        >
          + Add Item
        </Link>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 mb-4 flex-wrap">
        <input
          type="text"
          placeholder="Search items…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="px-3 py-1.5 rounded bg-slate-800 border border-slate-700 text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:border-indigo-500 w-48"
        />
        <select
          value={filterStatus}
          onChange={e => setFilterStatus(e.target.value)}
          className="px-3 py-1.5 rounded bg-slate-800 border border-slate-700 text-sm text-slate-200 focus:outline-none focus:border-indigo-500"
        >
          <option value="">All Statuses</option>
          {["Ready","Draft","Needs Update","Archived"].map(s => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
        <select
          value={filterCat}
          onChange={e => setFilterCat(e.target.value)}
          className="px-3 py-1.5 rounded bg-slate-800 border border-slate-700 text-sm text-slate-200 focus:outline-none focus:border-indigo-500"
        >
          <option value="">All Categories</option>
          {categories.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        <label className="flex items-center gap-2 text-sm text-slate-400 cursor-pointer">
          <input
            type="checkbox"
            checked={showArchived}
            onChange={e => setShowArchived(e.target.checked)}
            className="rounded"
          />
          Show archived
        </label>
      </div>

      {/* Table */}
      {filtered.length === 0 ? (
        <div className="text-center py-16 text-slate-500">
          <p className="text-lg mb-2">No items found.</p>
          <Link href="/admin/data-room/items/new" className="text-indigo-400 hover:text-indigo-300">
            Add your first item →
          </Link>
        </div>
      ) : (
        <div className="bg-slate-900 rounded-xl border border-slate-800 overflow-hidden">
          <table className="w-full text-xs">
            <thead className="border-b border-slate-800">
              <tr className="text-slate-500">
                <th className="text-left p-3 font-medium">Item Name</th>
                <th className="text-left p-3 font-medium">Category</th>
                <th className="text-left p-3 font-medium">Type</th>
                <th className="text-left p-3 font-medium">Status</th>
                <th className="text-left p-3 font-medium">Source</th>
                <th className="text-left p-3 font-medium">Prepared By</th>
                <th className="text-left p-3 font-medium">Next Review</th>
                <th className="text-left p-3 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(item => {
                const overdueReview = item.next_review_date && new Date(item.next_review_date) < new Date();
                return (
                  <tr key={item.id} className="border-b border-slate-800/50 hover:bg-slate-800/30 transition-colors">
                    <td className="p-3">
                      <Link href={`/admin/data-room/${item.id}`} className="text-slate-200 hover:text-indigo-400 font-medium">
                        {item.item_name}
                        {item.is_confidential && <span className="ml-1 text-red-400">🔒</span>}
                      </Link>
                      {item.item_description && (
                        <div className="text-slate-500 mt-0.5 text-xs truncate max-w-xs">{item.item_description}</div>
                      )}
                    </td>
                    <td className="p-3 text-slate-400">{item.item_category}</td>
                    <td className="p-3 text-slate-500 capitalize">{item.item_type}</td>
                    <td className="p-3">
                      <span className={`px-2 py-0.5 rounded border text-xs ${STATUS_BG[item.item_status] ?? "bg-slate-800 text-slate-400 border-slate-700"}`}>
                        {item.item_status}
                      </span>
                    </td>
                    <td className="p-3 text-slate-500 capitalize">{item.source_type?.replace(/_/g, " ")}</td>
                    <td className="p-3 text-slate-500">{item.prepared_by_name ?? "—"}</td>
                    <td className="p-3">
                      {item.next_review_date ? (
                        <span className={overdueReview ? "text-red-400 font-medium" : "text-slate-500"}>
                          {new Date(item.next_review_date).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "2-digit" })}
                          {overdueReview && " ⚠"}
                        </span>
                      ) : <span className="text-slate-600">—</span>}
                    </td>
                    <td className="p-3">
                      <div className="flex items-center gap-1">
                        {item.item_status !== "Ready" && item.item_status !== "Archived" && (
                          <button
                            onClick={() => updateStatus(item.id, "Ready")}
                            className="px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 text-xs transition-colors"
                          >
                            Ready
                          </button>
                        )}
                        {item.item_status !== "Archived" && (
                          <button
                            onClick={() => updateStatus(item.id, "Archived")}
                            className="px-2 py-0.5 rounded bg-slate-700 text-slate-400 hover:bg-slate-600 text-xs transition-colors"
                          >
                            Archive
                          </button>
                        )}
                        <Link
                          href={`/admin/data-room/${item.id}`}
                          className="px-2 py-0.5 rounded bg-slate-700 text-slate-300 hover:bg-slate-600 text-xs transition-colors"
                        >
                          Edit
                        </Link>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
