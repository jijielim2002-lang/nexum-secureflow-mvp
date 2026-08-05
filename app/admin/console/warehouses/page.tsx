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

interface Warehouse {
  id: string; warehouse_code: string; warehouse_name: string; city: string;
  state: string; full_address: string; operating_hours_open: string;
  operating_hours_close: string; is_active: boolean; created_at: string;
}

const BLANK: Omit<Warehouse, "id"|"created_at"> = {
  warehouse_code: "", warehouse_name: "", city: "", state: "",
  full_address: "", operating_hours_open: "10:00", operating_hours_close: "19:00", is_active: true,
};

export default function AdminWarehouses() {
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Partial<Warehouse> | null>(null);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");

  const load = useCallback(async () => {
    const token = await getToken();
    const res = await fetch("/api/console/warehouses", { headers: { Authorization: `Bearer ${token}` } });
    const d = await res.json();
    setWarehouses(Array.isArray(d) ? d : []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const save = async () => {
    if (!editing) return;
    setSaving(true); setMsg("");
    const token = await getToken();
    const isNew = !editing.id;
    const res = await fetch(isNew ? "/api/console/warehouses" : `/api/console/warehouses/${editing.id}`, {
      method: isNew ? "POST" : "PATCH",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify(editing),
    });
    const data = await res.json();
    if (res.ok) { setMsg("✓ Saved."); setEditing(null); load(); }
    else setMsg(data.error ?? "Save failed.");
    setSaving(false);
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <header className="bg-slate-900 border-b border-slate-800 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link href="/admin/console" className="text-slate-500 hover:text-slate-300 text-sm">← Console Admin</Link>
          <h1 className="text-xl font-bold text-white">Warehouses</h1>
        </div>
        <button onClick={() => setEditing({ ...BLANK })}
          className="bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors">
          + Add Warehouse
        </button>
      </header>

      <main className="max-w-4xl mx-auto px-6 py-8 space-y-4">
        {msg && <div className={`text-sm rounded-lg px-4 py-2 ${msg.startsWith("✓") ? "bg-emerald-500/10 text-emerald-300" : "bg-red-500/10 text-red-300"}`}>{msg}</div>}

        {/* Edit form */}
        {editing && (
          <div className="bg-slate-800 border border-slate-600 rounded-xl p-6 space-y-4">
            <h3 className="font-semibold text-white">{editing.id ? "Edit Warehouse" : "New Warehouse"}</h3>
            <div className="grid grid-cols-2 gap-4">
              {[
                ["warehouse_code", "Code (e.g. WH-PG)"], ["warehouse_name", "Name"],
                ["city", "City"], ["state", "State"],
              ].map(([k, label]) => (
                <div key={k}>
                  <label className="block text-xs text-slate-400 mb-1">{label}</label>
                  <input value={String(editing[k as keyof typeof editing] ?? "")}
                    onChange={e => setEditing(ed => ({ ...ed!, [k]: e.target.value }))}
                    className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500" />
                </div>
              ))}
              <div className="col-span-2">
                <label className="block text-xs text-slate-400 mb-1">Full Address</label>
                <textarea value={String(editing.full_address ?? "")}
                  onChange={e => setEditing(ed => ({ ...ed!, full_address: e.target.value }))}
                  rows={2} className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500 resize-none" />
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-1">Opens</label>
                <input type="time" value={String(editing.operating_hours_open ?? "10:00")}
                  onChange={e => setEditing(ed => ({ ...ed!, operating_hours_open: e.target.value }))}
                  className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500" />
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-1">Closes</label>
                <input type="time" value={String(editing.operating_hours_close ?? "19:00")}
                  onChange={e => setEditing(ed => ({ ...ed!, operating_hours_close: e.target.value }))}
                  className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500" />
              </div>
              <div className="col-span-2 flex items-center gap-2">
                <input type="checkbox" id="is_active" checked={!!editing.is_active}
                  onChange={e => setEditing(ed => ({ ...ed!, is_active: e.target.checked }))}
                  className="w-4 h-4 rounded" />
                <label htmlFor="is_active" className="text-sm text-slate-300">Active</label>
              </div>
            </div>
            <div className="flex gap-2">
              <button onClick={save} disabled={saving}
                className="bg-blue-600 hover:bg-blue-500 text-white px-5 py-2 rounded-lg text-sm font-semibold disabled:opacity-50 transition-colors">
                {saving ? "Saving..." : "Save"}
              </button>
              <button onClick={() => setEditing(null)}
                className="bg-slate-700 hover:bg-slate-600 text-slate-300 px-5 py-2 rounded-lg text-sm transition-colors">
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* List */}
        {loading && <p className="text-slate-500 text-sm">Loading...</p>}
        <div className="space-y-3">
          {warehouses.map(w => (
            <div key={w.id} className="bg-slate-900 border border-slate-800 rounded-xl p-4 flex items-start justify-between gap-4">
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-mono text-xs text-blue-400">{w.warehouse_code}</span>
                  <span className={`text-xs px-1.5 py-0.5 rounded-full border ${w.is_active ? "bg-emerald-500/10 text-emerald-300 border-emerald-500/20" : "bg-slate-700/50 text-slate-500 border-slate-600"}`}>
                    {w.is_active ? "Active" : "Inactive"}
                  </span>
                </div>
                <p className="font-semibold text-white mt-1">{w.warehouse_name}</p>
                <p className="text-xs text-slate-400">{w.city}, {w.state}</p>
                <p className="text-xs text-slate-500 mt-0.5">{w.full_address}</p>
                <p className="text-xs text-slate-600 mt-1">Hours: {w.operating_hours_open?.slice(0,5)} – {w.operating_hours_close?.slice(0,5)}</p>
              </div>
              <button onClick={() => setEditing({ ...w })}
                className="shrink-0 bg-slate-700 hover:bg-slate-600 text-slate-300 text-xs px-3 py-1.5 rounded-lg transition-colors">
                Edit
              </button>
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}
