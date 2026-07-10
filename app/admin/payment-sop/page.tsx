"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";
import { useAuth } from "@/contexts/AuthContext";

// ─── Types ────────────────────────────────────────────────────────────────────

interface SOPItem {
  id:               string;
  sop_category:     string;
  step_number:      number;
  step_name:        string;
  step_description: string | null;
  responsible_role: string | null;
  control_check:    string | null;
  required_evidence: string | null;
  status:           string;
  updated_at:       string;
}

type SOPStatus = "Draft" | "Approved" | "Active" | "Needs Review" | "Disabled";

// ─── Helpers ──────────────────────────────────────────────────────────────────

const STATUS_BADGE: Record<string, string> = {
  Draft:          "bg-slate-700/50 text-slate-400 border-slate-600/40",
  Approved:       "bg-blue-500/15 text-blue-400 border-blue-500/30",
  Active:         "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
  "Needs Review": "bg-amber-500/15 text-amber-400 border-amber-500/30",
  Disabled:       "bg-red-500/10 text-red-500/70 border-red-500/20",
};

const ROLE_BADGE: Record<string, string> = {
  Admin:      "bg-purple-500/10 text-purple-400",
  Finance:    "bg-blue-500/10 text-blue-400",
  Provider:   "bg-teal-500/10 text-teal-400",
  Customer:   "bg-emerald-500/10 text-emerald-400",
  System:     "bg-slate-700/40 text-slate-400",
  Management: "bg-amber-500/10 text-amber-400",
};

