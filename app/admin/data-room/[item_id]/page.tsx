"use client";

// ─── /admin/data-room/[item_id] ───────────────────────────────────────────────
// Detail / edit page for a single data room item.

import { useEffect, useState, useCallback } from "react";
import { createClient } from "@supabase/supabase-js";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
);

const CATEGORIES = [
  "Pitch & Strategy","Financial","KPI & Metrics","Capital",
  "Risk & Compliance","Legal","Governance","Product","People","General",
];
const ITEM_TYPES = ["document","report","metric","data","legal","financial","other"];
const SOURCE_TYPES = [
  "manual","board_report","credit_pack","capital_readiness",
  "financing_offer","kpi_target","risk_register","accounting_export","other",
];

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
  prepared_by_user_id: string | null;
  last_reviewed_at: string | null;
  next_review_date: string | null;
  is_confidential: boolean;
  created_at: string;
  updated_at: string;
}

interface AccessLog {
  id: string;
  accessed_by_name: string;
  accessed_at: string;
  access_note: string | null;
}

const STATUS_BG: Record<string, string> = {
  "Ready":        "bg-emerald-400/10 text-emerald-400 border-emerald-400/20",
  "Draft":        "bg-yellow-400/10 text-yellow-400 border-yellow-400/20",
  "Needs Update": "bg-orange-400/10 text-orange-400 border-orange-400/20",
  "Archived":     "bg-slate-700 text-slate-400 border-slate-600",
};

