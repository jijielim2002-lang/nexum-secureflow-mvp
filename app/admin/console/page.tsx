"use client";
import { useState, useEffect } from "react";
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

const NAV = [
  { href: "/admin/console/warehouses", label: "Warehouses",  icon: "🏭", desc: "Manage warehouse locations" },
  { href: "/admin/console/routes",     label: "Routes",      icon: "🛣️", desc: "Route configuration & pricing" },
  { href: "/admin/console/slots",      label: "Slots",       icon: "📅", desc: "Slot management & bulk generation" },
  { href: "/admin/console/parcels",    label: "Parcels",     icon: "📦", desc: "Monitor all parcels & override status" },
  { href: "/admin/console/wallets",    label: "Wallets",     icon: "💳", desc: "Customer & supplier wallet overview" },
  { href: "/admin/console/payouts",    label: "Payouts",     icon: "💸", desc: "Approve / reject withdrawal requests" },
  { href: "/admin/console/ratings",    label: "Ratings",     icon: "⭐", desc: "Supplier performance scorecards" },
];

export default function AdminConsoleDashboard() {
  const [stats, setStats] = useState({ parcels: 0, activeSlots: 0, pendingPayouts: 0, totalWallet: 0 });

  useEffect(() => {
    (async () => {
      const token = await getToken();
      const h = { Authorization: `Bearer ${token}` };
      const [parcelsRes, slotsRes, payoutsRes, walletsRes] = await Promise.all([
        fetch("/api/console/parcels", { headers: h }),
        fetch("/api/console/slots?status=In+Progress", { headers: h }),
        fetch("/api/console/payouts", { headers: h }),
        fetch("/api/console/wallets", { headers: h }),
      ]);
      const [parcels, slots, payouts, wallets] = await Promise.all([
        parcelsRes.json(), slotsRes.json(), payoutsRes.json(), walletsRes.json()
      ]);
      const totalWallet = Array.isArray(wallets?.wallets)
        ? wallets.wallets.reduce((sum: number, w: { available_balance: number }) => sum + Number(w.available_balance), 0)
        : 0;
      setStats({
        parcels: Array.isArray(parcels) ? parcels.filter((p: { parcel_status: string }) => !["Completed","Cancelled"].includes(p.parcel_status)).length : 0,
        activeSlots: Array.isArray(slots) ? slots.length : 0,
        pendingPayouts: Array.isArray(payouts) ? payouts.length : 0,
        totalWallet,
      });
    })();
  }, []);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <header className="bg-slate-900 border-b border-slate-800 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link href="/admin" className="text-slate-500 hover:text-slate-300 text-sm">← Admin</Link>
          <h1 className="text-xl font-bold text-white">Console Transport Admin</h1>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-6 py-8 space-y-8">
        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { label: "Active Parcels",    value: stats.parcels,         color: "text-blue-400" },
            { label: "In-Transit Slots",  value: stats.activeSlots,     color: "text-amber-400" },
            { label: "Pending Payouts",   value: stats.pendingPayouts,  color: "text-red-400" },
            { label: "Total in Wallets",  value: `RM ${stats.totalWallet.toFixed(0)}`, color: "text-emerald-400" },
          ].map(s => (
            <div key={s.label} className="bg-slate-900 border border-slate-800 rounded-xl p-4">
              <p className="text-xs text-slate-500">{s.label}</p>
              <p className={`text-2xl font-bold mt-1 ${s.color}`}>{s.value}</p>
            </div>
          ))}
        </div>

        {/* Nav grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {NAV.map(n => (
            <Link key={n.href} href={n.href}
              className="bg-slate-900 border border-slate-800 rounded-xl p-5 hover:border-slate-600 transition-colors group">
              <div className="text-2xl mb-2">{n.icon}</div>
              <p className="font-semibold text-white group-hover:text-blue-300 transition-colors">{n.label}</p>
              <p className="text-xs text-slate-500 mt-1">{n.desc}</p>
            </Link>
          ))}
        </div>

        <div className="bg-blue-500/10 border border-blue-500/20 rounded-xl p-4 text-xs text-blue-300">
          <strong>Console Transport</strong> — Warehouse-to-warehouse, Peninsular Malaysia. Routes: PG↔KL (max 6h) · KL↔JB (max 5h).
          Operating hours Mon–Sat 10:00–19:00. Customer: RM50/parcel. Supplier payout: GREATEST(RM45×n, RM200/trip).
          Nexum commission: RM5/parcel.
        </div>
      </main>
    </div>
  );
}
