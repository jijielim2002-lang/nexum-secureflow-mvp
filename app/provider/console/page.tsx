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
  console_routes?: { route_code: string; origin_city: string; destination_city: string; max_transit_hours: number };
  console_parcels?: { tracking_number: string; parcel_status: string }[];
}

interface Rating {
  overall_rating: number; total_completed_trips: number; total_completed_parcels: number;
  pickup_on_time_rate: number; delivery_on_time_rate: number; scan_compliance_rate: number;
}

interface Wallet {
  available_balance: number; pending_balance: number; total_earned: number;
}

export default function ProviderConsole() {
  const [mySlots, setMySlots] = useState<Slot[]>([]);
  const [openSlots, setOpenSlots] = useState<Slot[]>([]);
  const [rating, setRating] = useState<Rating | null>(null);
  const [wallet, setWallet] = useState<Wallet | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"mine"|"open">("mine");

  const load = useCallback(async () => {
    const token = await getToken();
    const h = { Authorization: `Bearer ${token}` };
    const [myRes, openRes, rRes, wRes] = await Promise.all([
      fetch("/api/console/slots", { headers: h }),
      fetch("/api/console/slots?status=Open", { headers: h }),
      fetch("/api/console/ratings", { headers: h }),
      fetch("/api/console/wallets?wallet_type=Supplier", { headers: h }),
    ]);
    const [myData, openData, rData, wData] = await Promise.all([
      myRes.json(), openRes.json(), rRes.json(), wRes.json()
    ]);
    setMySlots(Array.isArray(myData) ? myData.filter((s: Slot) => ["Booked","Assigned","In Progress","Completed"].includes(s.slot_status)) : []);
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
        <div className="flex gap-3">
          <Link href="/provider/console/wallet" className="text-sm text-blue-400 hover:text-blue-300">Wallet →</Link>
          <Link href="/provider/console/slots" className="text-sm text-emerald-400 hover:text-emerald-300">Book Slots →</Link>
          <LogoutButton />
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-6 py-8 space-y-6">
        {/* Stats row */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
            <p className="text-xs text-slate-500">Available</p>
            <p className="text-2xl font-bold text-emerald-400">RM {Number(wallet?.available_balance ?? 0).toFixed(2)}</p>
          </div>
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
            <p className="text-xs text-slate-500">Pending Earnings</p>
            <p className="text-2xl font-bold text-amber-400">RM {Number(wallet?.pending_balance ?? 0).toFixed(2)}</p>
          </div>
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
            <p className="text-xs text-slate-500">Overall Rating</p>
            <p className="text-2xl font-bold text-blue-400">{rating?.overall_rating?.toFixed(1) ?? "—"}</p>
          </div>
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
            <p className="text-xs text-slate-500">Completed Trips</p>
            <p className="text-2xl font-bold text-slate-200">{rating?.total_completed_trips ?? 0}</p>
          </div>
        </div>

        {/* Rating breakdown */}
        {rating && (
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
            <h2 className="text-sm font-semibold text-slate-300 mb-4">Supplier Performance</h2>
            <div className="grid grid-cols-3 gap-4">
              {[
                { label: "Pickup On Time",  value: rating.pickup_on_time_rate,   weight: "30%" },
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
            <div className="mt-3 text-xs text-slate-500">
              Pickup within 5 min · Delivery: PG↔KL ≤6h, KL↔JB ≤5h · {rating.total_completed_parcels} parcels total
            </div>
          </div>
        )}

        {/* Tabs: My Slots / Open Slots */}
        <div>
          <div className="flex gap-1 bg-slate-800/50 rounded-lg p-1 mb-4 w-fit">
            {([["mine","My Slots"], ["open","Available to Book"]] as const).map(([t,l]) => (
              <button key={t} onClick={() => setTab(t)}
                className={`px-4 py-1.5 rounded-md text-sm transition-colors ${tab===t ? "bg-slate-600 text-white" : "text-slate-400 hover:text-slate-200"}`}>
                {l}
              </button>
            ))}
          </div>

          {loading && <p className="text-slate-500 text-sm">Loading...</p>}

          {tab === "mine" && (
            <div className="space-y-3">
              {mySlots.length === 0 && !loading && (
                <div className="bg-slate-900 border border-slate-800 rounded-xl p-8 text-center">
                  <p className="text-slate-400 text-sm">No slots booked yet.</p>
                  <button onClick={() => setTab("open")} className="mt-2 text-blue-400 text-sm">Browse open slots →</button>
                </div>
              )}
              {mySlots.map(s => (
                <div key={s.id} className="bg-slate-900 border border-slate-800 rounded-xl p-4">
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-mono text-xs text-blue-400">{s.slot_reference}</span>
                    <StatusBadge status={s.slot_status} />
                  </div>
                  <p className="font-semibold text-white">{s.console_routes?.origin_city} → {s.console_routes?.destination_city}</p>
                  <div className="flex gap-4 text-xs text-slate-400 mt-1">
                    <span>{s.slot_date}</span>
                    <span>Departs {s.departure_time.slice(0,5)}</span>
                    <span>{s.console_parcels?.length ?? 0} parcel(s)</span>
                  </div>
                  <div className="mt-3 text-xs text-slate-500">
                    Payout: RM{(s.console_parcels?.length ?? 0) * 45 < 200 ? "200 (min guarantee)" : `${(s.console_parcels?.length ?? 0) * 45}`} — released after destination scan
                  </div>
                </div>
              ))}
            </div>
          )}

          {tab === "open" && (
            <div className="space-y-3">
              {openSlots.length === 0 && !loading && (
                <p className="text-slate-400 text-sm">No open slots available. Check back soon.</p>
              )}
              {openSlots.map(s => (
                <OpenSlotCard key={s.id} slot={s} onBooked={load} />
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

function OpenSlotCard({ slot, onBooked }: { slot: Slot; onBooked: () => void }) {
  const [expanded, setExpanded] = useState(false);
  const [vehicle, setVehicle] = useState("");
  const [booking, setBooking] = useState(false);
  const [err, setErr] = useState("");

  const book = async () => {
    if (!vehicle) { setErr("Vehicle number required."); return; }
    setBooking(true); setErr("");
    const token = await getToken();
    const res = await fetch(`/api/console/slots/${slot.slot_reference}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ action: "book", vehicle_number: vehicle })
    });
    const data = await res.json();
    if (data.ok) { onBooked(); }
    else { setErr(data.error ?? "Booking failed."); setBooking(false); }
  };

  return (
    <div className="bg-slate-900 border border-slate-700 rounded-xl p-4">
      <div className="flex items-center justify-between">
        <div>
          <span className="font-mono text-xs text-emerald-400">{slot.slot_reference}</span>
          <p className="font-semibold text-white mt-0.5">{slot.console_routes?.origin_city} → {slot.console_routes?.destination_city}</p>
          <p className="text-xs text-slate-400">{slot.slot_date} · Departs {slot.departure_time.slice(0,5)} · {slot.same_day_arrival ? `ETA ${slot.expected_arrival_time?.slice(0,5)}` : "Next day"}</p>
        </div>
        <button onClick={() => setExpanded(e => !e)}
          className="bg-emerald-600/80 hover:bg-emerald-600 text-white px-3 py-1.5 rounded-lg text-xs font-medium transition-colors">
          {expanded ? "Cancel" : "Book This Slot"}
        </button>
      </div>
      <p className="text-xs text-slate-500 mt-1">Min. payout RM200 per trip (or RM45×parcels, whichever higher)</p>
      {expanded && (
        <div className="mt-3 space-y-2">
          {err && <p className="text-xs text-red-400">{err}</p>}
          <input value={vehicle} onChange={e => setVehicle(e.target.value)} placeholder="Vehicle registration (e.g. WKL1234)"
            className="w-full bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500" />
          <button onClick={book} disabled={booking}
            className="w-full bg-emerald-600 hover:bg-emerald-500 text-white py-2 rounded-lg text-sm font-semibold transition-colors disabled:opacity-50">
            {booking ? "Booking..." : "Confirm Booking"}
          </button>
        </div>
      )}
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    Booked: "bg-blue-500/15 text-blue-300 border-blue-500/30",
    "In Progress": "bg-amber-500/15 text-amber-300 border-amber-500/30",
    Completed: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
  };
  return <span className={`text-xs px-2 py-0.5 rounded-full border ${map[status] ?? "bg-slate-700 text-slate-400 border-slate-600"}`}>{status}</span>;
}