export default function DataRoomItemDetailPage() {
  const { item_id } = useParams<{ item_id: string }>();
  const router = useRouter();

  const [item,    setItem]    = useState<DataRoomItem | null>(null);
  const [logs,    setLogs]    = useState<AccessLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState<string | null>(null);
  const [token,   setToken]   = useState<string | null>(null);
  const [role,    setRole]    = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [saving,  setSaving]  = useState(false);

  // Edit state
  const [eName,        setEName]        = useState("");
  const [eCategory,    setECategory]    = useState("");
  const [eType,        setEType]        = useState("");
  const [eStatus,      setEStatus]      = useState("");
  const [eSourceType,  setESourceType]  = useState("");
  const [eSourceId,    setESourceId]    = useState("");
  const [eSourceUrl,   setESourceUrl]   = useState("");
  const [eDescription, setEDescription] = useState("");
  const [eNotes,       setENotes]       = useState("");
  const [eNextReview,  setENextReview]  = useState("");
  const [eConfidential,setEConfidential]= useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) { setError("Not authenticated"); setLoading(false); return; }
      setToken(session.access_token);
      supabase.from("profiles").select("role").eq("id", session.user.id).single()
        .then(({ data: p }) => setRole(p?.role ?? null));
    });
  }, []);

  const fetchItem = useCallback(async () => {
    if (!token) return;
    try {
      const [itemRes, logsRes] = await Promise.all([
        fetch(`/api/fundraising-data-room/${item_id}`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
        fetch(`/api/fundraising-data-room/access-logs?item_id=${item_id}&limit=20`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
      ]);
      const itemJson = await itemRes.json();
      if (!itemRes.ok) { setError(itemJson.error ?? "Not found"); setLoading(false); return; }
      const logsJson = await logsRes.json();
      setItem(itemJson.data);
      setLogs(logsJson.data ?? []);
    } catch { setError("Network error"); }
    finally { setLoading(false); }
  }, [token, item_id]);

  useEffect(() => { if (token) fetchItem(); }, [token, fetchItem]);

  // Populate edit fields when item loads
  useEffect(() => {
    if (!item) return;
    setEName(item.item_name);
    setECategory(item.item_category);
    setEType(item.item_type);
    setEStatus(item.item_status);
    setESourceType(item.source_type);
    setESourceId(item.source_id ?? "");
    setESourceUrl(item.source_url ?? "");
    setEDescription(item.item_description ?? "");
    setENotes(item.notes ?? "");
    setENextReview(item.next_review_date ?? "");
    setEConfidential(item.is_confidential);
  }, [item]);

  const handleSave = useCallback(async () => {
    if (!token || !item) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/fundraising-data-room/${item.id}`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          item_name:       eName.trim(),
          item_category:   eCategory,
          item_type:       eType,
          item_status:     eStatus,
          source_type:     eSourceType,
          source_id:       eSourceId || null,
          source_url:      eSourceUrl || null,
          item_description: eDescription || null,
          notes:           eNotes || null,
          next_review_date: eNextReview || null,
          is_confidential: eConfidential,
        }),
      });
      const json = await res.json();
      if (!res.ok) { setError(json.error ?? "Failed"); return; }
      setItem(json.data);
      setEditing(false);
    } catch { setError("Network error"); }
    finally { setSaving(false); }
  }, [token, item, eName, eCategory, eType, eStatus, eSourceType, eSourceId, eSourceUrl, eDescription, eNotes, eNextReview, eConfidential]);

  const handleAction = useCallback(async (action: string) => {
    if (!token || !item) return;
    const res = await fetch(`/api/fundraising-data-room/${item.id}`, {
      method: "PATCH",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ action }),
    });
    const json = await res.json();
    if (res.ok) setItem(json.data);
    else setError(json.error ?? "Failed");
  }, [token, item]);

  const logShare = useCallback(async (sharedWith: string) => {
    if (!token || !item) return;
    await fetch("/api/fundraising-data-room/access-logs", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        item_id: item.id,
        access_note: `Shared with ${sharedWith}`,
        shared_with: sharedWith,
      }),
    });
    fetchItem();
  }, [token, item, fetchItem]);

  if (loading) return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center">
      <div className="text-slate-400 animate-pulse">Loading…</div>
    </div>
  );
  if (error || !item || role !== "admin") return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center">
      <div className="text-red-400">{error ?? "Access restricted."}</div>
    </div>
  );

  const overdueReview = item.next_review_date && new Date(item.next_review_date) < new Date();

  return (
    <div className="min-h-screen bg-slate-950 text-slate-200 p-6">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="mb-6 flex items-start justify-between flex-wrap gap-4">
          <div>
            <div className="flex items-center gap-2 text-xs text-slate-500 mb-1">
              <Link href="/admin" className="hover:text-slate-300">Admin</Link>
              <span>/</span>
              <Link href="/admin/data-room" className="hover:text-slate-300">Data Room</Link>
              <span>/</span>
              <Link href="/admin/data-room/items" className="hover:text-slate-300">Items</Link>
              <span>/</span>
              <span className="text-slate-300 truncate max-w-xs">{item.item_name}</span>
            </div>
            <div className="flex items-center gap-3 flex-wrap">
              <h1 className="text-xl font-bold text-slate-100">{item.item_name}</h1>
              {item.is_confidential && <span className="text-sm">🔒</span>}
              <span className={`text-xs px-2 py-0.5 rounded border ${STATUS_BG[item.item_status] ?? "bg-slate-800 text-slate-400 border-slate-700"}`}>
                {item.item_status}
              </span>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {item.item_status !== "Ready" && item.item_status !== "Archived" && (
              <button
                onClick={() => handleAction("mark_ready")}
                className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-medium transition-colors"
              >
                Mark Ready
              </button>
            )}
            {item.item_status !== "Archived" && (
              <button
                onClick={() => handleAction("mark_reviewed")}
                className="px-3 py-1.5 rounded-lg bg-indigo-600/40 hover:bg-indigo-600/60 text-indigo-300 text-xs font-medium transition-colors"
              >
                Mark Reviewed
              </button>
            )}
            {item.item_status !== "Archived" && (
              <button
                onClick={() => handleAction("mark_needs_update")}
                className="px-3 py-1.5 rounded-lg bg-orange-500/20 hover:bg-orange-500/30 text-orange-400 text-xs font-medium transition-colors"
              >
                Needs Update
              </button>
            )}
            {item.item_status !== "Archived" && (
              <button
                onClick={() => handleAction("archive")}
                className="px-3 py-1.5 rounded-lg bg-slate-700 hover:bg-slate-600 text-slate-300 text-xs font-medium transition-colors"
              >
                Archive
              </button>
            )}
            <button
              onClick={() => setEditing(e => !e)}
              className="px-3 py-1.5 rounded-lg bg-slate-700 hover:bg-slate-600 text-slate-200 text-xs font-medium transition-colors"
            >
              {editing ? "Cancel Edit" : "Edit"}
            </button>
          </div>
        </div>

        {/* Alerts */}
        {error && (
          <div className="bg-red-400/10 border border-red-400/30 rounded-xl p-4 mb-4 text-sm text-red-300">{error}</div>
        )}
        {overdueReview && (
          <div className="bg-red-400/10 border border-red-400/30 rounded-xl p-4 mb-4 text-sm text-red-300">
            ⚠ This item is past its scheduled review date ({item.next_review_date}). Please review and update.
          </div>
        )}

        {editing ? (
          /* ── Edit Form ──────────────────────────────────────────────────── */
          <div className="bg-slate-900 rounded-xl border border-slate-800 p-5 space-y-5">
            <h2 className="text-sm font-semibold text-slate-200">Edit Item</h2>

            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1.5">Item Name</label>
              <input
                type="text"
                value={eName}
                onChange={e => setEName(e.target.value)}
                className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-slate-200 text-sm focus:outline-none focus:border-indigo-500"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1.5">Category</label>
                <select value={eCategory} onChange={e => setECategory(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-slate-200 text-sm focus:outline-none focus:border-indigo-500">
                  {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1.5">Type</label>
                <select value={eType} onChange={e => setEType(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-slate-200 text-sm focus:outline-none focus:border-indigo-500">
                  {ITEM_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1.5">Status</label>
              <div className="flex gap-2">
                {["Draft","Ready","Needs Update","Archived"].map(s => (
                  <button key={s} type="button" onClick={() => setEStatus(s)}
                    className={`px-3 py-1.5 rounded-lg text-xs border transition-colors ${
                      eStatus === s ? (STATUS_BG[s] ?? "bg-slate-700 text-slate-200 border-slate-600") : "bg-slate-800 text-slate-400 border-slate-700"
                    }`}
                  >{s}</button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1.5">Source Type</label>
                <select value={eSourceType} onChange={e => setESourceType(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-slate-200 text-sm focus:outline-none focus:border-indigo-500">
                  {SOURCE_TYPES.map(t => <option key={t} value={t}>{t.replace(/_/g," ")}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1.5">Source ID</label>
                <input type="text" value={eSourceId} onChange={e => setESourceId(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-slate-200 text-sm focus:outline-none focus:border-indigo-500"
                  placeholder="UUID of linked record" />
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1.5">Source URL</label>
              <input type="text" value={eSourceUrl} onChange={e => setESourceUrl(e.target.value)}
                className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-slate-200 text-sm focus:outline-none focus:border-indigo-500"
                placeholder="Internal or external reference URL" />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1.5">Description</label>
              <textarea value={eDescription} onChange={e => setEDescription(e.target.value)} rows={3}
                className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-slate-200 text-sm focus:outline-none focus:border-indigo-500 resize-none" />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1.5">Internal Notes</label>
              <textarea value={eNotes} onChange={e => setENotes(e.target.value)} rows={2}
                className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-slate-200 text-sm focus:outline-none focus:border-indigo-500 resize-none" />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1.5">Next Review Date</label>
              <input type="date" value={eNextReview} onChange={e => setENextReview(e.target.value)}
                className="px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-slate-200 text-sm focus:outline-none focus:border-indigo-500" />
            </div>

            <div>
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={eConfidential} onChange={e => setEConfidential(e.target.checked)} className="rounded" />
                <span className="text-sm text-slate-300">Mark as Confidential</span>
              </label>
            </div>

            <div className="flex gap-3">
              <button onClick={handleSave} disabled={saving}
                className="px-5 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-medium disabled:opacity-50 transition-colors">
                {saving ? "Saving…" : "Save Changes"}
              </button>
              <button onClick={() => setEditing(false)}
                className="px-5 py-2 rounded-lg bg-slate-700 hover:bg-slate-600 text-slate-200 text-sm font-medium transition-colors">
                Cancel
              </button>
            </div>
          </div>
        ) : (
          /* ── Detail View ────────────────────────────────────────────────── */
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 space-y-4">
              {/* Main details */}
              <div className="bg-slate-900 rounded-xl border border-slate-800 p-5">
                <h2 className="text-sm font-semibold text-slate-200 mb-4">Item Details</h2>
                <dl className="space-y-3 text-sm">
                  <div className="flex gap-3">
                    <dt className="text-slate-500 w-32 flex-shrink-0">Category</dt>
                    <dd className="text-slate-300">{item.item_category}</dd>
                  </div>
                  <div className="flex gap-3">
                    <dt className="text-slate-500 w-32 flex-shrink-0">Type</dt>
                    <dd className="text-slate-300 capitalize">{item.item_type}</dd>
                  </div>
                  <div className="flex gap-3">
                    <dt className="text-slate-500 w-32 flex-shrink-0">Status</dt>
                    <dd><span className={`px-2 py-0.5 rounded border text-xs ${STATUS_BG[item.item_status] ?? ""}`}>{item.item_status}</span></dd>
                  </div>
                  <div className="flex gap-3">
                    <dt className="text-slate-500 w-32 flex-shrink-0">Source</dt>
                    <dd className="text-slate-300 capitalize">{item.source_type?.replace(/_/g," ")}</dd>
                  </div>
                  {item.source_id && (
                    <div className="flex gap-3">
                      <dt className="text-slate-500 w-32 flex-shrink-0">Source ID</dt>
                      <dd className="text-slate-400 font-mono text-xs">{item.source_id}</dd>
                    </div>
                  )}
                  {item.source_url && (
                    <div className="flex gap-3">
                      <dt className="text-slate-500 w-32 flex-shrink-0">Reference URL</dt>
                      <dd>
                        <a href={item.source_url} target="_blank" rel="noopener noreferrer"
                          className="text-indigo-400 hover:text-indigo-300 text-xs break-all">
                          {item.source_url}
                        </a>
                      </dd>
                    </div>
                  )}
                  <div className="flex gap-3">
                    <dt className="text-slate-500 w-32 flex-shrink-0">Confidential</dt>
                    <dd className={item.is_confidential ? "text-red-400" : "text-slate-500"}>
                      {item.is_confidential ? "Yes 🔒" : "No"}
                    </dd>
                  </div>
                  <div className="flex gap-3">
                    <dt className="text-slate-500 w-32 flex-shrink-0">Prepared By</dt>
                    <dd className="text-slate-300">{item.prepared_by_name ?? "—"}</dd>
                  </div>
                  <div className="flex gap-3">
                    <dt className="text-slate-500 w-32 flex-shrink-0">Last Reviewed</dt>
                    <dd className="text-slate-300">
                      {item.last_reviewed_at
                        ? new Date(item.last_reviewed_at).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })
                        : "Not yet reviewed"}
                    </dd>
                  </div>
                  <div className="flex gap-3">
                    <dt className="text-slate-500 w-32 flex-shrink-0">Next Review</dt>
                    <dd className={overdueReview ? "text-red-400 font-medium" : "text-slate-300"}>
                      {item.next_review_date
                        ? new Date(item.next_review_date).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })
                        : "—"}
                      {overdueReview && " ⚠ OVERDUE"}
                    </dd>
                  </div>
                </dl>
              </div>

              {/* Description */}
              {item.item_description && (
                <div className="bg-slate-900 rounded-xl border border-slate-800 p-5">
                  <h2 className="text-sm font-semibold text-slate-200 mb-3">Description</h2>
                  <p className="text-sm text-slate-300 leading-relaxed">{item.item_description}</p>
                </div>
              )}

              {/* Notes */}
              {item.notes && (
                <div className="bg-slate-900 rounded-xl border border-slate-800 p-5">
                  <h2 className="text-sm font-semibold text-slate-200 mb-3">Internal Notes</h2>
                  <p className="text-sm text-slate-400 leading-relaxed">{item.notes}</p>
                </div>
              )}
            </div>

            {/* Sidebar */}
            <div className="space-y-4">
              {/* Meta */}
              <div className="bg-slate-900 rounded-xl border border-slate-800 p-5">
                <h2 className="text-sm font-semibold text-slate-200 mb-3">Timestamps</h2>
                <div className="space-y-2 text-xs">
                  <div className="flex justify-between">
                    <span className="text-slate-500">Created</span>
                    <span className="text-slate-300">{new Date(item.created_at).toLocaleDateString("en-GB")}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Updated</span>
                    <span className="text-slate-300">{new Date(item.updated_at).toLocaleDateString("en-GB")}</span>
                  </div>
                </div>
              </div>

              {/* Share log */}
              <div className="bg-slate-900 rounded-xl border border-slate-800 p-5">
                <h2 className="text-sm font-semibold text-slate-200 mb-3">Log Share Event</h2>
                <div className="flex gap-2">
                  <input
                    id="shareWith"
                    type="text"
                    placeholder="e.g. Investor A"
                    className="flex-1 px-2 py-1.5 rounded bg-slate-800 border border-slate-700 text-slate-200 text-xs focus:outline-none focus:border-indigo-500"
                  />
                  <button
                    onClick={() => {
                      const input = document.getElementById("shareWith") as HTMLInputElement;
                      if (input.value.trim()) { logShare(input.value.trim()); input.value = ""; }
                    }}
                    className="px-3 py-1.5 rounded bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-medium transition-colors"
                  >
                    Log
                  </button>
                </div>
              </div>

              {/* Access logs */}
              {logs.length > 0 && (
                <div className="bg-slate-900 rounded-xl border border-slate-800 p-5">
                  <h2 className="text-sm font-semibold text-slate-200 mb-3">Access Log ({logs.length})</h2>
                  <div className="space-y-2">
                    {logs.slice(0, 8).map(log => (
                      <div key={log.id} className="text-xs">
                        <div className="text-slate-300">{log.accessed_by_name}</div>
                        <div className="text-slate-500">
                          {new Date(log.accessed_at).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                          {log.access_note && ` — ${log.access_note}`}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Navigation */}
              <div className="bg-slate-900 rounded-xl border border-slate-800 p-5">
                <h2 className="text-sm font-semibold text-slate-200 mb-3">Navigate</h2>
                <div className="space-y-2 text-xs">
                  <Link href="/admin/data-room" className="flex items-center gap-2 text-indigo-400 hover:text-indigo-300">
                    ← Data Room Dashboard
                  </Link>
                  <Link href="/admin/data-room/items" className="flex items-center gap-2 text-indigo-400 hover:text-indigo-300">
                    ← All Items
                  </Link>
                  <Link href="/admin/data-room/items/new" className="flex items-center gap-2 text-indigo-400 hover:text-indigo-300">
                    + Add New Item
                  </Link>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
