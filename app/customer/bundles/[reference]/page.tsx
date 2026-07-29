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
  } catch { /* fall through */ }
  try {
    const stored = localStorage.getItem("supabase.auth.token");
    if (stored) return (JSON.parse(stored) as { access_token?: string }).access_token ?? "";
  } catch { /* ignore */ }
  return "";
}

const BUNDLE_STATUS_COLOR: Record<string, string> = {
  Draft:      "bg-slate-700/60 text-slate-300",
  Active:     "bg-blue-500/20 text-blue-300 border border-blue-500/30",
  Completed:  "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30",
  Cancelled:  "bg-red-500/10 text-red-400 border border-red-500/20",
};

const LEG_STATUS_COLOR: Record<string, string> = {
  "Pending Assignment": "bg-slate-700/50 text-slate-400 border-slate-600/50",
  "RFQ Sent":           "bg-amber-500/20 text-amber-300 border-amber-500/30",
  "Provider Selected":  "bg-purple-500/20 text-purple-300 border-purple-500/30",
  "In Progress":        "bg-blue-500/20 text-blue-300 border-blue-500/30",
  "Completed":          "bg-emerald-500/20 text-emerald-300 border-emerald-500/30",
  "Cancelled":          "bg-red-500/10 text-red-400 border-red-500/20",
};

const PAY_TERMS_LABEL: Record<string, string> = {
  full_upfront: "Full Upfront",
  milestone:    "Milestone (40/30/30)",
  net30:        "Net 30",
  net60:        "Net 60",
};

interface ProviderCompany { name?: string; country?: string; }
interface Leg {
  id: string; leg_number: number; service_category: string; leg_description?: string;
  leg_status: string; estimated_start_date?: string; estimated_end_date?: string;
  actual_start_date?: string; actual_end_date?: string;
  leg_amount?: number; leg_currency?: string;
  payment_released?: boolean; payment_released_at?: string;
  rfq_id?: string; quote_id?: string; job_id?: string;
  provider_company?: ProviderCompany;
  handoff_notes?: string;
}
interface Bundle {
  id: string; bundle_reference: string; shipment_name?: string;
  origin_country: string; destination_country: string;
  origin_location?: string; destination_location?: string;
  cargo_type?: string; cargo_description?: string;
  weight_kg?: number; volume_cbm?: number; quantity?: number;
  incoterm?: string; commodity_hs_code?: string;
  ready_date?: string; target_delivery_date?: string;
  bundle_status: string; payment_terms: string; payment_status: string;
  total_amount?: number; currency?: string;
  finance_approved?: boolean; finance_due_date?: string;
  notes?: string; created_at: string;
  customer_company?: { name?: string; country?: string };
  shipment_legs?: Leg[];
}

const SERVICE_ICON: Record<string, string> = {
  "Customs Brokerage": "🛃", "Sea Freight": "🚢", "Air Freight": "✈️",
  "Land Transport": "🚛", "Warehousing": "🏭", "Console Truck": "📦",
};

