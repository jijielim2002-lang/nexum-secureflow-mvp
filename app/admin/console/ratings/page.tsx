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

interface Rating {
  id: string; company_id: string; company_name?: string;
  overall_rating: number; total_completed_trips: number; total_completed_parcels: number;
  pickup_on_time_rate: number; delivery_on_time_rate: number;
  scan_compliance_rate: number; pod_quality_rate: number; customer_rating_avg: number;
  last_computed_at?: string;
}

function RatingBar({ label, value, weight, color }: { label: string; value: number; weight: number; color: string }) {
  return (
    <div>
      <div className="flex justify-between text-xs mb-1">
        <span className="text-slate-400">{label}</span>
        <div className="flex gap-3">
          <span className="text-slate-600">w{weight}%</span>
          <span className="font-semibold text-slate-200">{value.toFixed(1)}%</span>
        </div>
      </div>
      <div className="h-1 bg-slate-700 rounded-full overflow-hidden">
        <div className={`h-full ${color} rounded-full`} style={{ width: `${Math.min(value, 100)}%` }} />
      </div>
    </div>
  );
}

export default function AdminRatings() {
  const [ratings, setRatings]     = useState<Rating[]>([]);
  const [loading, setLoading]     = useState(true);
  const [computing, setComputing] = useState<string | null>(null);
  const [msg, setMsg]             = useState("");
  const [expanded, setExpanded]   = useState<string | null>(null);

  const load = useCallback(async () => {
    const token = await getToken();
    const d = await fetch("/api/console/ratings", { headers: { Authorization: `Bearer ${token}` } }).then(r => r.json());
    setRatings(Array.isArray(d) ? d : []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const compute = async (companyId?: string) => {
    const key = companyId ?? "all";
    setComputing(key); setMsg("");
    const token = await getToken();
    const res = await fetch("/api/console/ratings", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ company_id: companyId }),
    });
    const data = await res.json();
    if (res.ok) { setMsg(`✓ Rating${companyId ? "" : "s"} recomputed.`); load(); }
    else setMsg(data.error ?? "Failed.");
    setComputing(null);
  };

  const stars = (n: number) => {
    const s = Math.round(n / 20);
    return "★".repeat(s) + "☆".repeat(5 - s);
  };

  const scoreColor = (score: number) =>
    score >= 80 ? "text-emerald-400" : score >= 60 ? "text-amber-400" : "text-red-400";

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <header className="bg-slate-900 border-b border-slate-800 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link href="/admin/console" className="text-slate-500 hover:text-slate-300 text-sm">← Console Admin</Link>
          <h1 className="text-xl font-bold text-white">Supplier Ratings</h1>
        </div>
        <button onClick={() => compute()} disabled={computing === "all"}
          className="bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-50 transition-colors">
          {computing === "all" ? "Computing..." : "Recompute All"}
        </button>
      </header>

      <main className="max-w-4xl mx-auto px-6 py-8 space-y-4">
        {msg && <div className={`text-sm rounded-lg px-4 py-2 ${msg.startsWith("✓") ? "bg-emerald-500/10 text-emerald-300" : "bg-red-500/10 text-red-300"}`}>{msg}</div>}

        {/* Weight legend */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
          <p className="text-xs font-semibold text-slate-400 mb-2">Rating Weights</p>
          <div className="grid grid-cols-5 gap-2 text-xs text-center">
            {[
              ["Pickup Punct.", "30%", "text-blue-400"],
              ["Delivery", "35%", "text-emerald-400"],
              ["Scan Compl.", "15%", "text-violet-400"],
              ["POD Quality", "10%", "text-amber-400"],
              ["Customer Rating", "10%", "text-pink-400"],
            ].map(([l, w, c]) => (
              <div key={l} className="bg-slate-800 rounded-lg p-2">
                <p className="text-slate-500">{l}</p>
                <p className={`font-bold text-sm ${c}`}>{w}</p>
              </div>
            ))}
          </div>
        </div>

        {loading && <p className="text-slate-500 text-sm">Loading...</p>}
        {!loading && ratings.length === 0 && (
          <div className="bg-slate-900 border border-slate-800 rounded-xl py-12 text-center text-slate-500 text-sm">
            No supplier ratings yet. Click &quot;Recompute All&quot; to generate.
          </div>
        )}

        <div className="space-y-3">
          {ratings.sort((a, b) => b.overall_rating - a.overall_rating).map((r, i) => (
            <div key={r.id} className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
              <div className="p-4 flex items-center gap-4 cursor-pointer" onClick={() => setExpanded(expanded === r.id ? null : r.id)}>
                <div className="text-slate-600 font-bold text-lg w-6 text-center">{i + 1}</div>
                <div className="flex-1">
                  <p className="font-semibold text-white">{r.company_name ?? r.company_id}</p>
                  <p className="text-xs text-slate-500">{r.total_completed_trips} trips · {r.total_completed_parcels} parcels</p>
                </div>
                <div className="text-right">
                  <p className={`text-2xl font-bold ${scoreColor(r.overall_rating)}`}>{r.overall_rating.toFixed(1)}</p>
                  <p className="text-xs text-amber-400">{stars(r.overall_rating)}</p>
                </div>
                <div className="text-slate-600 text-sm">{expanded === r.id ? "▲" : "▼"}</div>
              </div>

              {expanded === r.id && (
                <div className="border-t border-slate-800 px-4 pb-4 pt-3 space-y-2.5">
                  <RatingBar label="Pickup Punctuality"  value={r.pickup_on_time_rate}    weight={30} color="bg-blue-500" />
                  <RatingBar label="Delivery On Time"    value={r.delivery_on_time_rate}  weight={35} color="bg-emerald-500" />
                  <RatingBar label="Scan Compliance"     value={r.scan_compliance_rate}   weight={15} color="bg-violet-500" />
                  <RatingBar label="POD Quality"         value={r.pod_quality_rate}       weight={10} color="bg-amber-500" />
                  <RatingBar label="Customer Rating"     value={(r.customer_rating_avg / 5) * 100} weight={10} color="bg-pink-500" />
                  <div className="flex items-center justify-between pt-2">
                    <p className="text-[10px] text-slate-600">
                      Last computed: {r.last_computed_at ? r.last_computed_at.slice(0,16).replace("T"," ") : "Never"}
                    </p>
                    <button onClick={() => compute(r.company_id)} disabled={computing === r.company_id}
                      className="text-xs bg-blue-600/20 hover:bg-blue-600/30 text-blue-300 border border-blue-500/20 px-3 py-1.5 rounded-lg disabled:opacity-50 transition-colors">
                      {computing === r.company_id ? "..." : "Recompute"}
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>

        <div className="text-xs text-slate-600 border-t border-slate-800 pt-4">
          Pickup Punctuality: pickup within 5 min of scheduled departure. Delivery: within max transit hours (PG↔KL 6h, KL↔JB 5h).
          Scan: all events scanned, no gaps. POD: photo proof of delivery submitted. Customer rating: average of 1–5 star ratings.
        </div>
      </main>
    </div>
  );
}
