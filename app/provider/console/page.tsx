"use client";
import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { LogoutButton } from "@/components/LogoutButton";

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

interface Slot {
  id: string; slot_reference: string; slot_date: string;
  departure_time: string; expected_arrival_time?: string;
  slot_status: string; same_day_arrival: boolean;
  total_slot_revenue?: number;
  console_routes?: {
    route_code: string; origin_city: string; destination_city: string;
    max_transit_hours: number; minimum_slot_revenue?: number;
  };
  console_parcels?: { tracking_number: string; parcel_status: string }[];
}

interface Rating {
  overall_rating: number; total_completed_trips: number; total_completed_parcels: number;
  pickup_on_time_rate: number; delivery_on_time_rate: number; scan_compliance_rate: number;
}

interface Wallet {
  available_balance: number; pending_balance: number; total_earned: number;
}

// Format date as "Wed, 12 Aug"
function fmtDate(d: string) {
  return new Date(d + "T00:00:00").toLocaleDateString("en-MY", { weekday: "short", day: "numeric", month: "short" });
}

// Route short code color
function routeColor(code?: string) {
  if (!code) return "text-slate-400 bg-slate-800";
  if (code.startsWith("PG") || code.startsWith("PG")) return "text-orange-300 bg-orange-500/15";
  if (code.includes("JB") || code.includes("JB")) return "text-violet-300 bg-violet-500/15";
  return "text-blue-300 bg-blue-500/15";
}

