"use client";
import { use, useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { LogoutButton } from "@/components/LogoutButton";
import { NotificationBell } from "@/components/NotificationBell";

async function getToken(): Promise<string> {
  try {
    const { supabase } = await import("@/lib/supabaseClient");
    const { data: { session } } = await supabase.auth.getSession();
    if (session?.access_token) return session.access_token;
  } catch { /**/ }
  try {
    const stored = localStorage.getItem("supabase.auth.token");
    if (stored) return (JSON.parse(stored) as { access_token?: string }).access_token ?? "";
  } catch { /**/ }
  return "";
}

const LEG_STATUS_COLOR: Record<string, string> = {
  Draft:            "bg-slate-700/50 text-slate-400 border-slate-600/50",
  RFQ:              "bg-amber-500/20 text-amber-300 border-amber-500/30",
  Quoted:           "bg-purple-500/20 text-purple-300 border-purple-500/30",
  Assigned:         "bg-blue-500/20 text-blue-300 border-blue-500/30",
  "Awaiting Start": "bg-indigo-500/20 text-indigo-300 border-indigo-500/30",
  "In Progress":    "bg-cyan-500/20 text-cyan-300 border-cyan-500/30",
  Completed:        "bg-emerald-500/20 text-emerald-300 border-emerald-500/30",
  Blocked:          "bg-red-500/20 text-red-400 border-red-500/30",
  Disputed:         "bg-red-500/20 text-red-300 border-red-500/30",
  Cancelled:        "bg-slate-600/30 text-slate-500 border-slate-600/30",
};

const STATUS_TRANSITIONS: Record<string, string[]> = {
  "Awaiting Start": ["In Progress"],
  "In Progress":    ["Completed","Blocked","Disputed"],
  "Assigned":       ["Awaiting Start"],
  "Blocked":        ["In Progress","Disputed"],
};

const RELEASE_COLOR: Record<string, string> = {
  Pending: "text-slate-400", Eligible: "text-amber-400", Approved: "text-blue-400",
  Released: "text-emerald-400", "On Hold": "text-red-400",
};

interface Leg {
  id: string; leg_reference: string; leg_sequence: number; leg_type: string; leg_status: string;
  bundle_reference: string; provider_name?: string;
  origin_location?: string; destination_location?: string;
  expected_start_date?: string; expected_end_date?: string;
  actual_start_at?: string; actual_completed_at?: string;
  leg_amount: number; currency: string;
  handoff_note?: string; risk_flags?: string[];
  trigger_next_leg_on_status?: string;
}
interface Bundle {
  id: string; bundle_reference: string; bundle_title?: string;
  trade_type: string; origin_country?: string; destination_country?: string;
  bundle_status: string; customer_company?: { name?: string };
}
interface Allocation {
  id: string; allocation_type: string; allocation_amount: number; currency: string;
  release_condition?: string; release_status: string; released_at?: string;
}

export default function ProviderLegDetailPage({ params }: { params: Promise<{ leg_reference: string }> }) {
  const { leg_reference } = use(params);
  const [leg,         setLeg]         = useState<Leg | null>(null);
  const [bundle,      setBundle]      = useState<Bundle | null>(null);
  const [allocations, setAllocations] = useState<Allocation[]>([]);
  const [loading,     setLoading]     = useState(true);
  const [err,         setErr]         = useState("");
  const [acting,      setActing]      = useState("");
  const [handoffNote, setHandoffNote] = useState("");
  const [showUpdate,  setShowUpdate]  = useState(false);
  const [newStatus,   setNewStatus]   = useState("");

  const load = useCallback(async () => {
    setLoading(true); setErr("");
    const tok = await getToken();
    const headers = { Authorization: `Bearer ${tok}` };

    // Get bundles list and find the leg in it (we go via orchestration)
    const res  = await fetch("/api/orchestration", { headers });
    const json = await res.json() as { ok?: boolean; bundles?: (Bundle & { shipment_legs?: Leg[] })[]; error?: string };

    if (!json.ok) { setErr(json.error ?? "Failed"); setLoading(false); return; }

    let foundLeg: Leg | null = null;
    let foundBundle: Bundle | null = null;
    for (const b of json.bundles ?? []) {
      const l = (b.shipment_legs ?? []).find(sl => sl.leg_reference === leg_reference);
      if (l) { foundLeg = l; foundBundle = b; break; }
    }

    if (!foundLeg || !foundBundle) { setErr("Leg not found or no access."); setLoading(false); return; }

    setLeg(foundLeg); setBundle(foundBundle);
    setHandoffNote(foundLeg.handoff_note ?? "");

    // Fetch payment allocations for this leg
    const payRes  = await fetch(`/api/orchestration/${foundBundle.bundle_reference}/payment`, { headers });
    const payJson = await payRes.json() as { ok?: boolean; allocations?: Allocation[] };
    const legAllocs = (payJson.allocations ?? []).filter(
      (a: Allocation & { leg_reference?: string }) => (a as Allocation & { leg_reference?: string }).leg_reference === leg_reference
    );
    setAllocations(legAllocs);

    setLoading(false);
  }, [leg_reference]);

  useEffect(() => { void load(); }, [load]);

  async function updateLegStatus() {
    if (!leg || !bundle || !newStatus) return;
    setActing("update");
    await fetch(`/api/orchestration/${bundle.bundle_reference}/legs`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${await getToken()}` },
      body: JSON.stringify({ leg_reference, leg_status: newStatus, handoff_note: handoffNote || undefined }),
    });
    setShowUpdate(false); setNewStatus(""); await load(); setActing("");
  }

  const transitions = leg ? STATUS_TRANSITIONS[leg.leg_status] ?? [] : [];

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 font-sans">
      <header className="border-b border-slate-800 bg-slate-950/80 sticky top-0 z-50">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-6">
          <Link href="/" className="flex items-center gap-2 text-sm font-semibold"><span className="text-blue-400">&#9632;</span>Nexum SecureFlow</Link>
          <nav className="flex items-center gap-4 text-xs text-slate-400">
            <span className="rounded-full border border-purple-500/30 bg-purple-500/10 px-3 py-1 text-purple-400 font-medium">Provider</span>
            <Link href="/provider/orchestration" className="hover:text-slate-100">My Legs</Link>
            <NotificationBell /><LogoutButton />
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-6 py-10">
        <Link href="/provider/orchestration" className="text-xs text-slate-500 hover:text-slate-300">← Orchestration Legs</Link>

        {loading && <div className="py-20 text-center text-sm text-slate-500">Loading…</div>}
        {!loading && err && <div className="mt-4 rounded-xl border border-red-500/30 bg-red-500/5 px-4 py-3 text-sm text-red-300">{err}</div>}

        {!loading && leg && bundle && (
          <div className="mt-4 space-y-4">
            {/* Leg header */}
            <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-6">
              <div className="flex items-start justify-between gap-4 flex-wrap">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-mono text-xs text-slate-500">{leg.leg_reference}</span>
                    <span className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold border ${LEG_STATUS_COLOR[leg.leg_status] ?? "bg-slate-700 text-slate-400"}`}>{leg.leg_status}</span>
                    <span className="text-[10px] text-slate-600">Leg {leg.leg_sequence}</span>
                  </div>
                  <h1 className="text-lg font-bold text-slate-50">{leg.leg_type}</h1>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Bundle: <Link href={`/customer/shipments/${bundle.bundle_reference}`} className="text-blue-400 hover:underline">{bundle.bundle_reference}</Link>
                    {bundle.customer_company?.name && ` · ${bundle.customer_company.name}`}
                  </p>
                </div>
                {transitions.length > 0 && (
                  <button onClick={() => setShowUpdate(true)}
                    className={`rounded-lg px-4 py-2 text-xs font-semibold text-white transition-colors ${leg.leg_status === "In Progress" ? "bg-emerald-600 hover:bg-emerald-500" : leg.leg_status === "Awaiting Start" ? "bg-indigo-600 hover:bg-indigo-500" : "bg-blue-600 hover:bg-blue-500"}`}>
                    {leg.leg_status === "Awaiting Start" ? "Start Leg →" : leg.leg_status === "In Progress" ? "Mark Completed →" : "Update Status →"}
                  </button>
                )}
              </div>

              {/* Leg details */}
              <div className="mt-4 grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
                <div><p className="text-slate-500">Route</p><p className="text-slate-300 mt-0.5">{leg.origin_location ?? "—"} → {leg.destination_location ?? "—"}</p></div>
                <div><p className="text-slate-500">Amount</p><p className="text-slate-200 font-semibold mt-0.5">{leg.currency} {leg.leg_amount.toLocaleString()}</p></div>
                {leg.expected_start_date && <div><p className="text-slate-500">Est. Start</p><p className="text-slate-300 mt-0.5">{leg.expected_start_date}</p></div>}
                {leg.expected_end_date   && <div><p className="text-slate-500">Est. End</p><p className="text-slate-300 mt-0.5">{leg.expected_end_date}</p></div>}
                {leg.actual_start_at     && <div><p className="text-slate-500">Started</p><p className="text-emerald-400 mt-0.5">{leg.actual_start_at.split("T")[0]}</p></div>}
                {leg.actual_completed_at && <div><p className="text-slate-500">Completed</p><p className="text-emerald-400 mt-0.5">{leg.actual_completed_at.split("T")[0]}</p></div>}
              </div>

              {leg.trigger_next_leg_on_status && (
                <div className="mt-3 rounded-lg border border-slate-700 bg-slate-800/40 px-3 py-2 text-xs text-slate-400">
                  <span className="text-slate-500">Auto-trigger next leg when status →</span> <span className="text-blue-300 font-semibold">{leg.trigger_next_leg_on_status}</span>
                </div>
              )}

              {leg.handoff_note && (
                <div className="mt-2 rounded-lg border border-slate-700 bg-slate-800/30 px-3 py-2 text-xs text-slate-300">
                  <span className="text-slate-500">Handoff note:</span> {leg.handoff_note}
                </div>
              )}

              {(leg.risk_flags ?? []).length > 0 && (
                <div className="mt-2 flex gap-1 flex-wrap">
                  {leg.risk_flags!.map(f => (
                    <span key={f} className="rounded-full bg-red-500/10 border border-red-500/20 px-2 py-0.5 text-[10px] text-red-400">{f}</span>
                  ))}
                </div>
              )}
            </div>

            {/* Payment allocation for this leg */}
            {allocations.length > 0 && (
              <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-5">
                <p className="text-xs text-slate-500 uppercase tracking-wider mb-3">Your Payment Allocation</p>
                <div className="space-y-2">
                  {allocations.map(a => (
                    <div key={a.id} className="flex items-center justify-between rounded-lg border border-slate-700/60 bg-slate-800/30 px-3 py-2 text-xs">
                      <div>
                        <p className="text-slate-200 font-semibold">{a.currency} {a.allocation_amount.toLocaleString()}</p>
                        <p className="text-slate-500 mt-0.5">{a.allocation_type}{a.release_condition ? ` · ${a.release_condition}` : ""}</p>
                      </div>
                      <div className="text-right">
                        <p className={`font-semibold ${RELEASE_COLOR[a.release_status] ?? "text-slate-400"}`}>{a.release_status}</p>
                        {a.released_at && <p className="text-[10px] text-slate-600">{a.released_at.split("T")[0]}</p>}
                      </div>
                    </div>
                  ))}
                </div>
                <p className="text-[10px] text-slate-600 mt-2">Release is coordinated by Nexum upon leg completion verification. No manual request needed.</p>
              </div>
            )}

            {/* RFQ / Job link */}
            <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-5">
              <p className="text-xs text-slate-500 uppercase tracking-wider mb-3">Related Jobs</p>
              <div className="rounded-lg border border-slate-700 bg-slate-800/30 px-4 py-3 text-xs text-slate-400 text-center">
                Jobs and documents linked to this leg will appear here once a SecureFlow job is created.
              </div>
            </div>
          </div>
        )}

        {/* Status update modal */}
        {showUpdate && leg && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 px-4">
            <div className="w-full max-w-md rounded-2xl border border-slate-700 bg-slate-900 p-6">
              <h2 className="text-base font-semibold text-slate-100 mb-1">Update Leg Status</h2>
              <p className="text-xs text-slate-400 mb-4">Current: <span className="font-semibold text-slate-200">{leg.leg_status}</span></p>

              <div className="space-y-2 mb-4">
                {transitions.map(s => (
                  <button key={s} type="button" onClick={() => setNewStatus(s)}
                    className={`w-full text-left rounded-lg border px-3 py-2.5 text-sm transition-all ${newStatus === s ? "border-blue-500/50 bg-blue-500/10 text-blue-300" : "border-slate-700 text-slate-300 hover:border-slate-600"}`}>
                    {s}
                    {s === "Completed" && <span className="text-xs text-slate-500 ml-2">— will trigger next leg</span>}
                  </button>
                ))}
              </div>

              <div className="mb-4">
                <label className="text-xs text-slate-400 mb-1 block">Handoff note (optional)</label>
                <textarea value={handoffNote} onChange={e => setHandoffNote(e.target.value)} rows={2}
                  placeholder="e.g. Documents handed to Company B driver at Port Klang…"
                  className="w-full rounded-lg bg-slate-800 border border-slate-700 px-3 py-2 text-xs text-slate-200 placeholder-slate-600 focus:outline-none focus:border-blue-500 resize-none" />
              </div>

              <div className="flex gap-2 justify-end">
                <button onClick={() => { setShowUpdate(false); setNewStatus(""); }} className="rounded-lg border border-slate-600 px-4 py-2 text-xs text-slate-400 hover:bg-slate-800 transition-colors">Cancel</button>
                <button onClick={() => void updateLegStatus()} disabled={!newStatus || acting === "update"}
                  className="rounded-lg bg-blue-600 hover:bg-blue-500 px-5 py-2 text-xs font-semibold text-white disabled:opacity-40 transition-colors">
                  {acting === "update" ? "Updating…" : "Confirm →"}
                </button>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
