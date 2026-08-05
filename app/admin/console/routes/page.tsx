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

interface Warehouse { id: string; warehouse_code: string; warehouse_name: string; city: string }
interface Route {
  id: string; route_code: string; origin_warehouse_id: string; destination_warehouse_id: string;
  origin_city: string; destination_city: string; max_transit_hours: number;
  customer_parcel_price: number; supplier_parcel_payout: number;
  minimum_supplier_trip_payout: number; nexum_commission_per_parcel: number;
  same_day_cutoff_time?: string; is_active: boolean;
  origin_warehouse?: { warehouse_name: string; city: string };
  destination_warehouse?: { warehouse_name: string; city: string };
}

const BLANK_ROUTE: Partial<Route> = {
  route_code: "", origin_city: "", destination_city: "",
  max_transit_hours: 6, customer_parcel_price: 50, supplier_parcel_payout: 45,
  minimum_supplier_trip_payout: 200, nexum_commission_per_parcel: 5,
  same_day_cutoff_time: "13:00", is_active: true,
};

export default function AdminRoutes() {
  const [routes, setRoutes]         = useState<Route[]>([]);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [loading, setLoading]       = useState(true);
  const [editing, setEditing]       = useState<Partial<Route> | null>(null);
  const [saving, setSaving]         = useState(false);
  const [msg, setMsg]               = useState("");

  const load = useCallback(async () => {
    const token = await getToken();
    const h = { Authorization: `Bearer ${token}` };
    const [rRes, wRes] = await Promise.all([
      fetch("/api/console/routes", { headers: h }),
      fetch("/api/console/warehouses", { headers: h }),
    ]);
    const [rData, wData] = await Promise.all([rRes.json(), wRes.json()]);
    setRoutes(Array.isArray(rData) ? rData : []);
    setWarehouses(Array.isArray(wData) ? wData : []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const save = async () => {
    setSaving(true); setMsg("");
    const token = await getToken();
    const isNew = !editing?.id;
    const res = await fetch(isNew ? "/api/console/routes" : `/api/console/routes/${editing?.id}`, {
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
          <h1 className="text-xl font-bold text-white">Routes</h1>
        </div>
        <button onClick={() => setEditing({ ...BLANK_ROUTE })}
          className="bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors">
          + Add Route
        </button>
      </header>

      <main className="max-w-4xl mx-auto px-6 py-8 space-y-4">
        {msg && <div className={`text-sm rounded-lg px-4 py-2 ${msg.startsWith("✓") ? "bg-emerald-500/10 text-emerald-300" : "bg-red-500/10 text-red-300"}`}>{msg}</div>}

        {/* Edit form */}
        {editing && (
          <div className="bg-slate-800 border border-slate-600 rounded-xl p-6 space-y-4">
            <h3 className="font-semibold text-white">{editing.id ? "Edit Route" : "New Route"}</h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs text-slate-400 mb-1">Route Code</label>
                <input value={editing.route_code ?? ""} onChange={e => setEditing(ed => ({ ...ed!, route_code: e.target.value }))}
                  placeholder="e.g. PG-KL" className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500 font-mono" />
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-1">Max Transit Hours</label>
                <input type="number" value={editing.max_transit_hours ?? 6}
                  onChange={e => setEditing(ed => ({ ...ed!, max_transit_hours: parseInt(e.target.value) }))}
                  className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500" />
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-1">Origin Warehouse</label>
                <select value={editing.origin_warehouse_id ?? ""} onChange={e => setEditing(ed => ({ ...ed!, origin_warehouse_id: e.target.value }))}
                  className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500">
                  <option value="">Select warehouse</option>
                  {warehouses.map(w => <option key={w.id} value={w.id}>{w.warehouse_name} ({w.city})</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-1">Destination Warehouse</label>
                <select value={editing.destination_warehouse_id ?? ""} onChange={e => setEditing(ed => ({ ...ed!, destination_warehouse_id: e.target.value }))}
                  className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500">
                  <option value="">Select warehouse</option>
                  {warehouses.map(w => <option key={w.id} value={w.id}>{w.warehouse_name} ({w.city})</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-1">Origin City</label>
                <input value={editing.origin_city ?? ""} onChange={e => setEditing(ed => ({ ...ed!, origin_city: e.target.value }))}
                  className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500" />
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-1">Destination City</label>
                <input value={editing.destination_city ?? ""} onChange={e => setEditing(ed => ({ ...ed!, destination_city: e.target.value }))}
                  className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500" />
              </div>
              {[
                ["customer_parcel_price","Customer Price (RM)","50"],
                ["supplier_parcel_payout","Supplier Payout/Parcel (RM)","45"],
                ["minimum_supplier_trip_payout","Min Trip Guarantee (RM)","200"],
                ["nexum_commission_per_parcel","Nexum Commission/Parcel (RM)","5"],
              ].map(([k, label, placeholder]) => (
                <div key={k}>
                  <label className="block text-xs text-slate-400 mb-1">{label}</label>
                  <input type="number" step="0.01" value={Number(editing[k as keyof Route] ?? 0)}
                    onChange={e => setEditing(ed => ({ ...ed!, [k]: parseFloat(e.target.value) }))}
                    placeholder={placeholder}
                    className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500" />
                </div>
              ))}
              <div>
                <label className="block text-xs text-slate-400 mb-1">Same-day Cutoff</label>
                <input type="time" value={editing.same_day_cutoff_time ?? "13:00"}
                  onChange={e => setEditing(ed => ({ ...ed!, same_day_cutoff_time: e.target.value }))}
                  className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500" />
              </div>
              <div className="flex items-end">
                <div className="flex items-center gap-2">
                  <input type="checkbox" id="r_active" checked={!!editing.is_active}
                    onChange={e => setEditing(ed => ({ ...ed!, is_active: e.target.checked }))}
                    className="w-4 h-4 rounded" />
                  <label htmlFor="r_active" className="text-sm text-slate-300">Active</label>
                </div>
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
          {routes.map(r => (
            <div key={r.id} className="bg-slate-900 border border-slate-800 rounded-xl p-4 flex items-start justify-between gap-4">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <span className="font-mono text-xs text-blue-400">{r.route_code}</span>
                  <span className={`text-xs px-1.5 py-0.5 rounded-full border ${r.is_active ? "bg-emerald-500/10 text-emerald-300 border-emerald-500/20" : "bg-slate-700 text-slate-500 border-slate-600"}`}>
                    {r.is_active ? "Active" : "Inactive"}
                  </span>
                </div>
                <p className="font-semibold text-white">{r.origin_city} → {r.destination_city}</p>
                <p className="text-xs text-slate-400 mt-0.5">Max {r.max_transit_hours}h transit · Cutoff {r.same_day_cutoff_time?.slice(0,5)}</p>
                <div className="flex gap-4 text-xs text-slate-500 mt-1.5">
                  <span>Customer: RM{r.customer_parcel_price}</span>
                  <span>Supplier: RM{r.supplier_parcel_payout}/parcel (min RM{r.minimum_supplier_trip_payout})</span>
                  <span>Commission: RM{r.nexum_commission_per_parcel}</span>
                </div>
              </div>
              <button onClick={() => setEditing({ ...r })}
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
