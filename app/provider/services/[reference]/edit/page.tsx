"use client";
import { use, useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { LogoutButton } from "@/components/LogoutButton";
import { NotificationBell } from "@/components/NotificationBell";
import { CATEGORY_FIELDS, RATE_TABLE_CATEGORIES, SERVICE_CATEGORY_ICON, type ServiceCategory, type ListingField } from "@/lib/marketplace";

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

const ic  = "w-full rounded-lg border border-slate-700 bg-slate-800/80 px-3 py-2 text-sm text-slate-100 placeholder-slate-600 focus:border-blue-500 focus:outline-none";
const sc  = "w-full rounded-lg border border-slate-700 bg-slate-800/80 px-3 py-2 text-sm text-slate-100 focus:border-blue-500 focus:outline-none";
const tac = "w-full rounded-lg border border-slate-700 bg-slate-800/80 px-3 py-2 text-sm text-slate-100 placeholder-slate-600 focus:border-blue-500 focus:outline-none resize-none";

const CURRENCIES = ["USD","MYR","SGD","EUR","GBP","CNY","AUD","THB","IDR","PHP","VND"];

function DynField({ f, val, onChange }: { f: ListingField; val: string | boolean; onChange: (v: string | boolean) => void }) {
  const label = <label className="text-xs font-medium text-slate-300">{f.label}{f.required && <span className="text-red-400 ml-0.5">*</span>}</label>;
  if (f.type === "toggle") return (
    <div className="flex items-center justify-between rounded-lg border border-slate-700 bg-slate-800/40 px-4 py-3">
      {label}
      <button type="button" onClick={() => onChange(!val)} className={`relative inline-flex h-5 w-9 rounded-full transition-colors ${val ? "bg-blue-600" : "bg-slate-600"}`}>
        <span className={`inline-block h-4 w-4 rounded-full bg-white transition-transform mt-0.5 ${val ? "translate-x-4.5" : "translate-x-0.5"}`} />
      </button>
    </div>
  );
  if (f.type === "select") return (
    <div className={f.span === "full" ? "col-span-2" : ""}>
      {label}
      <select className={sc + " mt-1"} value={val as string} onChange={e => onChange(e.target.value)}>
        <option value="">— select —</option>
        {f.options?.map(o => <option key={o}>{o}</option>)}
      </select>
    </div>
  );
  if (f.type === "textarea") return (
    <div className="col-span-2">{label}<textarea className={tac + " mt-1"} rows={3} value={val as string} onChange={e => onChange(e.target.value)} placeholder={f.placeholder} /></div>
  );
  return (
    <div className={f.span === "full" ? "col-span-2" : ""}>{label}<input type={f.type === "number" ? "number" : "text"} step="any" className={ic + " mt-1"} value={val as string} onChange={e => onChange(e.target.value)} placeholder={f.placeholder} /></div>
  );
}

export default function EditListingPage({ params }: { params: Promise<{ reference: string }> }) {
  const { reference } = use(params);
  const router = useRouter();
  const [listing,     setListing]     = useState<Record<string, unknown> | null>(null);
  const [loading,     setLoading]     = useState(true);
  const [err,         setErr]         = useState("");
  const [saving,      setSaving]      = useState(false);
  const [title,       setTitle]       = useState("");
  const [description, setDescription] = useState("");
  const [currency,    setCurrency]    = useState("USD");
  const [price,       setPrice]       = useState("");
  const [validFrom,   setValidFrom]   = useState("");
  const [validTo,     setValidTo]     = useState("");
  const [remarks,     setRemarks]     = useState("");
  const [details,     setDetails]     = useState<Record<string, string | boolean>>({});

  useEffect(() => {
    async function load() {
      const res  = await fetch(`/api/marketplace/listings/${reference}`, { headers: { Authorization: `Bearer ${await getToken()}` } });
      const json = await res.json() as { ok?: boolean; listing?: Record<string, unknown>; error?: string };
      if (!json.ok) { setErr(json.error ?? "Not found"); setLoading(false); return; }
      const l = json.listing!;
      setListing(l);
      setTitle(String(l.listing_title ?? ""));
      setDescription(String(l.description ?? ""));
      setCurrency(String(l.currency ?? "USD"));
      setValidFrom(String(l.validity_from ?? ""));
      setValidTo(String(l.validity_to   ?? ""));
      setRemarks(String(l.remarks       ?? ""));
      const dj = (l.detail_json ?? {}) as Record<string, unknown>;
      if (dj.price) setPrice(String(dj.price));
      const detailsCopy: Record<string, string | boolean> = {};
      for (const [k, v] of Object.entries(dj)) {
        if (k !== "price") detailsCopy[k] = typeof v === "boolean" ? v : String(v);
      }
      setDetails(detailsCopy);
      setLoading(false);
    }
    void load();
  }, [reference]);

  const cat    = listing?.service_category as ServiceCategory | undefined;
  const fields = cat ? CATEGORY_FIELDS[cat] : [];
  const isRate = cat ? RATE_TABLE_CATEGORIES.includes(cat) : false;

  function setDetail(k: string, v: string | boolean) { setDetails(p => ({ ...p, [k]: v })); }

  async function save(asDraft = false) {
    setSaving(true); setErr("");
    const detailJson: Record<string, unknown> = { ...details };
    if (!isRate && price) detailJson.price = parseFloat(price);

    const res = await fetch(`/api/marketplace/listings/${reference}`, {
      method:  "PATCH",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${await getToken()}` },
      body:    JSON.stringify({
        listing_title:     title,
        description:       description || null,
        currency,
        validity_from:     validFrom || null,
        validity_to:       validTo   || null,
        remarks:           remarks   || null,
        detail_json:       detailJson,
        submit_for_review: !asDraft,
      }),
    });
    const json = await res.json() as { ok?: boolean; error?: string };
    if (json.ok) router.push(`/provider/services/${reference}`);
    else { setErr(json.error ?? "Save failed"); setSaving(false); }
  }

  if (loading) return <div className="min-h-screen bg-slate-950 flex items-center justify-center text-slate-400 text-sm">Loading…</div>;

  const status = String(listing?.status ?? "");
  if (!["Draft","Rejected"].includes(status))
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center text-slate-400 text-sm">
        <div className="text-center">
          <p>This listing cannot be edited (status: <strong>{status}</strong>)</p>
          <Link href={`/provider/services/${reference}`} className="mt-2 inline-block text-xs text-blue-400 hover:text-blue-300">← Back to listing</Link>
        </div>
      </div>
    );

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 font-sans">
      <header className="border-b border-slate-800 bg-slate-950/80 sticky top-0 z-50">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-6">
          <Link href="/" className="flex items-center gap-2 text-sm font-semibold"><span className="text-blue-400">&#9632;</span>Nexum SecureFlow</Link>
          <nav className="flex items-center gap-4 text-xs text-slate-400">
            <span className="rounded-full border border-purple-500/30 bg-purple-500/10 px-3 py-1 text-purple-400 font-medium">Provider</span>
            <Link href="/provider/services" className="hover:text-slate-100">My Listings</Link>
            <NotificationBell /><LogoutButton />
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-6 py-10">
        <Link href={`/provider/services/${reference}`} className="text-xs text-slate-500 hover:text-slate-300">← Back to listing</Link>
        <h1 className="mt-3 text-xl font-bold text-slate-50">
          {cat && SERVICE_CATEGORY_ICON[cat]} Edit Listing — <span className="font-mono text-slate-400 text-base">{reference}</span>
        </h1>
        {status === "Rejected" && listing?.review_note && (
          <div className="mt-3 rounded-xl border border-red-500/20 bg-red-500/5 px-4 py-3 text-xs text-red-300">
            <strong>Rejection reason:</strong> {String(listing.review_note)}
          </div>
        )}

        <div className="mt-6 rounded-xl border border-slate-800 bg-slate-900/40 p-7 space-y-5">
          <div>
            <label className="text-xs font-medium text-slate-300">Listing Title <span className="text-red-400">*</span></label>
            <input className={ic + " mt-1"} value={title} onChange={e => setTitle(e.target.value)} placeholder="Enter a clear, descriptive title" />
          </div>
          <div>
            <label className="text-xs font-medium text-slate-300">Description <span className="text-red-400">*</span></label>
            <textarea className={tac + " mt-1"} rows={3} value={description} onChange={e => setDescription(e.target.value)} placeholder="Describe your service offering" />
          </div>

          {fields.length > 0 && (
            <div className="grid grid-cols-2 gap-4">
              {fields.map(f => {
                if (f.showWhen && details[f.showWhen.key] !== f.showWhen.value) return null;
                return <DynField key={f.key} f={f} val={details[f.key] ?? (f.type === "toggle" ? false : "")} onChange={v => setDetail(f.key, v)} />;
              })}
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            {!isRate && (
              <div>
                <label className="text-xs font-medium text-slate-300">Price / Rate</label>
                <input type="number" step="any" className={ic + " mt-1"} value={price} onChange={e => setPrice(e.target.value)} placeholder="0.00" />
              </div>
            )}
            <div>
              <label className="text-xs font-medium text-slate-300">Currency</label>
              <select className={sc + " mt-1"} value={currency} onChange={e => setCurrency(e.target.value)}>
                {CURRENCIES.map(c => <option key={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-slate-300">Valid From</label>
              <input type="date" className={ic + " mt-1"} value={validFrom} onChange={e => setValidFrom(e.target.value)} />
            </div>
            <div>
              <label className="text-xs font-medium text-slate-300">Valid Until</label>
              <input type="date" className={ic + " mt-1"} value={validTo} onChange={e => setValidTo(e.target.value)} />
            </div>
          </div>
          <div>
            <label className="text-xs font-medium text-slate-300">Remarks</label>
            <textarea className={tac + " mt-1"} rows={2} value={remarks} onChange={e => setRemarks(e.target.value)} placeholder="Additional terms or notes" />
          </div>

          {err && <div className="rounded-lg border border-red-500/30 bg-red-500/5 px-4 py-2 text-xs text-red-300">{err}</div>}

          <div className="flex items-center justify-end gap-3 pt-2">
            <button type="button" onClick={() => save(true)} disabled={saving}
              className="rounded-lg border border-slate-600 px-4 py-2 text-sm text-slate-300 hover:bg-slate-800 disabled:opacity-40 transition-colors">
              Save as Draft
            </button>
            <button type="button" onClick={() => save(false)} disabled={saving}
              className="rounded-lg bg-emerald-600 hover:bg-emerald-500 px-6 py-2 text-sm font-semibold text-white disabled:opacity-40 transition-colors">
              {saving ? "Saving…" : "Resubmit for Review →"}
            </button>
          </div>
        </div>
      </main>
    </div>
  );
}