export default function BundleDetailPage({ params }: { params: Promise<{ reference: string }> }) {
  const { reference } = use(params);
  const [bundle,   setBundle]   = useState<Bundle | null>(null);
  const [loading,  setLoading]  = useState(true);
  const [err,      setErr]      = useState("");
  const [acting,   setActing]   = useState("");
  const [showFinance, setShowFinance] = useState(false);
  const [financeTerms, setFinanceTerms] = useState<"net30"|"net60">("net30");

  const load = useCallback(async () => {
    setLoading(true); setErr("");
    const res  = await fetch(`/api/bundles/${reference}`, { headers: { Authorization: `Bearer ${await getToken()}` } });
    const json = await res.json() as { ok?: boolean; bundle?: Bundle; error?: string };
    if (json.ok) setBundle(json.bundle ?? null);
    else setErr(json.error ?? "Not found");
    setLoading(false);
  }, [reference]);

  useEffect(() => { void load(); }, [load]);

  async function patchBundle(action: "activate" | "cancel") {
    setActing(action);
    await fetch(`/api/bundles/${reference}`, {
      method:  "PATCH",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${await getToken()}` },
      body:    JSON.stringify({ action }),
    });
    await load();
    setActing("");
  }

  async function applyFinance() {
    setActing("finance");
    const res  = await fetch(`/api/bundles/${reference}/finance`, {
      method:  "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${await getToken()}` },
      body:    JSON.stringify({ requested_terms: financeTerms }),
    });
    const json = await res.json() as { ok?: boolean; error?: string };
    if (!json.ok) setErr(json.error ?? "Finance application failed");
    setShowFinance(false);
    setActing("");
    await load();
  }

  const b = bundle;
  const legs = b?.shipment_legs ?? [];
  const totalLegs = legs.length;
  const completedLegs = legs.filter(l => l.leg_status === "Completed").length;
  const totalLegAmount = legs.reduce((s, l) => s + (l.leg_amount ?? 0), 0);

  function LegCard({ leg, isLast }: { leg: Leg; isLast: boolean }) {
    const statusColor = LEG_STATUS_COLOR[leg.leg_status] ?? "bg-slate-700 text-slate-400";
    const icon = SERVICE_ICON[leg.service_category] ?? "📦";
    const isDone = leg.leg_status === "Completed";

    return (
      <div className="relative">
        {/* Connector line */}
        {!isLast && (
          <div className="absolute left-5 top-full h-4 w-0.5 bg-slate-700" />
        )}
        <div className={`rounded-xl border p-4 transition-all ${
          isDone ? "border-emerald-500/30 bg-emerald-500/5" :
          leg.leg_status === "In Progress" ? "border-blue-500/30 bg-blue-500/5" :
          "border-slate-800 bg-slate-900/40"
        }`}>
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-3 flex-1 min-w-0">
              {/* Step circle */}
              <div className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm border ${
                isDone            ? "bg-emerald-500/20 border-emerald-500/40 text-emerald-300" :
                leg.leg_status === "In Progress" ? "bg-blue-500/20 border-blue-500/40 text-blue-300" :
                                  "bg-slate-700/60 border-slate-600 text-slate-400"
              }`}>
                {isDone ? "✓" : leg.leg_number}
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap mb-0.5">
                  <span className="text-sm font-semibold text-slate-200">{icon} {leg.service_category}</span>
                  <span className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-medium border ${statusColor}`}>
                    {leg.leg_status}
                  </span>
                  {leg.payment_released && (
                    <span className="inline-block rounded-full px-2 py-0.5 text-[10px] bg-emerald-500/20 border border-emerald-500/30 text-emerald-400">
                      Payment Released ✓
                    </span>
                  )}
                </div>

                {leg.leg_description && <p className="text-xs text-slate-400 mb-1">{leg.leg_description}</p>}

                <div className="flex flex-wrap gap-3 text-xs text-slate-500 mt-1">
                  {leg.provider_company?.name
                    ? <span className="text-slate-300">Provider: <span className="text-slate-200 font-medium">{leg.provider_company.name}</span>{leg.provider_company.country ? ` · ${leg.provider_company.country}` : ""}</span>
                    : <span className="text-slate-600 italic">No provider assigned</span>
                  }
                  {leg.leg_amount && <span>{leg.leg_currency ?? b?.currency ?? "MYR"} {leg.leg_amount.toLocaleString()}</span>}
                  {leg.estimated_start_date && <span>Est. start: {leg.estimated_start_date}</span>}
                  {leg.actual_start_date && <span>Started: {leg.actual_start_date}</span>}
                  {leg.actual_end_date && <span>Completed: {leg.actual_end_date}</span>}
                </div>

                {leg.handoff_notes && (
                  <p className="mt-1.5 text-xs text-slate-500 rounded bg-slate-800/60 px-2 py-1">
                    Handoff: {leg.handoff_notes}
                  </p>
                )}
              </div>
            </div>

            {/* Leg actions */}
            <div className="shrink-0 flex flex-col gap-1.5">
              {leg.leg_status === "Pending Assignment" && (
                <Link href={`/customer/rfqs/new?bundle_reference=${reference}&leg_number=${leg.leg_number}&service_category=${encodeURIComponent(leg.service_category)}`}
                  className="rounded-lg bg-blue-600 hover:bg-blue-500 px-3 py-1.5 text-[11px] font-semibold text-white transition-colors whitespace-nowrap">
                  Create RFQ →
                </Link>
              )}
              {leg.rfq_id && leg.leg_status === "RFQ Sent" && (
                <Link href={`/customer/rfqs`}
                  className="rounded-lg border border-slate-600 px-3 py-1.5 text-[11px] text-slate-400 hover:bg-slate-800 transition-colors whitespace-nowrap">
                  View RFQ →
                </Link>
              )}
              {leg.job_id && (
                <Link href={`/customer/jobs`}
                  className="rounded-lg border border-slate-600 px-3 py-1.5 text-[11px] text-slate-400 hover:bg-slate-800 transition-colors whitespace-nowrap">
                  View Job →
                </Link>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 font-sans">
      <header className="border-b border-slate-800 bg-slate-950/80 sticky top-0 z-50">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-6">
          <Link href="/" className="flex items-center gap-2 text-sm font-semibold"><span className="text-blue-400">&#9632;</span>Nexum SecureFlow</Link>
          <nav className="flex items-center gap-4 text-xs text-slate-400">
            <span className="rounded-full border border-cyan-500/30 bg-cyan-500/10 px-3 py-1 text-cyan-400 font-medium">Customer</span>
            <Link href="/customer/bundles" className="hover:text-slate-100">Bundles</Link>
            <NotificationBell /><LogoutButton />
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-6 py-10">
        <Link href="/customer/bundles" className="text-xs text-slate-500 hover:text-slate-300">← Shipment Bundles</Link>

        {loading && <div className="py-20 text-center text-sm text-slate-500">Loading…</div>}
        {!loading && err && <div className="mt-4 rounded-xl border border-red-500/30 bg-red-500/5 px-4 py-3 text-sm text-red-300">{err}</div>}

        {!loading && b && (
          <div className="mt-4 space-y-5">

            {/* Bundle Header */}
            <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-6">
              <div className="flex items-start justify-between gap-4 flex-wrap">
                <div>
                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                    <span className="font-mono text-xs text-slate-500">{b.bundle_reference}</span>
                    <span className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold ${BUNDLE_STATUS_COLOR[b.bundle_status] ?? "bg-slate-700 text-slate-400"}`}>
                      {b.bundle_status}
                    </span>
                    <span className="inline-block rounded-full px-2 py-0.5 text-[10px] bg-slate-700/50 text-slate-400">
                      {PAY_TERMS_LABEL[b.payment_terms] ?? b.payment_terms}
                    </span>
                    <span className="inline-block rounded-full px-2 py-0.5 text-[10px] bg-slate-700/50 text-slate-400">
                      Payment: {b.payment_status}
                    </span>
                  </div>
                  <h1 className="text-lg font-bold text-slate-50">{b.shipment_name ?? `${b.origin_country} → ${b.destination_country}`}</h1>
                  <p className="text-sm text-slate-400 mt-0.5">
                    {[b.origin_country, b.origin_location].filter(Boolean).join(" · ")} → {[b.destination_country, b.destination_location].filter(Boolean).join(" · ")}
                  </p>
                </div>

                <div className="flex gap-2 flex-wrap">
                  {b.bundle_status === "Draft" && totalLegs > 0 && (
                    <button onClick={() => patchBundle("activate")} disabled={!!acting}
                      className="rounded-lg bg-blue-600 hover:bg-blue-500 px-4 py-2 text-xs font-semibold text-white disabled:opacity-40 transition-colors">
                      {acting === "activate" ? "Activating…" : "Activate Bundle →"}
                    </button>
                  )}
                  {b.bundle_status === "Draft" && (b.payment_terms === "full_upfront" || b.payment_terms === "milestone") && (
                    <button onClick={() => setShowFinance(true)}
                      className="rounded-lg border border-purple-500/40 px-4 py-2 text-xs text-purple-300 hover:bg-purple-500/10 transition-colors">
                      Apply for TradeFlow Finance
                    </button>
                  )}
                  {!["Completed","Cancelled"].includes(b.bundle_status) && (
                    <button onClick={() => { if (confirm("Cancel this bundle?")) void patchBundle("cancel"); }} disabled={!!acting}
                      className="rounded-lg border border-slate-600 px-4 py-2 text-xs text-slate-400 hover:bg-slate-800 disabled:opacity-40 transition-colors">
                      Cancel
                    </button>
                  )}
                </div>
              </div>

              {/* Progress bar */}
              {b.bundle_status === "Active" && totalLegs > 0 && (
                <div className="mt-4">
                  <div className="flex items-center justify-between text-xs text-slate-500 mb-1">
                    <span>Shipment Progress</span>
                    <span>{completedLegs} / {totalLegs} legs completed</span>
                  </div>
                  <div className="h-2 rounded-full bg-slate-800 overflow-hidden">
                    <div className="h-full rounded-full bg-gradient-to-r from-blue-500 to-emerald-500 transition-all duration-500"
                      style={{ width: `${totalLegs > 0 ? Math.round((completedLegs / totalLegs) * 100) : 0}%` }} />
                  </div>
                </div>
              )}

              {/* Cargo summary */}
              <div className="mt-4 grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
                {b.cargo_type       && <div><p className="text-slate-500">Cargo</p><p className="text-slate-300 mt-0.5">{b.cargo_type}</p></div>}
                {b.incoterm         && <div><p className="text-slate-500">Incoterm</p><p className="text-slate-300 mt-0.5">{b.incoterm}</p></div>}
                {b.weight_kg        && <div><p className="text-slate-500">Weight</p><p className="text-slate-300 mt-0.5">{b.weight_kg} kg</p></div>}
                {b.volume_cbm       && <div><p className="text-slate-500">Volume</p><p className="text-slate-300 mt-0.5">{b.volume_cbm} CBM</p></div>}
                {b.ready_date       && <div><p className="text-slate-500">Ready</p><p className="text-slate-300 mt-0.5">{b.ready_date}</p></div>}
                {b.target_delivery_date && <div><p className="text-slate-500">Target</p><p className="text-slate-300 mt-0.5">{b.target_delivery_date}</p></div>}
                {b.commodity_hs_code && <div><p className="text-slate-500">HS Code</p><p className="text-slate-300 mt-0.5">{b.commodity_hs_code}</p></div>}
              </div>
            </div>

            {/* Payment summary */}
            <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-5">
              <p className="text-xs text-slate-500 uppercase tracking-wider mb-3">Payment Summary</p>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-xs">
                <div>
                  <p className="text-slate-500">Total Quoted</p>
                  <p className="text-slate-200 font-semibold text-sm mt-0.5">
                    {b.currency ?? "MYR"} {(b.total_amount ?? totalLegAmount).toLocaleString() || "TBD"}
                  </p>
                </div>
                <div>
                  <p className="text-slate-500">Payment Terms</p>
                  <p className="text-slate-200 mt-0.5">{PAY_TERMS_LABEL[b.payment_terms] ?? b.payment_terms}</p>
                </div>
                <div>
                  <p className="text-slate-500">Payment Status</p>
                  <p className={`mt-0.5 font-medium ${b.payment_status === "Paid" || b.payment_status === "Released" ? "text-emerald-400" : "text-amber-400"}`}>{b.payment_status}</p>
                </div>
                {legs.length > 0 && (
                  <div>
                    <p className="text-slate-500">Released to Providers</p>
                    <p className="text-emerald-400 mt-0.5">
                      {b.currency ?? "MYR"} {legs.filter(l => l.payment_released).reduce((s,l) => s + (l.leg_amount ?? 0), 0).toLocaleString()} released
                    </p>
                  </div>
                )}
              </div>
              {(b.payment_terms === "net30" || b.payment_terms === "net60") && (
                <div className="mt-3 rounded-lg border border-purple-500/20 bg-purple-500/5 px-3 py-2 text-xs">
                  <span className={`font-semibold ${b.finance_approved ? "text-emerald-400" : "text-amber-400"}`}>
                    TradeFlow Finance: {b.finance_approved ? "✓ Approved" : "Pending Review"}
                  </span>
                  {b.finance_due_date && <span className="text-slate-400 ml-2">· Repayment due: {b.finance_due_date}</span>}
                </div>
              )}
            </div>

            {/* Service Legs */}
            <div>
              <h2 className="text-sm font-semibold text-slate-200 mb-3">Service Legs ({legs.length})</h2>

              {legs.length === 0 ? (
                <div className="rounded-xl border border-slate-800 py-10 text-center text-sm text-slate-500">
                  No legs configured yet. <Link href={`/customer/bundles/${reference}/edit`} className="text-blue-400">Edit bundle</Link> to add service legs.
                </div>
              ) : (
                <div className="space-y-4">
                  {legs.map((leg, i) => <LegCard key={leg.id} leg={leg} isLast={i === legs.length - 1} />)}
                </div>
              )}
            </div>

            {b.bundle_status === "Draft" && (
              <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 px-4 py-3">
                <p className="text-xs text-amber-300">
                  <span className="font-semibold">Next steps:</span> For each leg with "Pending Assignment" status, create an RFQ to source providers. Once a provider is selected for each leg, activate the bundle to begin operations.
                </p>
              </div>
            )}
          </div>
        )}

        {/* TradeFlow Finance Modal */}
        {showFinance && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 px-4">
            <div className="w-full max-w-md rounded-2xl border border-slate-700 bg-slate-900 p-6">
              <h2 className="text-base font-semibold text-slate-100 mb-1">Apply for TradeFlow Finance</h2>
              <p className="text-xs text-slate-400 mb-4">
                Nexum advances payment to your providers. You repay Nexum after your cargo is delivered — bridging the cash flow gap.
              </p>
              <div className="space-y-3">
                {(["net30","net60"] as const).map(t => (
                  <button key={t} type="button" onClick={() => setFinanceTerms(t)}
                    className={`w-full text-left rounded-xl border p-3.5 transition-all text-sm ${
                      financeTerms === t ? "border-purple-500/60 bg-purple-500/10 text-purple-300" : "border-slate-700 text-slate-300 hover:border-slate-600"
                    }`}>
                    <span className="font-medium">{t === "net30" ? "Net 30" : "Net 60"}</span>
                    <span className="text-xs text-slate-500 ml-2">— repay Nexum {t === "net30" ? "30" : "60"} days after delivery</span>
                  </button>
                ))}
              </div>
              <div className="mt-4 rounded-lg border border-purple-500/20 bg-purple-500/5 px-3 py-2 text-xs text-purple-300">
                Subject to credit review (1-2 business days). A financing fee applies. Your providers are paid immediately upon leg completion.
              </div>
              <div className="mt-4 flex gap-2 justify-end">
                <button onClick={() => setShowFinance(false)}
                  className="rounded-lg border border-slate-600 px-4 py-2 text-xs text-slate-400 hover:bg-slate-800 transition-colors">
                  Cancel
                </button>
                <button onClick={() => void applyFinance()} disabled={acting === "finance"}
                  className="rounded-lg bg-purple-600 hover:bg-purple-500 px-5 py-2 text-xs font-semibold text-white disabled:opacity-40 transition-colors">
                  {acting === "finance" ? "Submitting…" : "Submit Application →"}
                </button>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
