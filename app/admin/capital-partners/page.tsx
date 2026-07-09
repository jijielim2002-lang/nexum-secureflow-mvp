"use client";
import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";
import { useAuth } from "@/contexts/AuthContext";
import { LogoutButton } from "@/components/LogoutButton";
import { AuthGuard } from "@/components/AuthGuard";
import { NotificationBell } from "@/components/NotificationBell";
import {
  ACCESS_STATUS_BADGE,
  PARTNER_INTEREST_BADGE,
  effectiveAccessStatus,
  type AccessStatus,
} from "@/lib/capitalPartner";

// ─── Types ────────────────────────────────────────────────────────────────────

interface AccessRecord {
  id:                         string;
  capital_partner_company_id: string | null;
  financing_offer_id:         string | null;
  job_reference:              string | null;
  company_id:                 string | null;
  access_status:              string;
  access_expires_at:          string | null;
  created_at:                 string;
  // Joined
  partner_company_name:       string | null;
  deal_company_name:          string | null;
  product_type:               string | null;
  offer_status:               string | null;
  offer_amount:               number | null;
  currency:                   string | null;
  partner_interest_status:    string | null;
  partner_viewed_at:          string | null;
}

interface CompanyOption {
  id:   string;
  name: string;
  role?: string;
}

interface OfferOption {
  id:           string;
  company_name: string | null;
  product_type: string;
  offer_amount: number;
  currency:     string;
  offer_status: string;
  job_reference: string | null;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmt(n: number) {
  return new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(n);
}

function Th({ children }: { children: React.ReactNode }) {
  return (
    <th className="px-4 py-3 text-left text-[10px] font-semibold uppercase tracking-wider text-slate-500">
      {children}
    </th>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function CapitalPartnersPage() {
  return (
    <AuthGuard requiredRole="admin">
      <CapitalPartnersInner />
    </AuthGuard>
  );
}

function CapitalPartnersInner() {
  const { profile } = useAuth();

  const [records,    setRecords]    = useState<AccessRecord[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [error,      setError]      = useState<string | null>(null);

  // Share modal state
  const [showShare,  setShowShare]  = useState(false);
  const [offers,     setOffers]     = useState<OfferOption[]>([]);
  const [partners,   setPartners]   = useState<CompanyOption[]>([]);
  const [selOffer,   setSelOffer]   = useState("");
  const [selPartner, setSelPartner] = useState("");
  const [expiryDate, setExpiryDate] = useState("");
  const [sharing,    setSharing]    = useState(false);
  const [shareErr,   setShareErr]   = useState<string | null>(null);
  const [shareOk,    setShareOk]    = useState<string | null>(null);

  // Revoke / action state
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [actionMsg,     setActionMsg]     = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const { data, error: err } = await supabase
        .from("capital_partner_access")
        .select(`
          id, capital_partner_company_id, financing_offer_id,
          job_reference, company_id, access_status, access_expires_at, created_at,
          simulated_financing_offers (
            product_type, offer_status, offer_amount, currency, company_name,
            partner_interest_status, partner_viewed_at
          )
        `)
        .order("created_at", { ascending: false })
        .limit(300);
      if (err) throw err;

      // Flatten joined data + fetch partner company names
      const raw = (data ?? []) as unknown as Array<{
        id:                         string;
        capital_partner_company_id: string | null;
        financing_offer_id:         string | null;
        job_reference:              string | null;
        company_id:                 string | null;
        access_status:              string;
        access_expires_at:          string | null;
        created_at:                 string;
        simulated_financing_offers: {
          product_type:            string;
          offer_status:            string;
          offer_amount:            number;
          currency:                string;
          company_name:            string | null;
          partner_interest_status: string | null;
          partner_viewed_at:       string | null;
        } | null;
      }>;

      // Collect all capital partner company ids for name lookup
      const partnerIds = [...new Set(raw.map((r) => r.capital_partner_company_id).filter(Boolean))] as string[];
      const { data: coData } = partnerIds.length > 0
        ? await supabase.from("companies").select("id, name").in("id", partnerIds)
        : { data: [] };
      const coMap = new Map<string, string>((coData ?? []).map((c: { id: string; name: string }) => [c.id, c.name]));

      const mapped: AccessRecord[] = raw.map((r) => ({
        id:                         r.id,
        capital_partner_company_id: r.capital_partner_company_id,
        financing_offer_id:         r.financing_offer_id,
        job_reference:              r.job_reference,
        company_id:                 r.company_id,
        access_status:              r.access_status,
        access_expires_at:          r.access_expires_at,
        created_at:                 r.created_at,
        partner_company_name:       r.capital_partner_company_id ? (coMap.get(r.capital_partner_company_id) ?? "—") : "—",
        deal_company_name:          r.simulated_financing_offers?.company_name ?? "—",
        product_type:               r.simulated_financing_offers?.product_type ?? null,
        offer_status:               r.simulated_financing_offers?.offer_status ?? null,
        offer_amount:               r.simulated_financing_offers?.offer_amount ?? null,
        currency:                   r.simulated_financing_offers?.currency ?? null,
        partner_interest_status:    r.simulated_financing_offers?.partner_interest_status ?? null,
        partner_viewed_at:          r.simulated_financing_offers?.partner_viewed_at ?? null,
      }));

      setRecords(mapped);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Load failed");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // Load share modal data
  async function openShareModal() {
    setShareErr(null); setShareOk(null); setSelOffer(""); setSelPartner(""); setExpiryDate("");
    const [offersRes, partnersRes] = await Promise.all([
      supabase
        .from("simulated_financing_offers")
        .select("id, company_name, product_type, offer_amount, currency, offer_status, job_reference")
        .in("offer_status", ["Simulated", "Interested"])
        .order("generated_at", { ascending: false })
        .limit(100),
      supabase
        .from("companies")
        .select("id, name")
        .order("name"),
    ]);
    setOffers((offersRes.data ?? []) as OfferOption[]);
    setPartners((partnersRes.data ?? []) as CompanyOption[]);
    setShowShare(true);
  }

  async function handleShare() {
    if (!selOffer || !selPartner) {
      setShareErr("Please select both an offer and a capital partner company."); return;
    }
    setSharing(true); setShareErr(null); setShareOk(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      const res = await fetch("/api/capital-partner-access", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          financingOfferId:        selOffer,
          capitalPartnerCompanyId: selPartner,
          accessExpiresAt:         expiryDate || undefined,
          actorName:               profile?.full_name ?? "Admin",
        }),
      });
      const json = await res.json() as { error?: string };
      if (!res.ok) throw new Error(json.error ?? "Share failed");
      setShareOk("Offer shared successfully.");
      await load();
    } catch (e: unknown) {
      setShareErr(e instanceof Error ? e.message : "Share failed");
    } finally {
      setSharing(false);
    }
  }

  async function handleAction(accessId: string, action: "revoke" | "mark_active") {
    setActionLoading(accessId); setActionMsg(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      const res = await fetch(`/api/capital-partner-access/${accessId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ action, actorName: profile?.full_name ?? "Admin" }),
      });
      const json = await res.json() as { error?: string };
      if (!res.ok) throw new Error(json.error ?? "Action failed");
      setActionMsg(action === "revoke" ? "Access revoked." : "Access re-activated.");
      await load();
    } catch (e: unknown) {
      setActionMsg(e instanceof Error ? e.message : "Action failed");
    } finally {
      setActionLoading(null);
    }
  }

  // Metrics
  const active   = records.filter((r) => effectiveAccessStatus({ access_status: r.access_status as AccessStatus, access_expires_at: r.access_expires_at }) === "Active");
  const invited  = records.filter((r) => effectiveAccessStatus({ access_status: r.access_status as AccessStatus, access_expires_at: r.access_expires_at }) === "Invited");
  const revoked  = records.filter((r) => r.access_status === "Revoked");
  const viewed   = records.filter((r) => r.partner_viewed_at);
  const interest = records.filter((r) => r.partner_interest_status === "Interested");

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 font-sans">
      {/* Header */}
      <header className="border-b border-slate-800 bg-slate-950/80 sticky top-0 z-50">
        <div className="mx-auto flex h-14 max-w-7xl items-center justify-between px-6">
          <Link href="/" className="flex items-center gap-2 text-sm font-semibold">
            <span className="text-blue-400">&#9632;</span> Nexum SecureFlow
          </Link>
          <nav className="flex items-center gap-4 text-xs text-slate-400">
            <span className="rounded-full border border-blue-500/30 bg-blue-500/10 px-3 py-1 text-blue-400 font-medium">Admin</span>
            <Link href="/admin"                   className="hover:text-slate-100 transition-colors">Dashboard</Link>
            <Link href="/admin/jobs"              className="hover:text-slate-100 transition-colors">Jobs</Link>
            <Link href="/admin/financing-offers"  className="hover:text-slate-100 transition-colors">Offers</Link>
            <Link href="/admin/capital-readiness" className="hover:text-slate-100 transition-colors">Capital</Link>
            <Link href="/admin/capital-partners"  className="text-slate-100 border-b border-slate-500 pb-0.5">Partners</Link>
            <Link href="/admin/command-center"    className="hover:text-slate-100 transition-colors">Command Center</Link>
            <NotificationBell />
            <LogoutButton />
          </nav>
        </div>
      </header>

      <main className="mx-auto w-full max-w-7xl px-6 py-8">

        {/* Page header */}
        <div className="mb-8 flex items-end justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-50">Capital Partner Access</h1>
            <p className="mt-1 text-sm text-slate-400">
              Manage which simulated financing opportunities are shared with which capital partners.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <button
              type="button" onClick={load} disabled={loading}
              className="rounded-lg border border-slate-700 bg-slate-800 px-4 py-2 text-xs font-semibold text-slate-300 hover:bg-slate-700 transition-colors disabled:opacity-40"
            >
              {loading ? "Refreshing…" : "↺ Refresh"}
            </button>
            <button
              type="button" onClick={openShareModal}
              className="rounded-lg border border-blue-600/40 bg-blue-600/15 px-4 py-2 text-xs font-semibold text-blue-400 hover:bg-blue-600/25 transition-colors"
            >
              + Share Opportunity
            </button>
          </div>
        </div>

        {/* Action message */}
        {actionMsg && (
          <div className="mb-4 rounded-lg border border-blue-500/20 bg-blue-950/10 px-4 py-2.5">
            <p className="text-xs text-blue-400">{actionMsg}</p>
          </div>
        )}

        {error && (
          <div className="mb-6 rounded-xl border border-red-500/20 bg-red-950/10 px-5 py-4">
            <p className="text-sm text-red-400">{error}</p>
          </div>
        )}

        {/* Metric cards */}
        <div className="mb-8 grid grid-cols-2 gap-4 sm:grid-cols-5">
          {[
            { label: "Active",           val: active.length,   cls: "text-emerald-400" },
            { label: "Invited",          val: invited.length,  cls: "text-blue-400"    },
            { label: "Revoked",          val: revoked.length,  cls: revoked.length > 0 ? "text-red-400" : "text-slate-600" },
            { label: "Viewed by Partner",val: viewed.length,   cls: "text-purple-400"  },
            { label: "Marked Interested",val: interest.length, cls: interest.length > 0 ? "text-emerald-400" : "text-slate-600" },
          ].map(({ label, val, cls }) => (
            <div key={label} className="rounded-xl border border-slate-800 bg-slate-900/60 px-4 py-3">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 mb-1">{label}</p>
              <p className={`text-2xl font-bold tabular-nums ${cls}`}>{val}</p>
            </div>
          ))}
        </div>

        {/* Share modal */}
        {showShare && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
            <div className="mx-4 w-full max-w-lg rounded-2xl border border-slate-700 bg-slate-900 p-6 shadow-2xl">
              <div className="mb-5 flex items-center justify-between">
                <h2 className="text-sm font-bold text-slate-100">Share Financing Opportunity</h2>
                <button type="button" onClick={() => setShowShare(false)} className="text-slate-500 hover:text-slate-300 text-lg">✕</button>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="block text-[10px] font-semibold uppercase tracking-wider text-slate-500 mb-1.5">
                    Simulated Financing Offer *
                  </label>
                  <select
                    value={selOffer}
                    onChange={(e) => setSelOffer(e.target.value)}
                    className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-200 focus:border-blue-500/50 focus:outline-none"
                  >
                    <option value="">— Select offer —</option>
                    {offers.map((o) => (
                      <option key={o.id} value={o.id}>
                        {o.company_name ?? "Unknown"} · {o.product_type} · {o.currency} {Number(o.offer_amount).toLocaleString()}
                        {o.job_reference ? ` · ${o.job_reference}` : ""}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-[10px] font-semibold uppercase tracking-wider text-slate-500 mb-1.5">
                    Capital Partner Company *
                  </label>
                  <select
                    value={selPartner}
                    onChange={(e) => setSelPartner(e.target.value)}
                    className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-200 focus:border-blue-500/50 focus:outline-none"
                  >
                    <option value="">— Select partner —</option>
                    {partners.map((p) => (
                      <option key={p.id} value={p.id}>{p.name}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-[10px] font-semibold uppercase tracking-wider text-slate-500 mb-1.5">
                    Access Expiry Date (optional)
                  </label>
                  <input
                    type="date"
                    value={expiryDate}
                    onChange={(e) => setExpiryDate(e.target.value)}
                    className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-200 focus:border-blue-500/50 focus:outline-none"
                  />
                </div>
              </div>

              {shareErr && <p className="mt-3 text-xs text-red-400">{shareErr}</p>}
              {shareOk  && <p className="mt-3 text-xs text-emerald-400">✓ {shareOk}</p>}

              <div className="mt-5 flex items-center gap-3 justify-end">
                <button
                  type="button" onClick={() => setShowShare(false)}
                  className="rounded-lg border border-slate-700 bg-slate-800 px-4 py-2 text-xs font-semibold text-slate-300 hover:bg-slate-700 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="button" onClick={handleShare} disabled={sharing}
                  className="rounded-lg border border-blue-600/40 bg-blue-600/20 px-4 py-2 text-xs font-semibold text-blue-300 hover:bg-blue-600/30 transition-colors disabled:opacity-40"
                >
                  {sharing ? "Sharing…" : "Share Opportunity"}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Access records table */}
        {loading && records.length === 0 ? (
          <div className="flex items-center justify-center py-32">
            <span className="animate-pulse text-slate-600 text-2xl">◌</span>
          </div>
        ) : records.length === 0 ? (
          <div className="rounded-xl border border-slate-800 bg-slate-900/60 px-6 py-12 text-center">
            <p className="text-sm text-slate-500 font-semibold">No capital partner access records yet</p>
            <p className="mt-1 text-xs text-slate-600">Click "Share Opportunity" to share a simulated financing offer with a capital partner.</p>
          </div>
        ) : (
          <div className="rounded-xl border border-slate-800 bg-slate-900/60 overflow-hidden">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-slate-800 bg-slate-900/80">
                  <Th>Capital Partner</Th>
                  <Th>Deal Company</Th>
                  <Th>Product / Amount</Th>
                  <Th>Job Ref</Th>
                  <Th>Access Status</Th>
                  <Th>Partner Decision</Th>
                  <Th>Viewed</Th>
                  <Th>Expires</Th>
                  <Th>Shared</Th>
                  <Th>Actions</Th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {records.map((r) => {
                  const eas = effectiveAccessStatus({ access_status: r.access_status as AccessStatus, access_expires_at: r.access_expires_at });
                  return (
                    <tr key={r.id} className="hover:bg-slate-800/30 transition-colors">
                      <td className="px-4 py-3 font-semibold text-slate-200">{r.partner_company_name ?? "—"}</td>
                      <td className="px-4 py-3 text-slate-300">{r.deal_company_name ?? "—"}</td>
                      <td className="px-4 py-3">
                        <span className="text-slate-400 block">{r.product_type ?? "—"}</span>
                        {r.offer_amount != null && (
                          <span className="tabular-nums text-slate-200 font-semibold">{r.currency} {Number(r.offer_amount).toLocaleString()}</span>
                        )}
                      </td>
                      <td className="px-4 py-3 font-mono text-slate-500">{r.job_reference ?? "—"}</td>
                      <td className="px-4 py-3">
                        <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${ACCESS_STATUS_BADGE[eas]}`}>
                          {eas}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        {r.partner_interest_status ? (
                          <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${PARTNER_INTEREST_BADGE[r.partner_interest_status as keyof typeof PARTNER_INTEREST_BADGE] ?? "border-slate-700 text-slate-400"}`}>
                            {r.partner_interest_status}
                          </span>
                        ) : <span className="text-slate-600 italic">—</span>}
                      </td>
                      <td className="px-4 py-3 text-slate-500">
                        {r.partner_viewed_at
                          ? <span className="text-emerald-400/70">✓ {new Date(r.partner_viewed_at).toLocaleDateString("en-MY")}</span>
                          : <span className="text-slate-700">Not viewed</span>}
                      </td>
                      <td className="px-4 py-3 text-slate-500">
                        {r.access_expires_at ? new Date(r.access_expires_at).toLocaleDateString("en-MY") : "No expiry"}
                      </td>
                      <td className="px-4 py-3 text-slate-600">
                        {new Date(r.created_at).toLocaleDateString("en-MY")}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          {r.financing_offer_id && (
                            <Link
                              href={`/capital/opportunities/${r.financing_offer_id}`}
                              target="_blank"
                              className="rounded border border-slate-700 bg-slate-800 px-2 py-0.5 text-slate-300 hover:bg-slate-700 transition-colors text-[10px]"
                            >
                              Preview
                            </Link>
                          )}
                          {eas !== "Revoked" && (
                            <button
                              type="button"
                              disabled={actionLoading === r.id}
                              onClick={() => handleAction(r.id, "revoke")}
                              className="rounded border border-red-500/20 bg-red-500/5 px-2 py-0.5 text-red-400 hover:bg-red-500/10 transition-colors text-[10px] disabled:opacity-40"
                            >
                              {actionLoading === r.id ? "…" : "Revoke"}
                            </button>
                          )}
                          {eas === "Revoked" && (
                            <button
                              type="button"
                              disabled={actionLoading === r.id}
                              onClick={() => handleAction(r.id, "mark_active")}
                              className="rounded border border-emerald-500/20 bg-emerald-500/5 px-2 py-0.5 text-emerald-400 hover:bg-emerald-500/10 transition-colors text-[10px] disabled:opacity-40"
                            >
                              {actionLoading === r.id ? "…" : "Re-activate"}
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </main>
    </div>
  );
}
