"use client";
import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { LogoutButton } from "@/components/LogoutButton";
import { AuthGuard } from "@/components/AuthGuard";
import { NotificationBell } from "@/components/NotificationBell";
import {
  PACK_STATUS_BADGE,
  type CreditPackSummaryRow,
  type PackStatus,
} from "@/lib/creditPack";

type FilterStatus = "All" | PackStatus;

const FILTER_CHIPS: FilterStatus[] = ["All", "Generated", "Shared", "Draft", "Expired"];

export default function CreditPacksPage() {
  return (
    <AuthGuard requiredRole="admin">
      <CreditPacksInner />
    </AuthGuard>
  );
}

function CreditPacksInner() {
  const [packs,   setPacks]   = useState<CreditPackSummaryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState<string | null>(null);
  const [filter,  setFilter]  = useState<FilterStatus>("All");
  const [search,  setSearch]  = useState("");

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const res = await fetch("/api/credit-packs", { credentials: "include" });
      const json = await res.json() as { packs?: CreditPackSummaryRow[]; error?: string };
      if (!res.ok) throw new Error(json.error ?? "Load failed");
      setPacks(json.packs ?? []);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Load failed");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const filtered = packs.filter((p) => {
    if (filter !== "All" && p.pack_status !== filter) return false;
    if (search) {
      const q = search.toLowerCase();
      const match =
        (p.company_name ?? "").toLowerCase().includes(q) ||
        (p.product_type ?? "").toLowerCase().includes(q) ||
        (p.job_reference ?? "").toLowerCase().includes(q) ||
        (p.pack_title ?? "").toLowerCase().includes(q);
      if (!match) return false;
    }
    return true;
  });

  const generated = packs.filter((p) => p.pack_status === "Generated").length;
  const shared    = packs.filter((p) => p.pack_status === "Shared").length;
  const draft     = packs.filter((p) => p.pack_status === "Draft").length;
  const expired   = packs.filter((p) => p.pack_status === "Expired").length;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 font-sans">
      <header className="border-b border-slate-800 bg-slate-950/80 sticky top-0 z-50">
        <div className="mx-auto flex h-14 max-w-7xl items-center justify-between px-6">
          <Link href="/" className="flex items-center gap-2 text-sm font-semibold">
            <span className="text-blue-400">&#9632;</span> Nexum SecureFlow
          </Link>
          <nav className="flex items-center gap-4 text-xs text-slate-400">
            <span className="rounded-full border border-blue-500/30 bg-blue-500/10 px-3 py-1 text-blue-400 font-medium">Admin</span>
            <Link href="/admin"                   className="hover:text-slate-100 transition-colors">Dashboard</Link>
            <Link href="/admin/financing-offers"  className="hover:text-slate-100 transition-colors">Offers</Link>
            <Link href="/admin/capital-readiness" className="hover:text-slate-100 transition-colors">Capital</Link>
            <Link href="/admin/capital-partners"  className="hover:text-slate-100 transition-colors">Partners</Link>
            <Link href="/admin/credit-packs"      className="text-slate-100 border-b border-slate-500 pb-0.5">Credit Packs</Link>
            <Link href="/admin/command-center"    className="hover:text-slate-100 transition-colors">Command Center</Link>
            <NotificationBell />
            <LogoutButton />
          </nav>
        </div>
      </header>

      <main className="mx-auto w-full max-w-7xl px-6 py-8">
        <div className="mb-8 flex items-end justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-50">📄 Credit Packs</h1>
            <p className="mt-1 text-sm text-slate-400">
              Generated lender information packs — for decision support only, not loan approvals.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <Link
              href="/admin/capital-readiness"
              className="rounded-lg border border-blue-600/40 bg-blue-600/15 px-4 py-2 text-xs font-semibold text-blue-400 hover:bg-blue-600/25 transition-colors"
            >
              + Generate from Assessment
            </Link>
            <button
              type="button" onClick={load} disabled={loading}
              className="rounded-lg border border-slate-700 bg-slate-800 px-4 py-2 text-xs font-semibold text-slate-300 hover:bg-slate-700 transition-colors disabled:opacity-40"
            >
              {loading ? "Loading…" : "↺ Refresh"}
            </button>
          </div>
        </div>

        {error && (
          <div className="mb-6 rounded-xl border border-red-500/20 bg-red-950/10 px-5 py-4">
            <p className="text-sm text-red-400">{error}</p>
          </div>
        )}

        {/* Metrics */}
        <div className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
          {[
            { label: "Generated", val: generated, cls: "text-blue-400" },
            { label: "Shared",    val: shared,    cls: "text-emerald-400" },
            { label: "Draft",     val: draft,     cls: "text-slate-400" },
            { label: "Expired",   val: expired,   cls: expired > 0 ? "text-amber-400" : "text-slate-600" },
          ].map(({ label, val, cls }) => (
            <div key={label} className="rounded-xl border border-slate-800 bg-slate-900/60 px-5 py-4">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 mb-1">{label}</p>
              <p className={`text-3xl font-bold tabular-nums ${cls}`}>{val}</p>
            </div>
          ))}
        </div>

        {/* Filter chips */}
        <div className="mb-4 flex flex-wrap gap-2">
          {FILTER_CHIPS.map((f) => {
            const count =
              f === "All"       ? packs.length :
              f === "Generated" ? generated    :
              f === "Shared"    ? shared        :
              f === "Draft"     ? draft         :
              expired;
            return (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`rounded-full border px-3 py-1 text-xs font-semibold transition-colors ${
                  filter === f
                    ? "border-blue-500/50 bg-blue-500/20 text-blue-300"
                    : "border-slate-700 bg-slate-800 text-slate-400 hover:text-slate-200"
                }`}
              >
                {f} ({count})
              </button>
            );
          })}
        </div>

        {/* Search */}
        <div className="mb-6">
          <input
            type="text" value={search} onChange={(e) => setSearch(e.target.value)}
            placeholder="Search company, product, job reference, title…"
            className="w-full max-w-md rounded-lg border border-slate-700 bg-slate-800 px-4 py-2 text-sm text-slate-200 placeholder:text-slate-600 focus:border-blue-500/50 focus:outline-none"
          />
        </div>

        {/* Disclaimer */}
        <div className="mb-6 rounded-lg border border-amber-500/15 bg-amber-950/10 px-4 py-2.5 flex items-start gap-2">
          <span className="text-amber-400 text-xs mt-0.5 flex-shrink-0">⚠</span>
          <p className="text-[10px] text-amber-300/60">
            Credit packs are for information and decision-support only. They are not loan approvals, credit offers, or disbursement commitments.
          </p>
        </div>

        {loading && packs.length === 0 ? (
          <div className="flex items-center justify-center py-32">
            <span className="animate-pulse text-slate-600 text-2xl">◌</span>
          </div>
        ) : filtered.length === 0 ? (
          <div className="rounded-xl border border-slate-800 bg-slate-900/60 px-6 py-12 text-center">
            <p className="text-sm font-semibold text-slate-500">No credit packs found</p>
            <p className="mt-1 text-xs text-slate-600">
              Generate a pack from the{" "}
              <Link href="/admin/capital-readiness" className="text-blue-400 hover:underline">Capital Readiness page</Link>{" "}
              or{" "}
              <Link href="/admin/financing-offers" className="text-blue-400 hover:underline">Financing Offers page</Link>.
            </p>
          </div>
        ) : (
          <div className="rounded-xl border border-slate-800 bg-slate-900/60 overflow-hidden">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-slate-800 bg-slate-900/80">
                  {["Company", "Product", "Offer Amount", "Readiness", "Risk", "Open Exc.", "Overdue Obs.", "Status", "Generated", "Action"].map((h) => (
                    <th key={h} className="px-4 py-3 text-left text-[10px] font-semibold uppercase tracking-wider text-slate-500">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {filtered.map((p) => (
                  <tr key={p.id} className="hover:bg-slate-800/30 transition-colors">
                    <td className="px-4 py-3 font-semibold text-slate-200">
                      {p.company_name ?? "—"}
                      {p.job_reference && (
                        <div className="text-[10px] font-mono text-slate-500 mt-0.5">{p.job_reference}</div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-slate-400 max-w-[110px] truncate">{p.product_type ?? "—"}</td>
                    <td className="px-4 py-3 tabular-nums text-slate-200 font-semibold">
                      {p.offer_amount != null && p.currency
                        ? `${p.currency} ${Number(p.offer_amount).toLocaleString("en-MY")}`
                        : "—"}
                    </td>
                    <td className="px-4 py-3">
                      {p.readiness_status && (
                        <div>
                          <span className={`text-[10px] font-semibold ${
                            p.readiness_status === "Priority" || p.readiness_status === "Eligible" ? "text-emerald-400" :
                            p.readiness_status === "Monitor" ? "text-amber-400" : "text-red-400"
                          }`}>{p.readiness_status}</span>
                          {p.readiness_score != null && (
                            <div className="text-[9px] text-slate-600">{p.readiness_score}/100</div>
                          )}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-slate-400 text-[10px]">{p.risk_level ?? "—"}</td>
                    <td className="px-4 py-3 text-center">
                      <span className={p.open_exceptions ? "text-amber-400 font-bold" : "text-slate-600"}>{p.open_exceptions ?? 0}</span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className={p.overdue_obligations ? "text-red-400 font-bold" : "text-slate-600"}>{p.overdue_obligations ?? 0}</span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${PACK_STATUS_BADGE[p.pack_status]}`}>
                        {p.pack_status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-slate-600 text-[10px]">
                      {p.generated_at ? new Date(p.generated_at).toLocaleDateString("en-MY") : "—"}
                    </td>
                    <td className="px-4 py-3">
                      <Link
                        href={`/admin/credit-packs/${p.id}`}
                        className="rounded-md border border-blue-600/30 bg-blue-600/10 px-2.5 py-1 text-blue-400 hover:bg-blue-600/20 transition-colors"
                      >
                        View →
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </main>
    </div>
  );
}