export default function ProviderConsole() {
  const [mySlots,   setMySlots]   = useState<Slot[]>([]);
  const [openSlots, setOpenSlots] = useState<Slot[]>([]);
  const [rating,    setRating]    = useState<Rating | null>(null);
  const [wallet,    setWallet]    = useState<Wallet | null>(null);
  const [loading,   setLoading]   = useState(true);
  const [tab,       setTab]       = useState<"mine"|"open">("mine");

  const load = useCallback(async () => {
    const token = await getToken();
    const h = { Authorization: `Bearer ${token}` };
    const [myRes, openRes, rRes, wRes] = await Promise.all([
      fetch("/api/console/slots", { headers: h }),
      fetch("/api/console/slots?status=Released", { headers: h }),
      fetch("/api/console/ratings", { headers: h }),
      fetch("/api/console/wallets?wallet_type=Supplier", { headers: h }),
    ]);
    const [myData, openData, rData, wData] = await Promise.all([
      myRes.json(), openRes.json(), rRes.json(), wRes.json()
    ]);
    setMySlots(Array.isArray(myData)
      ? myData.filter((s: Slot) => ["Booked","Assigned","In Progress","Completed"].includes(s.slot_status))
      : []);
    setOpenSlots(Array.isArray(openData) ? openData : []);
    if (Array.isArray(rData) && rData[0]) setRating(rData[0]);
    if (wData?.wallets?.[0]) setWallet(wData.wallets[0]);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <header className="bg-slate-900 border-b border-slate-800 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link href="/provider" className="text-slate-500 hover:text-slate-300 text-sm">← Provider</Link>
          <h1 className="text-xl font-bold text-white">Console Transport</h1>
        </div>
        <div className="flex gap-3 items-center">
          <Link href="/provider/console/wallet" className="text-sm text-slate-400 hover:text-white border border-slate-700 px-3 py-1.5 rounded-lg transition-colors">Wallet</Link>
          <Link href="/provider/console/slots" className="text-sm text-emerald-400 hover:text-white border border-emerald-700/50 hover:bg-emerald-600 px-3 py-1.5 rounded-lg transition-colors font-medium">Browse Slots</Link>
          <LogoutButton />
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-6 py-8 space-y-6">

        {/* Wallet stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { label: "Available Balance", value: `RM ${Number(wallet?.available_balance ?? 0).toFixed(2)}`, color: "text-emerald-400" },
            { label: "Pending Earnings",  value: `RM ${Number(wallet?.pending_balance  ?? 0).toFixed(2)}`, color: "text-amber-400"  },
            { label: "Overall Rating",    value: rating?.overall_rating?.toFixed(1) ?? "—",                color: "text-blue-400"   },
            { label: "Completed Trips",   value: String(rating?.total_completed_trips ?? 0),               color: "text-slate-200"  },
          ].map(s => (
            <div key={s.label} className="bg-slate-900 border border-slate-800 rounded-xl p-4">
              <p className="text-xs text-slate-500 mb-1">{s.label}</p>
              <p className={`text-2xl font-bold ${s.color}`}>{s.value}</p>
            </div>
          ))}
        </div>

        {/* Performance */}
        {rating && (
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
            <h2 className="text-sm font-semibold text-slate-300 mb-4">Supplier Performance</h2>
            <div className="grid grid-cols-3 gap-4">
              {[
                { label: "Pickup On Time",   value: rating.pickup_on_time_rate,   weight: "30%" },
                { label: "Delivery On Time", value: rating.delivery_on_time_rate, weight: "35%" },
                { label: "Scan Compliance",  value: rating.scan_compliance_rate,  weight: "15%" },
              ].map(m => (
                <div key={m.label}>
                  <div className="flex justify-between text-xs mb-1">
                    <span className="text-slate-400">{m.label}</span>
                    <span className="text-slate-500">{m.weight}</span>
                  </div>
                  <div className="h-1.5 bg-slate-700 rounded-full overflow-hidden">
                    <div className="h-full bg-blue-500 rounded-full" style={{ width: `${m.value}%` }} />
                  </div>
                  <p className="text-xs font-bold text-white mt-1">{m.value.toFixed(1)}%</p>
                </div>
              ))}
            </div>
            <p className="text-xs text-slate-600 mt-3">{rating.total_completed_parcels} parcels total · PG↔KL ≤6h · KL↔JB ≤5h</p>
          </div>
        )}

        {/* Tabs */}
        <div>
          <div className="flex gap-1 bg-slate-800/50 rounded-xl p-1 mb-5 w-fit">
            {([["mine","My Slots"], ["open","Available to Book"]] as const).map(([t, l]) => (
              <button key={t} onClick={() => setTab(t)}
                className={`px-5 py-2 rounded-lg text-sm font-medium transition-colors ${tab === t ? "bg-slate-700 text-white shadow" : "text-slate-400 hover:text-slate-200"}`}>
                {l}
                {t === "open" && openSlots.length > 0 && (
                  <span className="ml-1.5 bg-emerald-600 text-white text-[10px] px-1.5 py-0.5 rounded-full">{openSlots.length}</span>
                )}
              </button>
            ))}
          </div>

          {loading && (
            <div className="space-y-3">
              {[1,2,3].map(i => <div key={i} className="h-28 bg-slate-900 border border-slate-800 rounded-2xl animate-pulse" />)}
            </div>
          )}

          {/* ── MY SLOTS ── */}
          {!loading && tab === "mine" && (
            <div className="space-y-3">
              {mySlots.length === 0 && (
                <div className="bg-slate-900 border border-slate-800 rounded-2xl p-10 text-center">
                  <p className="text-2xl mb-2">🚚</p>
                  <p className="text-slate-300 font-medium">No booked slots yet</p>
                  <p className="text-slate-500 text-sm mt-1 mb-4">Browse released slots and book a trip to get started.</p>
                  <button onClick={() => setTab("open")} className="text-sm text-emerald-400 hover:text-emerald-300 border border-emerald-700/40 px-4 py-2 rounded-lg transition-colors">
                    Browse Available Slots →
                  </button>
                </div>
              )}
              {mySlots.map(s => <MySlotCard key={s.id} slot={s} />)}
            </div>
          )}

          {/* ── AVAILABLE TO BOOK ── */}
          {!loading && tab === "open" && (
            <div className="space-y-3">
              {openSlots.length === 0 && (
                <div className="bg-slate-900 border border-slate-800 rounded-2xl p-10 text-center">
                  <p className="text-2xl mb-2">⏳</p>
                  <p className="text-slate-300 font-medium">No slots released yet</p>
                  <p className="text-slate-500 text-sm mt-1">Slots are released once RM500 in parcel revenue is collected. Check back shortly.</p>
                </div>
              )}
              {openSlots.map(s => <OpenSlotCard key={s.id} slot={s} onBooked={load} />)}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

// ── My Slot Card ─────────────────────────────────────────────
function MySlotCard({ slot }: { slot: Slot }) {
  const route = slot.console_routes;
  const parcels = slot.console_parcels?.length ?? 0;
  const payout = Math.max(200, parcels * 45);

  return (
    <Link href={`/provider/trips/${slot.slot_reference}`}
      className="block bg-slate-900 border border-slate-800 hover:border-slate-600 rounded-2xl p-5 transition-colors group">
      <div className="flex items-start gap-4">
        {/* Route column */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-2 flex-wrap">
            <span className={`text-[10px] font-bold px-2 py-0.5 rounded font-mono ${routeColor(route?.route_code)}`}>
              {route?.route_code ?? "—"}
            </span>
            <StatusBadge status={slot.slot_status} />
          </div>

          {/* Origin → Dest — large and clear */}
          <div className="flex items-center gap-2 mb-3">
            <span className="text-lg font-bold text-white">{route?.origin_city ?? "—"}</span>
            <span className="text-slate-500">→</span>
            <span className="text-lg font-bold text-white">{route?.destination_city ?? "—"}</span>
          </div>

          {/* Date + Time chips */}
          <div className="flex flex-wrap gap-2 text-xs">
            <span className="flex items-center gap-1 bg-slate-800 border border-slate-700 rounded-lg px-2.5 py-1 text-slate-300">
              📅 {fmtDate(slot.slot_date)}
            </span>
            <span className="flex items-center gap-1 bg-blue-500/10 border border-blue-500/20 rounded-lg px-2.5 py-1 text-blue-300 font-bold">
              🕛 Departs {slot.departure_time.slice(0,5)}
            </span>
            {slot.expected_arrival_time && (
              <span className="flex items-center gap-1 bg-slate-800 border border-slate-700 rounded-lg px-2.5 py-1 text-slate-400">
                🏁 ETA {slot.expected_arrival_time.slice(0,5)}
              </span>
            )}
          </div>
        </div>

        {/* Payout + parcel count */}
        <div className="text-right shrink-0">
          <p className="text-xs text-slate-500">Est. Payout</p>
          <p className="text-xl font-bold text-emerald-400">RM {payout.toFixed(0)}</p>
          <p className="text-xs text-slate-500 mt-0.5">{parcels} parcel{parcels !== 1 ? "s" : ""}</p>
          <p className="text-xs text-slate-600 mt-2 group-hover:text-slate-400 transition-colors">View details →</p>
        </div>
      </div>
    </Link>
  );
}

// ── Open Slot Card ────────────────────────────────────────────
function OpenSlotCard({ slot, onBooked }: { slot: Slot; onBooked: () => void }) {
  const [expanded, setExpanded] = useState(false);
  const [vehicle,  setVehicle]  = useState("");
  const [booking,  setBooking]  = useState(false);
  const [err,      setErr]      = useState("");

  const route     = slot.console_routes;
  const revenue   = Number(slot.total_slot_revenue ?? 0);
  const threshold = Number(route?.minimum_slot_revenue ?? 500);
  const pct       = Math.min(100, Math.round((revenue / threshold) * 100));

  const book = async () => {
    if (!vehicle.trim()) { setErr("Vehicle registration number is required."); return; }
    setBooking(true); setErr("");
    const token = await getToken();
    const res = await fetch(`/api/console/slots/${slot.slot_reference}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ action: "book", vehicle_number: vehicle.trim() })
    });
    const data = await res.json();
    if (data.ok) { onBooked(); }
    else { setErr(data.error ?? "Booking failed. Please try again."); setBooking(false); }
  };

  return (
    <div className={`bg-slate-900 border rounded-2xl p-5 transition-all ${expanded ? "border-emerald-600/50 bg-emerald-950/10" : "border-slate-700 hover:border-slate-500"}`}>
      <div className="flex items-start gap-4">
        {/* Route column */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-2">
            <span className={`text-[10px] font-bold px-2 py-0.5 rounded font-mono ${routeColor(route?.route_code)}`}>
              {route?.route_code ?? "—"}
            </span>
            <span className="text-[10px] bg-emerald-500/15 text-emerald-400 border border-emerald-500/20 px-2 py-0.5 rounded font-semibold">
              RELEASED
            </span>
          </div>

          {/* Origin → Destination — hero text */}
          <div className="flex items-center gap-3 mb-3">
            <div className="text-center">
              <p className="text-xl font-black text-white leading-tight">{route?.origin_city ?? "—"}</p>
              <p className="text-[10px] text-slate-500 uppercase tracking-wide">Origin</p>
            </div>
            <div className="flex flex-col items-center gap-0.5">
              <div className="w-8 h-px bg-slate-600" />
              <span className="text-slate-500 text-xs">→</span>
              <div className="w-8 h-px bg-slate-600" />
            </div>
            <div className="text-center">
              <p className="text-xl font-black text-white leading-tight">{route?.destination_city ?? "—"}</p>
              <p className="text-[10px] text-slate-500 uppercase tracking-wide">Destination</p>
            </div>
          </div>

          {/* Date + Time chips */}
          <div className="flex flex-wrap gap-2 text-xs">
            <span className="flex items-center gap-1.5 bg-slate-800 border border-slate-700 rounded-lg px-3 py-1.5 text-slate-300 font-medium">
              📅 {fmtDate(slot.slot_date)}
            </span>
            <span className="flex items-center gap-1.5 bg-blue-500/10 border border-blue-500/25 rounded-lg px-3 py-1.5 text-blue-300 font-bold">
              🕛 Departs {slot.departure_time.slice(0,5)}
            </span>
            {slot.expected_arrival_time && (
              <span className="flex items-center gap-1.5 bg-slate-800 border border-slate-700 rounded-lg px-3 py-1.5 text-slate-400">
                🏁 ETA {slot.expected_arrival_time.slice(0,5)}{slot.same_day_arrival ? " (same day)" : ""}
              </span>
            )}
          </div>

          {/* Revenue progress */}
          <div className="mt-3">
            <div className="flex justify-between text-[10px] text-slate-500 mb-1">
              <span>Slot revenue</span>
              <span className="text-emerald-400 font-semibold">RM {revenue.toFixed(0)} / RM {threshold.toFixed(0)}</span>
            </div>
            <div className="h-1.5 bg-slate-800 rounded-full overflow-hidden">
              <div className="h-full bg-emerald-500 rounded-full transition-all" style={{ width: `${pct}%` }} />
            </div>
          </div>
        </div>

        {/* Payout + Book button */}
        <div className="text-right shrink-0 flex flex-col items-end gap-3">
          <div>
            <p className="text-xs text-slate-500">Est. Payout</p>
            <p className="text-2xl font-bold text-emerald-400">RM 200<span className="text-sm font-normal text-slate-500">+</span></p>
            <p className="text-[10px] text-slate-600 mt-0.5">RM45/parcel · min RM200</p>
          </div>
          <button onClick={() => { setExpanded(e => !e); setErr(""); }}
            className={`px-4 py-2 rounded-xl text-sm font-semibold transition-colors ${
              expanded
                ? "bg-slate-700 text-slate-300 hover:bg-slate-600"
                : "bg-emerald-600 hover:bg-emerald-500 text-white"
            }`}>
            {expanded ? "Cancel" : "Book This Slot"}
          </button>
        </div>
      </div>

      {/* Booking form */}
      {expanded && (
        <div className="mt-4 pt-4 border-t border-slate-700 space-y-3">
          <p className="text-xs text-slate-400">Enter your vehicle details to confirm this booking. You commit to picking up all parcels at the origin warehouse by <strong className="text-white">11:50</strong> and delivering to destination warehouse.</p>
          {err && <p className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">{err}</p>}
          <input
            value={vehicle} onChange={e => setVehicle(e.target.value)}
            placeholder="Vehicle registration (e.g. WKL 1234)"
            className="w-full bg-slate-800 border border-slate-600 rounded-xl px-4 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500 uppercase"
          />
          <button onClick={book} disabled={booking}
            className="w-full bg-emerald-600 hover:bg-emerald-500 text-white py-2.5 rounded-xl text-sm font-bold transition-colors disabled:opacity-50">
            {booking ? "Confirming booking..." : "Confirm — Book This Slot"}
          </button>
        </div>
      )}
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    "Booked":      "bg-blue-500/15 text-blue-300 border-blue-500/30",
    "In Progress": "bg-amber-500/15 text-amber-300 border-amber-500/30",
    "Completed":   "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
    "Assigned":    "bg-violet-500/15 text-violet-300 border-violet-500/30",
  };
  return (
    <span className={`text-[10px] px-2 py-0.5 rounded-full border font-semibold ${map[status] ?? "bg-slate-700 text-slate-400 border-slate-600"}`}>
      {status.toUpperCase()}
    </span>
  );
}
