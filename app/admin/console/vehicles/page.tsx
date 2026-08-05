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

interface Vehicle {
  id: string; supplier_company_id: string; vehicle_number: string;
  vehicle_type?: string; vehicle_size?: string;
  vehicle_permit_number?: string; permit_expiry_date?: string;
  vehicle_permit_document_url?: string;
  vehicle_registration_document_url?: string;
  road_tax_document_url?: string; road_tax_expiry_date?: string;
  insurance_document_url?: string; insurance_expiry_date?: string;
  vehicle_photo_url?: string;
  approval_status: string; review_note?: string; created_at: string;
  companies?: { name: string };
}

const STATUS_COLOR: Record<string, string> = {
  "Submitted":       "bg-slate-700 text-slate-300",
  "Permit Review":   "bg-blue-500/15 text-blue-300",
  "Insurance Review":"bg-violet-500/15 text-violet-300",
  "Approved":        "bg-emerald-500/15 text-emerald-300",
  "Active":          "bg-emerald-600/20 text-emerald-200",
  "Expired":         "bg-amber-500/15 text-amber-300",
  "Suspended":       "bg-red-500/15 text-red-300",
  "Rejected":        "bg-red-600/15 text-red-400",
};

const STATUSES = ["Submitted","Permit Review","Insurance Review","Approved","Active","Expired","Suspended","Rejected"];