function exportCSV(items: SOPItem[]) {
  const rows = [
    ["Category","Step","Name","Description","Role","Control Check","Required Evidence","Status"].join(","),
    ...items.map((i) => [
      `"${i.sop_category}"`,
      i.step_number,
      `"${i.step_name}"`,
      `"${(i.step_description ?? "").replace(/"/g, '""')}"`,
      `"${i.responsible_role ?? ""}"`,
      `"${(i.control_check ?? "").replace(/"/g, '""')}"`,
      `"${(i.required_evidence ?? "").replace(/"/g, '""')}"`,
      i.status,
    ].join(",")),
  ];
  const blob = new Blob([rows.join("\n")], { type: "text/csv" });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement("a");
  a.href     = url;
  a.download = `payment-sop-${new Date().toISOString().slice(0,10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

const STATUSES: SOPStatus[] = ["Draft","Approved","Active","Needs Review","Disabled"];

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function PaymentSOPPage() {
  const { profile } = useAuth();

  async function getToken() {
    const { data: { session } } = await supabase.auth.getSession();
    return session?.access_token ?? "";
  }

  const [items,    setItems]    = useState<SOPItem[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [error,    setError]    = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [saving,   setSaving]   = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!profile) return;
    setLoading(true);
    const token = await getToken();
    const res = await fetch("/api/payment-sop", {
      headers: { Authorization: `Bearer ${token}` },
    });
    const json = await res.json();
    if (!res.ok) { setError(json.error ?? "Failed to load"); setLoading(false); return; }
    setItems(json.items ?? []);
    setLoading(false);
  }, [profile]);

  useEffect(() => { load(); }, [load]);

  async function updateStatus(id: string, status: SOPStatus) {
    setSaving(id);
    const token = await getToken();
    const res = await fetch("/api/payment-sop", {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ id, status }),
    });
    const json = await res.json();
    if (res.ok) {
      setItems((prev) => prev.map((i) => i.id === id ? { ...i, status: json.item.status } : i));
    }
    setSaving(null);
  }

  const categories = [...new Set(items.map((i) => i.sop_category))];

  const totalActive   = items.filter((i) => i.status === "Active").length;
  const totalApproved = items.filter((i) => i.status === "Approved").length;
  const totalDraft    = items.filter((i) => i.status === "Draft").length;
  const totalNeedRev  = items.filter((i) => i.status === "Needs Review").length;

  const allApprovedOrActive = items.length > 0 &&
    items.every((i) => ["Approved","Active"].includes(i.status));

  return (
    <div className="min-h-screen bg-[#0a0f1e] text-white">
      <div className="max-w-screen-xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">

        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Link href="/admin" className="text-slate-500 hover:text-slate-300 text-sm transition-colors">Admin</Link>
              <span className="text-slate-600">/</span>
              <Link href="/admin/payment-operations" className="text-slate-500 hover:text-slate-300 text-sm transition-colors">Payment Operations</Link>
              <span className="text-slate-600">/</span>
              <span className="text-slate-300 text-sm">Payment SOP</span>
            </div>
            <h1 className="text-2xl font-bold text-white">Payment Operating Procedures</h1>
            <p className="text-slate-400 text-sm mt-1">
              Standard operating procedures for manual payment collection, verification, release approval, payout, and reconciliation.
            </p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => exportCSV(items)}
              className="px-4 py-2 bg-slate-700/60 hover:bg-slate-700 border border-slate-600/50 text-slate-300 text-sm rounded-xl transition-colors"
            >
              Export CSV
            </button>
            <button
              onClick={load}
              disabled={loading}
              className="px-4 py-2 bg-slate-700/60 hover:bg-slate-700 border border-slate-600/50 text-slate-300 text-sm rounded-xl transition-colors disabled:opacity-50"
            >
              {loading ? "Loading…" : "Refresh"}
            </button>
          </div>
        </div>

        {/* Pilot SOP banner */}
        <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl px-5 py-4 text-sm space-y-2">
          <p className="text-amber-400 font-medium">Manual Payment Pilot — MYR Only, No Bank API</p>
          <div className="text-xs text-amber-400/80 space-y-1">
            <p>Customer-facing: "Please transfer the required amount to the designated payment account. Payment will be treated as secured only after Nexum verifies receipt."</p>
            <p>Provider-facing: "Payment secured means Nexum has verified receipt under the designated payment holding workflow. Release remains subject to POD, customer confirmation, dispute status, and admin approval."</p>
          </div>
          <div className="flex flex-wrap gap-3 text-xs pt-1">
            <span className="text-slate-500">DO NOT say:</span>
            <span className="line-through text-red-400/60">escrow guaranteed</span>
            <span className="line-through text-red-400/60">funds automatically released</span>
            <span className="line-through text-red-400/60">payment is guaranteed before verification</span>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          <div className="bg-slate-800/60 border border-slate-700/60 rounded-2xl p-4">
            <p className="text-xs text-slate-500 mb-1">Total Steps</p>
            <p className="text-2xl font-bold text-white">{items.length}</p>
          </div>
          <div className="bg-slate-800/60 border border-slate-700/60 rounded-2xl p-4">
            <p className="text-xs text-slate-500 mb-1">Active</p>
            <p className="text-2xl font-bold text-emerald-400">{totalActive}</p>
          </div>
          <div className="bg-slate-800/60 border border-slate-700/60 rounded-2xl p-4">
            <p className="text-xs text-slate-500 mb-1">Approved</p>
            <p className="text-2xl font-bold text-blue-400">{totalApproved}</p>
          </div>
          <div className={`bg-slate-800/60 border rounded-2xl p-4 ${totalDraft > 0 ? "border-amber-500/30" : "border-slate-700/60"}`}>
            <p className="text-xs text-slate-500 mb-1">Draft</p>
            <p className={`text-2xl font-bold ${totalDraft > 0 ? "text-amber-400" : "text-slate-400"}`}>{totalDraft}</p>
          </div>
          <div className={`bg-slate-800/60 border rounded-2xl p-4 ${allApprovedOrActive ? "border-emerald-500/30" : "border-slate-700/60"}`}>
            <p className="text-xs text-slate-500 mb-1">SOP Ready</p>
            <p className={`text-lg font-bold ${allApprovedOrActive ? "text-emerald-400" : "text-red-400"}`}>
              {allApprovedOrActive ? "Yes" : "No"}
            </p>
          </div>
        </div>

        {totalNeedRev > 0 && (
          <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-3 text-xs text-amber-400">
            {totalNeedRev} step(s) marked "Needs Review" — review and update before go-live.
          </div>
        )}

        {error && (
          <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-4 text-red-400 text-sm">{error}</div>
        )}

        {loading && (
          <div className="space-y-3">
            {[1,2,3].map((k) => (
              <div key={k} className="bg-slate-800/60 border border-slate-700/60 rounded-2xl h-24 animate-pulse" />
            ))}
          </div>
        )}

        {/* SOP categories */}
        {!loading && !error && categories.map((cat) => {
          const catItems = items.filter((i) => i.sop_category === cat).sort((a,b) => a.step_number - b.step_number);
          const catActive = catItems.filter((i) => ["Active","Approved"].includes(i.status)).length;
          const catReady  = catActive === catItems.length;

          return (
            <div key={cat} className="bg-slate-800/60 border border-slate-700/60 rounded-2xl overflow-hidden">
              <button
                onClick={() => setExpanded((e) => ({ ...e, [cat]: !e[cat] }))}
                className="w-full px-5 py-4 border-b border-slate-700/40 bg-slate-800/40 flex items-center justify-between hover:bg-slate-700/30 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <span className={`w-2 h-2 rounded-full shrink-0 ${catReady ? "bg-emerald-400" : "bg-amber-400"}`} />
                  <h2 className="text-sm font-semibold text-slate-200">{cat}</h2>
                </div>
                <div className="flex items-center gap-4 text-xs">
                  <span className="text-slate-500">{catActive}/{catItems.length} approved/active</span>
                  <span className="text-slate-600">{expanded[cat] ? "▲" : "▼"}</span>
                </div>
              </button>

              {expanded[cat] && (
                <div className="divide-y divide-slate-700/20">
                  {catItems.map((item) => (
                    <div key={item.id} className="p-5 space-y-3">
                      <div className="flex items-start gap-4">
                        {/* Step number */}
                        <div className="shrink-0 w-8 h-8 rounded-full bg-slate-700/60 border border-slate-600/40 flex items-center justify-center text-xs font-mono text-slate-400">
                          {item.step_number}
                        </div>

                        {/* Content */}
                        <div className="flex-1 min-w-0 space-y-1">
                          <div className="flex items-center flex-wrap gap-2">
                            <span className="text-sm font-medium text-slate-200">{item.step_name}</span>
                            {item.responsible_role && (
                              <span className={`text-xs px-2 py-0.5 rounded-md ${ROLE_BADGE[item.responsible_role] ?? "bg-slate-700/40 text-slate-400"}`}>
                                {item.responsible_role}
                              </span>
                            )}
                            <span className={`text-xs px-2 py-0.5 rounded-md border ${STATUS_BADGE[item.status] ?? ""}`}>
                              {item.status}
                            </span>
                          </div>
                          {item.step_description && (
                            <p className="text-xs text-slate-400 leading-relaxed">{item.step_description}</p>
                          )}
                          <div className="flex flex-wrap gap-4 pt-1">
                            {item.control_check && (
                              <div className="text-xs">
                                <span className="text-slate-600">Control: </span>
                                <span className="text-slate-400">{item.control_check}</span>
                              </div>
                            )}
                            {item.required_evidence && (
                              <div className="text-xs">
                                <span className="text-slate-600">Evidence: </span>
                                <span className="text-slate-400">{item.required_evidence}</span>
                              </div>
                            )}
                          </div>
                        </div>

                        {/* Status selector */}
                        <div className="shrink-0">
                          <select
                            value={item.status}
                            onChange={(e) => updateStatus(item.id, e.target.value as SOPStatus)}
                            disabled={saving === item.id}
                            className="bg-slate-800/60 border border-slate-700/50 text-slate-300 text-xs rounded-lg px-2 py-1.5 focus:outline-none focus:border-teal-500/40 disabled:opacity-50"
                          >
                            {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
                          </select>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}

        {/* Compliance reminder */}
        <div className="bg-slate-800/40 border border-slate-700/30 rounded-xl p-4 text-xs text-slate-600 space-y-1">
          <p className="text-slate-500 font-medium">Compliance Reminders for Pilot</p>
          <p>• This is a manual payment holding workflow — not legal escrow.</p>
          <p>• No automatic disbursement. All payouts require manual finance processing and admin recording.</p>
          <p>• MYR only for pilot. No FX, no financing disbursement, no cargo/supplier payments yet.</p>
          <p>• Designated payment account details must be communicated to customers via Nexum notifications only.</p>
        </div>

        {/* Footer nav */}
        <div className="flex items-center justify-between pt-4 border-t border-slate-700/40">
          <Link href="/admin/payment-operations" className="text-sm text-teal-400 hover:text-teal-300 transition-colors">
            ← Payment Operations
          </Link>
          <Link href="/admin/go-live-readiness" className="text-sm text-slate-500 hover:text-slate-300 transition-colors">
            Go-Live Readiness
          </Link>
        </div>

      </div>
    </div>
  );
}
