"use client";
import { useState, useEffect, useCallback } from "react";
import Link from "next/link";

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

interface Supplier {
  id: string; company_id: string; supplier_type: string;
  apad_licence_number?: string; apad_licence_document_url?: string;
  apad_status: string; ssm_document_url?: string;
  payout_bank_name?: string; payout_account_holder?: string;
  approval_status: string; review_note?: string;
  reviewed_at?: string; created_at: string;
  companies?: { name: string };
  console_supplier_vehicles?: { id: string; vehicle_number: string; approval_status: string }[];
  console_supplier_drivers?:  { id: string; driver_name: string; approval_status: string }[];
}

const STATUS_ORDER = ["Registered","Documents Submitted","Under Review","Approved","Active","Suspended","Rejected","Blacklisted"];
const STATUS_COLOR: Record<string, string> = {
  "Registered":           "bg-slate-700 text-slate-300",
  "Documents Submitted":  "bg-blue-500/15 text-blue-300 border border-blue-500/20",
  "Under Review":         "bg-amber-500/15 text-amber-300 border border-amber-500/20",
  "Approved":             "bg-emerald-500/15 text-emerald-300 border border-emerald-500/20",
  "Active":               "bg-emerald-600/20 text-emerald-200 border border-emerald-500/30",
  "Suspended":            "bg-red-500/15 text-red-300 border border-red-500/20",
  "Rejected":             "bg-red-600/15 text-red-400 border border-red-600/20",
  "Blacklisted":          "bg-red-900/30 text-red-400 border border-red-900/30",
};

