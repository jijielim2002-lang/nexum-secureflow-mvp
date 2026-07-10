"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";
import { useAuth } from "@/contexts/AuthContext";

// ─── Types ────────────────────────────────────────────────────────────────────

type ItemStatus   = "Pending" | "In Progress" | "Passed" | "Failed" | "Not Applicable";
type ItemPriority = "Low" | "Medium" | "High" | "Critical";

interface ReadinessItem {
  id:              string;
  category:        string;
  item_name:       string;
  description:     string | null;
  status:          ItemStatus;
  priority:        ItemPriority;
  owner_name:      string | null;
  evidence_note:   string | null;
  evidence_url:    string | null;
  last_checked_at: string | null;
  updated_at:      string;
}

type GoLiveStatus = "Not Ready" | "Internal Testing" | "Pilot Ready" | "Production Ready";

// ─── Style maps ───────────────────────────────────────────────────────────────

const STATUS_STYLES: Record<ItemStatus, string> = {
  Pending:           "bg-slate-700/60 text-slate-300 border-slate-600/40",
  "In Progress":     "bg-blue-500/15 text-blue-300 border-blue-500/30",
  Passed:            "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
  Failed:            "bg-red-500/15 text-red-400 border-red-500/30",
  "Not Applicable":  "bg-slate-600/30 text-slate-500 border-slate-600/20",
};

const STATUS_ICONS: Record<ItemStatus, string> = {
  Pending:           "○",
  "In Progress":     "◐",
  Passed:            "✓",
  Failed:            "✕",
  "Not Applicable":  "—",
};

const PRIORITY_STYLES: Record<ItemPriority, string> = {
  Critical: "bg-red-500/15 text-red-400 border-red-500/30",
  High:     "bg-amber-500/15 text-amber-400 border-amber-500/30",
  Medium:   "bg-blue-500/10 text-blue-400 border-blue-500/20",
  Low:      "bg-slate-700/40 text-slate-400 border-slate-600/30",
};

const GO_LIVE_STYLES: Record<GoLiveStatus, string> = {
  "Not Ready":         "bg-red-500/15 text-red-400 border-red-500/30",
  "Internal Testing":  "bg-amber-500/15 text-amber-400 border-amber-500/30",
  "Pilot Ready":       "bg-teal-500/15 text-teal-400 border-teal-500/30",
  "Production Ready":  "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
};

const ALL_STATUSES: ItemStatus[] = ["Pending", "In Progress", "Passed", "Failed", "Not Applicable"];

// ─── Go-live status calculation ───────────────────────────────────────────────

function computeGoLiveStatus(items: ReadinessItem[]): GoLiveStatus {
  const critical = items.filter((i) => i.priority === "Critical");
  const high     = items.filter((i) => i.priority === "High");

  const criticalFailed  = critical.filter((i) => i.status === "Failed");
  const criticalPending = critical.filter((i) => i.status === "Pending" || i.status === "In Progress");
  const criticalPassed  = critical.filter((i) => i.status === "Passed" || i.status === "Not Applicable");

  const highPending = high.filter((i) => i.status === "Pending" || i.status === "In Progress");
  const highPassed  = high.filter((i) => i.status === "Passed" || i.status === "Not Applicable");

  if (criticalFailed.length > 0) return "Not Ready";
  if (criticalPending.length > 0) return "Internal Testing";
  if (criticalPassed.length === critical.length && highPending.length > 0) return "Pilot Ready";
  if (criticalPassed.length === critical.length && highPassed.length === high.length) return "Production Ready";
  return "Not Ready";
}

// ─── Small UI helpers ─────────────────────────────────────────────────────────