export default function AdminVehicles() {
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [loading, setLoading]   = useState(true);
  const [filter, setFilter]     = useState("all");
  const [selected, setSelected] = useState<Vehicle | null>(null);
  const [newStatus, setNewStatus] = useState("");
  const [note, setNote]           = useState("");
  const [saving, setSaving]       = useState(false);
  const [msg, setMsg]             = useState("");

  const load = useCallback(async () => {
    const token = await getToken();
    const d = await fetch("/api/console/vehicles", { headers: { Authorization: `Bearer ${token}` } }).then(r => r.json());
    setVehicles(Array.isArray(d) ? d : []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const update = async () => {
    if (!selected || !newStatus) return;
    setSaving(true); setMsg("");
    const token = await getToken();
    const res = await fetch(`/api/console/vehicles/${selected.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ approval_status: newStatus, review_note: note }),
    });
    const data = await res.json();
    if (data.ok) { setMsg("✓ Updated."); setSelected(null); load(); }
    else setMsg(data.error ?? "Failed.");
    setSaving(false);
  };

  const displayed = filter === "all" ? vehicles : vehicles.filter(v => v.approval_status === filter);
  const pending   = vehicles.filter(v => ["Submitted","Permit Review","Insurance Review"].includes(v.approval_status)).length;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <header className="bg-slate-900 border-b border-slate-800 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link href="/admin/console/suppliers" className="text-slate-500 hover:text-slate-300 text-sm">← Suppliers</Link>
          <h1 className="text-xl font-bold text-white">Vehicle Approvals</h1>
          {pending > 0 && <span className="text-xs bg-red-500/20 text-red-300 border border-red-500/30 px-2 py-0.5 rounded-full">{pending} pending</span>}
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-6 py-8 space-y-4">
        {msg && <div className={`text-sm rounded-lg px-4 py-2 ${msg.startsWith("✓") ? "bg-emerald-500/10 text-emerald-300" : "bg-red-500/10 text-red-300"}`}>{msg}</div>}

        {selected && (
          <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
            <div className="bg-slate-800 border border-slate-600 rounded-xl p-6 max-w-lg w-full space-y-4 max-h-[90vh] overflow-y-auto">
              <h3 className="font-semibold text-white">Review Vehicle — {selected.vehicle_number}</h3>
              <p className="text-sm text-slate-400">{selected.companies?.name}</p>
              <div className="bg-slate-900 rounded-lg p-4 space-y-2 text-xs">
                <p className="font-semibold text-slate-300 mb-1">Document Checklist</p>
                {[
                  ["Vehicle Permit",       selected.vehicle_permit_document_url,      selected.permit_expiry_date],
                  ["Registration / VOC",   selected.vehicle_registration_document_url, null],
                  ["Road Tax",             selected.road_tax_document_url,            selected.road_tax_expiry_date],
                  ["Insurance",            selected.insurance_document_url,           selected.insurance_expiry_date],
                  ["Vehicle Photo",        selected.vehicle_photo_url,                null],
                ].map(([label, url, expiry]) => (
                  <div key={String(label)} className="flex justify-between items-center">
                    <span className="text-slate-400">{label}</span>
                    <div className="flex gap-2 items-center">
                      {expiry && <span className="text-slate-600">exp {String(expiry).slice(0,10)}</span>}
                      {url
                        ? <a href={String(url)} target="_blank" className="text-blue-400 hover:underline">View ↗</a>
                        : <span className="text-red-400">Missing</span>}
                    </div>
                  </div>
                ))}
                <div className="flex justify-between pt-1">
                  <span className="text-slate-400">Type / Size</span>
                  <span className="text-slate-200">{selected.vehicle_type} {selected.vehicle_size}</span>
                </div>
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-1">New Status</label>
                <select value={newStatus} onChange={e => setNewStatus(e.target.value)}
                  className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500">
                  <option value="">Select</option>
                  {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-1">Review Note</label>
                <textarea value={note} onChange={e => setNote(e.target.value)} rows={2}
                  className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-sm text-white focus:outline-none resize-none" />
              </div>
              <div className="flex gap-2">
                <button onClick={update} disabled={saving || !newStatus}
                  className="bg-blue-600 hover:bg-blue-500 text-white px-5 py-2 rounded-lg text-sm font-semibold disabled:opacity-50 transition-colors">
                  {saving ? "Saving..." : "Update"}
                </button>
                <button onClick={() => setSelected(null)}
                  className="bg-slate-700 hover:bg-slate-600 text-slate-300 px-5 py-2 rounded-lg text-sm transition-colors">
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}

        <div className="flex flex-wrap gap-2">
          {["all","Submitted","Permit Review","Insurance Review","Approved","Active","Rejected"].map(f => (
            <button key={f} onClick={() => setFilter(f)}
              className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${filter===f ? "bg-slate-600 text-white border-slate-500" : "border-slate-700 text-slate-400 hover:text-slate-200"}`}>
              {f === "all" ? `All (${vehicles.length})` : `${f} (${vehicles.filter(v => v.approval_status === f).length})`}
            </button>
          ))}
        </div>

        {loading && <p className="text-slate-500 text-sm">Loading...</p>}
        <div className="space-y-3">
          {displayed.map(v => (
            <div key={v.id} className="bg-slate-900 border border-slate-800 rounded-xl p-4 flex items-start justify-between gap-4">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <span className="font-mono font-bold text-white">{v.vehicle_number}</span>
                  <span className={`text-xs px-2 py-0.5 rounded-full ${STATUS_COLOR[v.approval_status] ?? "bg-slate-700 text-slate-400"}`}>{v.approval_status}</span>
                </div>
                <p className="text-sm text-slate-400">{v.companies?.name} · {v.vehicle_type} {v.vehicle_size}</p>
                <div className="flex gap-3 text-xs text-slate-600 mt-1">
                  {v.permit_expiry_date   && <span>Permit exp {v.permit_expiry_date.slice(0,10)}</span>}
                  {v.insurance_expiry_date && <span>Insurance exp {v.insurance_expiry_date.slice(0,10)}</span>}
                </div>
                {v.review_note && <p className="text-xs text-amber-400 mt-1">{v.review_note}</p>}
              </div>
              <button onClick={() => { setSelected(v); setNewStatus(v.approval_status); setNote(v.review_note ?? ""); setMsg(""); }}
                className="shrink-0 bg-blue-600/20 hover:bg-blue-600/30 text-blue-300 border border-blue-500/20 text-xs px-3 py-1.5 rounded-lg transition-colors">
                Review
              </button>
            </div>
          ))}
          {displayed.length === 0 && !loading && (
            <div className="bg-slate-900 border border-slate-800 rounded-xl py-12 text-center text-slate-500 text-sm">No vehicles.</div>
          )}
        </div>
      </main>
    </div>
  );
}