export default function AdminSuppliers() {
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [loading, setLoading]     = useState(true);
  const [filter, setFilter]       = useState("all");
  const [selected, setSelected]   = useState<Supplier | null>(null);
  const [newStatus, setNewStatus] = useState("");
  const [note, setNote]           = useState("");
  const [saving, setSaving]       = useState(false);
  const [msg, setMsg]             = useState("");

  const load = useCallback(async () => {
    const token = await getToken();
    const d = await fetch("/api/console/suppliers", { headers: { Authorization: `Bearer ${token}` } }).then(r => r.json());
    setSuppliers(Array.isArray(d) ? d : []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const approve = async () => {
    if (!selected || !newStatus) return;
    setSaving(true); setMsg("");
    const token = await getToken();
    const res = await fetch(`/api/console/suppliers/${selected.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ approval_status: newStatus, review_note: note }),
    });
    const data = await res.json();
    if (data.ok) { setMsg("✓ Updated."); setSelected(null); load(); }
    else setMsg(data.error ?? "Failed.");
    setSaving(false);
  };

  const displayed = filter === "all" ? suppliers : suppliers.filter(s => s.approval_status === filter);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <header className="bg-slate-900 border-b border-slate-800 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link href="/admin/console" className="text-slate-500 hover:text-slate-300 text-sm">← Console Admin</Link>
          <h1 className="text-xl font-bold text-white">Supplier Onboarding</h1>
        </div>
        <div className="flex gap-2">
          <Link href="/admin/console/vehicles" className="text-xs text-slate-400 hover:text-slate-200 bg-slate-800 px-3 py-1.5 rounded-lg">Vehicles →</Link>
          <Link href="/admin/console/drivers"  className="text-xs text-slate-400 hover:text-slate-200 bg-slate-800 px-3 py-1.5 rounded-lg">Drivers →</Link>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-6 py-8 space-y-4">
        {msg && <div className={`text-sm rounded-lg px-4 py-2 ${msg.startsWith("✓") ? "bg-emerald-500/10 text-emerald-300" : "bg-red-500/10 text-red-300"}`}>{msg}</div>}

        {/* Review modal */}
        {selected && (
          <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
            <div className="bg-slate-800 border border-slate-600 rounded-xl p-6 max-w-lg w-full space-y-4 max-h-[90vh] overflow-y-auto">
              <h3 className="font-semibold text-white">Review Supplier</h3>
              <p className="text-sm text-slate-400">{selected.companies?.name ?? selected.company_id}</p>

              {/* Document links */}
              <div className="bg-slate-900 rounded-lg p-4 space-y-2 text-xs">
                <p className="font-semibold text-slate-300 mb-2">Documents</p>
                {[
                  ["APAD Licence", selected.apad_licence_document_url],
                  ["SSM",          selected.ssm_document_url],
                ].map(([label, url]) => url ? (
                  <div key={label} className="flex justify-between">
                    <span className="text-slate-400">{label}</span>
                    <a href={String(url)} target="_blank" className="text-blue-400 hover:underline">View ↗</a>
                  </div>
                ) : (
                  <div key={label} className="flex justify-between">
                    <span className="text-slate-400">{label}</span>
                    <span className="text-slate-600">Not uploaded</span>
                  </div>
                ))}
                <div className="flex justify-between">
                  <span className="text-slate-400">APAD No.</span>
                  <span className="text-slate-200">{selected.apad_licence_number ?? "—"}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Bank / Account Holder</span>
                  <span className="text-slate-200">{selected.payout_bank_name} · {selected.payout_account_holder}</span>
                </div>
              </div>

              {/* Vehicles & drivers summary */}
              {(selected.console_supplier_vehicles?.length ?? 0) > 0 && (
                <div className="bg-slate-900 rounded-lg p-3 text-xs">
                  <p className="text-slate-400 mb-1">Vehicles ({selected.console_supplier_vehicles!.length})</p>
                  {selected.console_supplier_vehicles!.map(v => (
                    <div key={v.id} className="flex justify-between py-0.5">
                      <span className="font-mono text-slate-300">{v.vehicle_number}</span>
                      <span className="text-slate-500">{v.approval_status}</span>
                    </div>
                  ))}
                </div>
              )}

              <div>
                <label className="block text-xs text-slate-400 mb-1">New Status</label>
                <select value={newStatus} onChange={e => setNewStatus(e.target.value)}
                  className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500">
                  <option value="">Select status</option>
                  {STATUS_ORDER.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-1">Review Note</label>
                <textarea value={note} onChange={e => setNote(e.target.value)} rows={2}
                  className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500 resize-none" />
              </div>
              {msg && <p className="text-xs text-red-400">{msg}</p>}
              <div className="flex gap-2">
                <button onClick={approve} disabled={saving || !newStatus}
                  className="bg-blue-600 hover:bg-blue-500 text-white px-5 py-2 rounded-lg text-sm font-semibold disabled:opacity-50 transition-colors">
                  {saving ? "Saving..." : "Update Status"}
                </button>
                <button onClick={() => setSelected(null)}
                  className="bg-slate-700 hover:bg-slate-600 text-slate-300 px-5 py-2 rounded-lg text-sm transition-colors">
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Filter */}
        <div className="flex flex-wrap gap-2">
          {["all","Documents Submitted","Under Review","Approved","Active","Rejected"].map(f => (
            <button key={f} onClick={() => setFilter(f)}
              className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${filter===f ? "bg-slate-600 text-white border-slate-500" : "border-slate-700 text-slate-400 hover:text-slate-200"}`}>
              {f === "all" ? `All (${suppliers.length})` : `${f} (${suppliers.filter(s => s.approval_status === f).length})`}
            </button>
          ))}
        </div>

        {loading && <p className="text-slate-500 text-sm">Loading...</p>}

        <div className="space-y-3">
          {displayed.map(s => (
            <div key={s.id} className="bg-slate-900 border border-slate-800 rounded-xl p-4 flex items-start justify-between gap-4">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <p className="font-semibold text-white">{s.companies?.name ?? s.company_id}</p>
                  <span className={`text-xs px-2 py-0.5 rounded-full ${STATUS_COLOR[s.approval_status] ?? "bg-slate-700 text-slate-400"}`}>
                    {s.approval_status}
                  </span>
                  <span className="text-xs text-slate-600">{s.supplier_type}</span>
                </div>
                <div className="flex gap-4 text-xs text-slate-500">
                  <span>APAD: <span className={s.apad_licence_document_url ? "text-emerald-400" : "text-red-400"}>{s.apad_licence_document_url ? "Uploaded" : "Missing"}</span></span>
                  <span>SSM: <span className={s.ssm_document_url ? "text-emerald-400" : "text-slate-500"}>{s.ssm_document_url ? "Uploaded" : "—"}</span></span>
                  <span>Bank: <span className={s.payout_bank_name ? "text-slate-300" : "text-red-400"}>{s.payout_bank_name ?? "Missing"}</span></span>
                  <span>{s.console_supplier_vehicles?.length ?? 0} vehicle(s) · {s.console_supplier_drivers?.length ?? 0} driver(s)</span>
                </div>
                {s.review_note && <p className="text-xs text-amber-400 mt-1">Note: {s.review_note}</p>}
                <p className="text-[10px] text-slate-600 mt-1">Submitted {s.created_at.slice(0,10)}</p>
              </div>
              <button onClick={() => { setSelected(s); setNewStatus(s.approval_status); setNote(s.review_note ?? ""); setMsg(""); }}
                className="shrink-0 bg-blue-600/20 hover:bg-blue-600/30 text-blue-300 border border-blue-500/20 text-xs px-3 py-1.5 rounded-lg transition-colors">
                Review
              </button>
            </div>
          ))}
          {displayed.length === 0 && !loading && (
            <div className="bg-slate-900 border border-slate-800 rounded-xl py-12 text-center text-slate-500 text-sm">
              No suppliers in this category.
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