function StatCard({ label, value, color }: { label: string; value: string | number; color: string }) {
  const colorMap: Record<string, string> = {
    slate:   "text-slate-200",
    emerald: "text-emerald-400",
    red:     "text-red-400",
    amber:   "text-amber-400",
    teal:    "text-teal-400",
  };
  return (
    <div className="bg-slate-800/60 border border-slate-700/60 rounded-2xl p-4">
      <p className="text-xs text-slate-500 mb-1">{label}</p>
      <p className={`text-2xl font-bold ${colorMap[color] ?? "text-white"}`}>{value}</p>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function GoLiveReadinessPage() {
  const { profile } = useAuth();

  async function getToken() {
    const { data: { session } } = await supabase.auth.getSession();
    return session?.access_token ?? "";
  }

  // Data
  const [items,   setItems]   = useState<ReadinessItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState<string | null>(null);

  // Filters
  const [catFilter,    setCatFilter]    = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [expanded,     setExpanded]     = useState<Record<string, boolean>>({});

  // Action state
  const [acting,    setActing]    = useState<string | null>(null);
  const [actionMsg, setActionMsg] = useState<string | null>(null);

  // Edit modal
  const [editModal, setEditModal] = useState<ReadinessItem | null>(null);
  const [editStatus, setEditStatus] = useState<ItemStatus>("Pending");
  const [editOwner,  setEditOwner]  = useState("");
  const [editNote,   setEditNote]   = useState("");
  const [editUrl,    setEditUrl]    = useState("");

  // ── Load ─────────────────────────────────────────────────────────────────────

  const loadItems = useCallback(async () => {
    if (!profile) return;
    setLoading(true);
    setError(null);
    const token = await getToken();
    const res = await fetch("/api/go-live-readiness", {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) { setError("Failed to load readiness items."); setLoading(false); return; }
    const json = await res.json();
    setItems(json.items ?? []);
    setLoading(false);
  }, [profile]);

  useEffect(() => { loadItems(); }, [loadItems]);

  // ── PATCH handler ─────────────────────────────────────────────────────────────

  async function patchItem(id: string, patch: Partial<Pick<ReadinessItem, "status" | "owner_name" | "evidence_note" | "evidence_url">>) {
    setActing(id);
    setActionMsg(null);
    const token = await getToken();
    const res = await fetch("/api/go-live-readiness", {
      method:  "PATCH",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body:    JSON.stringify({ id, ...patch }),
    });
    const json = await res.json();
    if (res.ok) {
      setItems((prev) => prev.map((i) => i.id === id ? { ...i, ...json.item } : i));
      setActionMsg("Saved.");
    } else {
      setActionMsg(`Error: ${json.error ?? "Failed"}`);
    }
    setActing(null);
    setTimeout(() => setActionMsg(null), 3000);
  }

  // ── Quick actions ─────────────────────────────────────────────────────────────

  async function markStatus(id: string, status: ItemStatus) {
    await patchItem(id, { status });
  }

  // ── Edit modal submit ─────────────────────────────────────────────────────────

  async function submitEdit() {
    if (!editModal) return;
    await patchItem(editModal.id, {
      status:        editStatus,
      owner_name:    editOwner  || null,
      evidence_note: editNote   || null,
      evidence_url:  editUrl    || null,
    } as Partial<ReadinessItem>);
    setEditModal(null);
  }

  function openEdit(item: ReadinessItem) {
    setEditModal(item);
    setEditStatus(item.status);
    setEditOwner(item.owner_name ?? "");
    setEditNote(item.evidence_note ?? "");
    setEditUrl(item.evidence_url ?? "");
  }

  // ── CSV export ────────────────────────────────────────────────────────────────

  function exportCSV() {
    const headers = ["Category", "Item", "Priority", "Status", "Owner", "Evidence Note", "Evidence URL", "Last Checked"];
    const rows = items.map((i) => [
      `"${i.category}"`,
      `"${i.item_name.replace(/"/g, '""')}"`,
      `"${i.priority}"`,
      `"${i.status}"`,
      `"${i.owner_name ?? ""}"`,
      `"${(i.evidence_note ?? "").replace(/"/g, '""')}"`,
      `"${i.evidence_url ?? ""}"`,
      `"${i.last_checked_at ? new Date(i.last_checked_at).toLocaleDateString("en-GB") : ""}"`,
    ]);
    const csv = [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a");
    a.href     = url;
    a.download = `nexum-go-live-readiness-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  // ── Derived stats ─────────────────────────────────────────────────────────────

  const total          = items.length;
  const passed         = items.filter((i) => i.status === "Passed").length;
  const failed         = items.filter((i) => i.status === "Failed").length;
  const criticalPending = items.filter(
    (i) => i.priority === "Critical" && (i.status === "Pending" || i.status === "In Progress")
  ).length;
  const goLiveStatus   = computeGoLiveStatus(items);

  // ── Grouped by category ──────────────────────────────────────────────────────

  const categories = [...new Set(items.map((i) => i.category))].sort();

  const filtered = items.filter((i) => {
    if (catFilter    && i.category !== catFilter) return false;
    if (statusFilter && i.status   !== statusFilter) return false;
    return true;
  });

  const byCategory = categories.reduce<Record<string, ReadinessItem[]>>((acc, cat) => {
    acc[cat] = filtered.filter((i) => i.category === cat);
    return acc;
  }, {});

  // ── Progress per category ──────────────────────────────────────────────────

  function catProgress(cat: string) {
    const all = items.filter((i) => i.category === cat);
    const done = all.filter((i) => i.status === "Passed" || i.status === "Not Applicable").length;
    return all.length > 0 ? Math.round((done / all.length) * 100) : 0;
  }

  // ─────────────────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-[#0a0f1e] text-white">
      <div className="max-w-screen-2xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">

        {/* ── Header ──────────────────────────────────────────────────────── */}
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Link href="/admin" className="text-slate-500 hover:text-slate-300 text-sm transition-colors">
                Admin
              </Link>
              <span className="text-slate-600">/</span>
              <span className="text-slate-300 text-sm">Go-Live Readiness</span>
            </div>
            <h1 className="text-2xl font-bold text-white">Go-Live Readiness</h1>
            <p className="text-slate-400 text-sm mt-1">
              Phase 1 — Production Stability & Deployment. Manual payment operations only.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={exportCSV}
              disabled={items.length === 0}
              className="flex items-center gap-2 px-4 py-2 bg-slate-700/60 hover:bg-slate-700 border border-slate-600/50 text-slate-300 text-sm rounded-xl transition-colors disabled:opacity-40"
            >
              Export CSV
            </button>
            <Link
              href="/admin/uat"
              className="flex items-center gap-2 px-4 py-2 bg-teal-600/80 hover:bg-teal-600 text-white text-sm font-medium rounded-xl transition-colors"
            >
              UAT Test Flow →
            </Link>
          </div>
        </div>

        {/* ── Critical warning banner ──────────────────────────────────────── */}
        <div className="bg-red-500/10 border border-red-500/30 rounded-2xl p-4">
          <p className="text-red-400 text-sm font-medium">
            System is not ready for actual customer pilot until all Critical items are Passed or formally waived.
          </p>
          <p className="text-red-400/70 text-xs mt-1">
            Do not onboard real customers, process real payments, or represent this system as production-ready until this checklist is complete.
            Manual payment operations only — no bank API connected.
          </p>
        </div>

        {/* ── Stats ────────────────────────────────────────────────────────── */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          <StatCard label="Total Items"       value={total}           color="slate"   />
          <StatCard label="Passed"            value={passed}          color="emerald" />
          <StatCard label="Failed"            value={failed}          color="red"     />
          <StatCard label="Critical Pending"  value={criticalPending} color="amber"   />
          <div className="bg-slate-800/60 border border-slate-700/60 rounded-2xl p-4">
            <p className="text-xs text-slate-500 mb-1">Go-Live Status</p>
            <span className={`inline-block px-2.5 py-1 rounded-lg text-sm font-semibold border ${GO_LIVE_STYLES[goLiveStatus]}`}>
              {goLiveStatus}
            </span>
          </div>
        </div>

        {/* ── Action message ────────────────────────────────────────────────── */}
        {actionMsg && (
          <div className={`text-sm px-4 py-2 rounded-lg border ${actionMsg.startsWith("Error") ? "bg-red-500/10 border-red-500/30 text-red-400" : "bg-emerald-500/10 border-emerald-500/30 text-emerald-400"}`}>
            {actionMsg}
          </div>
        )}

        {/* ── Filters ──────────────────────────────────────────────────────── */}
        <div className="flex flex-wrap gap-3">
          <select
            value={catFilter}
            onChange={(e) => setCatFilter(e.target.value)}
            className="bg-slate-800/80 border border-slate-700/60 text-slate-300 text-xs rounded-lg px-3 py-2"
          >
            <option value="">All Categories</option>
            {categories.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="bg-slate-800/80 border border-slate-700/60 text-slate-300 text-xs rounded-lg px-3 py-2"
          >
            <option value="">All Statuses</option>
            {ALL_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
          {(catFilter || statusFilter) && (
            <button
              onClick={() => { setCatFilter(""); setStatusFilter(""); }}
              className="text-xs text-slate-500 hover:text-slate-300 transition-colors"
            >
              Clear
            </button>
          )}
        </div>

        {/* ── Loading / error ───────────────────────────────────────────────── */}
        {loading && (
          <div className="space-y-4">
            {[1, 2, 3].map((k) => (
              <div key={k} className="bg-slate-800/60 border border-slate-700/60 rounded-2xl p-5 animate-pulse h-24" />
            ))}
          </div>
        )}
        {!loading && error && (
          <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-4 text-red-400 text-sm">{error}</div>
        )}

        {/* ── Sections by category ─────────────────────────────────────────── */}
        {!loading && !error && (
          <div className="space-y-4">
            {categories.map((cat) => {
              const catItems = byCategory[cat] ?? [];
              if (catItems.length === 0 && (catFilter || statusFilter)) return null;
              const allCatItems = items.filter((i) => i.category === cat);
              const progress    = catProgress(cat);
              const isOpen      = expanded[cat] !== false; // default open

              return (
                <div key={cat} className="bg-slate-800/60 border border-slate-700/60 rounded-2xl overflow-hidden">

                  {/* Category header */}
                  <button
                    onClick={() => setExpanded((p) => ({ ...p, [cat]: !isOpen }))}
                    className="w-full flex items-center justify-between px-5 py-4 hover:bg-slate-700/20 transition-colors text-left"
                  >
                    <div className="flex items-center gap-3">
                      <span className="text-sm font-semibold text-slate-100">{cat}</span>
                      <span className="text-xs text-slate-500">
                        {allCatItems.filter((i) => i.status === "Passed" || i.status === "Not Applicable").length}/{allCatItems.length} complete
                      </span>
                      {allCatItems.some((i) => i.status === "Failed") && (
                        <span className="text-xs text-red-400 font-medium">● Failed</span>
                      )}
                      {allCatItems.some((i) => i.priority === "Critical" && (i.status === "Pending" || i.status === "In Progress")) && (
                        <span className="text-xs text-amber-400 font-medium">⚠ Critical pending</span>
                      )}
                    </div>
                    <div className="flex items-center gap-4">
                      {/* Progress bar */}
                      <div className="hidden sm:flex items-center gap-2">
                        <div className="w-24 bg-slate-700/60 rounded-full h-1.5">
                          <div
                            className={`h-1.5 rounded-full transition-all ${progress === 100 ? "bg-emerald-500" : progress >= 50 ? "bg-teal-500" : "bg-slate-500"}`}
                            style={{ width: `${progress}%` }}
                          />
                        </div>
                        <span className="text-xs text-slate-500">{progress}%</span>
                      </div>
                      <span className="text-slate-500 text-sm">{isOpen ? "▲" : "▼"}</span>
                    </div>
                  </button>

                  {/* Items */}
                  {isOpen && (
                    <div className="border-t border-slate-700/40 divide-y divide-slate-700/30">
                      {catItems.length === 0 ? (
                        <p className="text-slate-600 text-xs px-5 py-4">No items match current filter.</p>
                      ) : catItems.map((item) => (
                        <div key={item.id} className="px-5 py-4 flex flex-col gap-2">
                          <div className="flex items-start gap-3">

                            {/* Status icon */}
                            <span className={`mt-0.5 text-sm font-bold shrink-0 ${
                              item.status === "Passed" ? "text-emerald-400" :
                              item.status === "Failed" ? "text-red-400" :
                              item.status === "In Progress" ? "text-blue-400" :
                              item.status === "Not Applicable" ? "text-slate-600" :
                              "text-slate-500"
                            }`}>
                              {STATUS_ICONS[item.status]}
                            </span>

                            {/* Content */}
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center flex-wrap gap-2 mb-0.5">
                                <span className="text-sm text-slate-200 font-medium">{item.item_name}</span>
                                <span className={`inline-block px-1.5 py-0 rounded text-xs border ${PRIORITY_STYLES[item.priority]}`}>
                                  {item.priority}
                                </span>
                              </div>
                              {item.description && (
                                <p className="text-xs text-slate-500 leading-relaxed">{item.description}</p>
                              )}
                              {(item.owner_name || item.evidence_note || item.last_checked_at) && (
                                <div className="flex flex-wrap gap-3 mt-1.5">
                                  {item.owner_name && (
                                    <span className="text-xs text-slate-500">Owner: <span className="text-slate-300">{item.owner_name}</span></span>
                                  )}
                                  {item.evidence_note && (
                                    <span className="text-xs text-slate-500">Note: <span className="text-slate-300">{item.evidence_note}</span></span>
                                  )}
                                  {item.evidence_url && (
                                    <a href={item.evidence_url} target="_blank" rel="noopener noreferrer" className="text-xs text-teal-400 hover:text-teal-300">
                                      Evidence ↗
                                    </a>
                                  )}
                                  {item.last_checked_at && (
                                    <span className="text-xs text-slate-600">
                                      Last checked: {new Date(item.last_checked_at).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
                                    </span>
                                  )}
                                </div>
                              )}
                            </div>

                            {/* Quick actions */}
                            <div className="flex items-center gap-2 shrink-0 ml-2">
                              {/* Status badge */}
                              <span className={`hidden sm:inline-block px-2 py-0.5 rounded-lg text-xs border font-medium ${STATUS_STYLES[item.status]}`}>
                                {item.status}
                              </span>

                              {/* Quick mark buttons */}
                              {item.status !== "Passed" && (
                                <button
                                  onClick={() => markStatus(item.id, "Passed")}
                                  disabled={acting === item.id}
                                  className="text-xs px-2.5 py-1 bg-emerald-600/70 hover:bg-emerald-600 text-white rounded-lg disabled:opacity-40 transition-colors"
                                >
                                  Pass
                                </button>
                              )}
                              {item.status !== "Failed" && item.status !== "Passed" && (
                                <button
                                  onClick={() => markStatus(item.id, "Failed")}
                                  disabled={acting === item.id}
                                  className="text-xs px-2.5 py-1 bg-red-600/60 hover:bg-red-600 text-white rounded-lg disabled:opacity-40 transition-colors"
                                >
                                  Fail
                                </button>
                              )}

                              {/* Edit button */}
                              <button
                                onClick={() => openEdit(item)}
                                className="text-xs px-2.5 py-1 bg-slate-700/60 hover:bg-slate-700 border border-slate-600/40 text-slate-300 rounded-lg transition-colors"
                              >
                                Edit
                              </button>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* ── Compliance footer ─────────────────────────────────────────────── */}
        <div className="bg-slate-800/40 border border-slate-700/40 rounded-2xl p-4">
          <p className="text-xs text-slate-500 leading-relaxed">
            This checklist is an internal operational control tool for the Nexum team.
            Passing all items does not constitute a legal certification, compliance approval, or audit sign-off.
            For actual production deployment, independent legal review and regulatory confirmation are required.
            This system operates manual payment operations only — no bank API is connected.
            Nexum does not hold funds as a licensed financial institution.
          </p>
        </div>

      </div>

      {/* ── Edit modal ─────────────────────────────────────────────────────── */}
      {editModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm px-4">
          <div className="bg-slate-900 border border-slate-700/60 rounded-2xl p-6 w-full max-w-md space-y-4">
            <h3 className="text-sm font-semibold text-white">{editModal.item_name}</h3>
            <p className="text-xs text-slate-500">{editModal.category}</p>

            <div className="space-y-3">
              <div>
                <label className="text-xs text-slate-400 mb-1 block">Status</label>
                <select
                  value={editStatus}
                  onChange={(e) => setEditStatus(e.target.value as ItemStatus)}
                  className="w-full bg-slate-800 border border-slate-700/60 text-slate-200 text-sm rounded-lg px-3 py-2"
                >
                  {ALL_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>

              <div>
                <label className="text-xs text-slate-400 mb-1 block">Owner</label>
                <input
                  type="text"
                  value={editOwner}
                  onChange={(e) => setEditOwner(e.target.value)}
                  placeholder="e.g. Jijie / DevOps team"
                  className="w-full bg-slate-800 border border-slate-700/60 text-slate-200 text-sm rounded-lg px-3 py-2 placeholder-slate-600"
                />
              </div>

              <div>
                <label className="text-xs text-slate-400 mb-1 block">Evidence Note</label>
                <textarea
                  value={editNote}
                  onChange={(e) => setEditNote(e.target.value)}
                  rows={3}
                  placeholder="Describe what was tested or verified…"
                  className="w-full bg-slate-800 border border-slate-700/60 text-slate-200 text-sm rounded-lg px-3 py-2 placeholder-slate-600 resize-none"
                />
              </div>

              <div>
                <label className="text-xs text-slate-400 mb-1 block">Evidence URL (optional)</label>
                <input
                  type="text"
                  value={editUrl}
                  onChange={(e) => setEditUrl(e.target.value)}
                  placeholder="https://…"
                  className="w-full bg-slate-800 border border-slate-700/60 text-slate-200 text-sm rounded-lg px-3 py-2 placeholder-slate-600"
                />
              </div>
            </div>

            <div className="flex gap-3 pt-2">
              <button
                onClick={submitEdit}
                disabled={acting === editModal.id}
                className="flex-1 py-2 bg-teal-600 hover:bg-teal-700 disabled:opacity-40 text-white text-sm font-medium rounded-xl transition-colors"
              >
                {acting === editModal.id ? "Saving…" : "Save"}
              </button>
              <button
                onClick={() => setEditModal(null)}
                className="flex-1 py-2 bg-slate-700/60 hover:bg-slate-700 text-slate-300 text-sm rounded-xl transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
