"use client";
import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useAuth } from "@/contexts/AuthContext";
import { AuthGuard } from "@/components/AuthGuard";
import { LogoutButton } from "@/components/LogoutButton";
import { NotificationBell } from "@/components/NotificationBell";
import { supabase } from "@/lib/supabaseClient";
import {
  PARTNER_STATUS_BADGE,
  checkWording,
  type PaymentPartnerSetup,
  type PartnerType,
  type HoldingModel,
  type PartnerStatus,
} from "@/lib/paymentCompliance";

const PARTNER_TYPES: PartnerType[] = [
  "Bank", "Licensed Payment Partner", "Trustee", "Escrow Provider",
  "Collection Account Provider", "Manual Pilot Account", "Other",
];

const HOLDING_MODELS: HoldingModel[] = [
  "Nexum Collection Account", "Partner Controlled Account", "Client Designated Account",
  "Trust / Escrow Arrangement", "Manual Pilot Reference", "Other",
];

const STATUSES: PartnerStatus[] = ["Research", "In Discussion", "Pilot Ready", "Active", "Disabled"];

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h2 className="text-[11px] font-semibold uppercase tracking-widest text-slate-500">{children}</h2>;
}

function Badge({ label, cls }: { label: string; cls: string }) {
  return <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium ${cls}`}>{label}</span>;
}

const EMPTY_FORM = {
  partner_name: "", partner_type: "Manual Pilot Account" as PartnerType,
  jurisdiction: "", license_reference: "", supported_currencies: "RM",
  supported_payment_methods: "Bank Transfer", holding_model: "Manual Pilot Reference" as HoldingModel,
  status: "Research" as PartnerStatus, compliance_notes: "", allowed_wording: "",
  prohibited_wording: "", settlement_process_note: "",
};

export default function PaymentPartnersPage() {
  return <AuthGuard requiredRole="admin"><Inner /></AuthGuard>;
}

function Inner() {
  const { profile } = useAuth();
  const actorName = profile?.full_name ?? "Nexum Admin";

  const [partners,    setPartners]    = useState<PaymentPartnerSetup[]>([]);
  const [loading,     setLoading]     = useState(true);
  const [editingId,   setEditingId]   = useState<string | null>(null);
  const [showCreate,  setShowCreate]  = useState(false);
  const [form,        setForm]        = useState(EMPTY_FORM);
  const [busy,        setBusy]        = useState(false);
  const [msg,         setMsg]         = useState<{ type: "ok" | "err"; text: string } | null>(null);
  const [scanBusy,    setScanBusy]    = useState(false);
  const [scanToast,   setScanToast]   = useState<string | null>(null);

  async function runWordingScan() {
    setScanBusy(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token ?? "";
      const res = await fetch("/api/compliance-wording-scan", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ sourceTypes: ["payment_partner_setup"], actorName }),
      });
      const json = await res.json();
      const text = res.ok ? `Scan complete — ${json.newFindings} new issue${json.newFindings !== 1 ? "s" : ""} found.` : `Error: ${json.error}`;
      setScanToast(text);
      setTimeout(() => setScanToast(null), 5000);
    } finally { setScanBusy(false); }
  }

  const wordingWarnings = checkWording(form.compliance_notes + " " + form.allowed_wording);

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase.from("payment_partner_setups").select("*").order("updated_at", { ascending: false });
    setPartners((data ?? []) as PaymentPartnerSetup[]);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  function editPartner(p: PaymentPartnerSetup) {
    setEditingId(p.id);
    setShowCreate(false);
    setForm({
      partner_name: p.partner_name, partner_type: p.partner_type, jurisdiction: p.jurisdiction ?? "",
      license_reference: p.license_reference ?? "",
      supported_currencies: (p.supported_currencies ?? []).join(", "),
      supported_payment_methods: (p.supported_payment_methods ?? []).join(", "),
      holding_model: p.holding_model, status: p.status,
      compliance_notes: p.compliance_notes ?? "", allowed_wording: p.allowed_wording ?? "",
      prohibited_wording: p.prohibited_wording ?? "", settlement_process_note: p.settlement_process_note ?? "",
    });
  }

  function parseCurrencies(s: string): string[] {
    return s.split(",").map((x) => x.trim().toUpperCase()).filter(Boolean);
  }
  function parseMethods(s: string): string[] {
    return s.split(",").map((x) => x.trim()).filter(Boolean);
  }

  async function handleSave() {
    setBusy(true); setMsg(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token ?? "";
      const body = {
        ...form,
        supported_currencies:      parseCurrencies(form.supported_currencies),
        supported_payment_methods: parseMethods(form.supported_payment_methods),
        actorName,
      };

      const url  = editingId ? `/api/payment-partners/${editingId}` : "/api/payment-partners";
      const meth = editingId ? "PATCH" : "POST";
      const res  = await fetch(url, {
        method: meth,
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!res.ok) { setMsg({ type: "err", text: json.error ?? "Failed" }); return; }
      setMsg({ type: "ok", text: editingId ? "Partner updated." : "Partner created." });
      setEditingId(null); setShowCreate(false); setForm(EMPTY_FORM);
      load();
    } finally { setBusy(false); }
  }

  const isEditing = showCreate || editingId !== null;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-200">
      <header className="sticky top-0 z-40 flex items-center justify-between border-b border-slate-800 bg-slate-950/90 px-6 py-3 backdrop-blur">
        <div className="flex items-center gap-4">
          <Link href="/admin" className="text-xs text-slate-500 hover:text-slate-300 transition-colors">← Admin</Link>
          <span className="text-slate-800">|</span>
          <h1 className="text-sm font-semibold tracking-tight text-slate-100">Payment Partner Setups</h1>
        </div>
        <div className="flex items-center gap-3">
          <button onClick={runWordingScan} disabled={scanBusy}
            className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-1.5 text-[11px] font-semibold text-amber-300 hover:bg-amber-500/20 disabled:opacity-40 transition-colors">
            {scanBusy ? "Scanning…" : "Run Wording Scan"}
          </button>
          <NotificationBell /><LogoutButton />
        </div>
      </header>
      {scanToast && (
        <div className="fixed bottom-4 right-4 z-50 rounded-xl border border-amber-500/30 bg-amber-900/80 px-4 py-2.5 text-xs text-amber-300 shadow-lg">{scanToast}</div>
      )}

      {/* Compliance banner */}
      <div className="border-b border-slate-800 bg-amber-950/10 px-6 py-2.5">
        <p className="text-[10px] text-amber-400/70">
          <span className="font-semibold text-amber-400">Readiness Only</span>
          {" — "}
          This pilot records payment holding and release workflow status. Actual fund holding, transfer, or escrow service must be performed through approved bank, licensed partner, or designated legal arrangement.
        </p>
      </div>

      <main className="mx-auto max-w-6xl px-6 py-8">
        {/* ── Create / edit form ──────────────────────────────────────────────── */}
        {!isEditing && (
          <div className="mb-6 flex justify-end">
            <button
              onClick={() => { setShowCreate(true); setForm(EMPTY_FORM); setMsg(null); }}
              className="rounded-xl border border-blue-500/30 bg-blue-500/10 px-4 py-2 text-xs font-semibold text-blue-300 hover:bg-blue-500/20 transition-colors"
            >
              + New Partner Setup
            </button>
          </div>
        )}

        {isEditing && (
          <div className="mb-8 rounded-2xl border border-slate-800 bg-slate-900/60 p-6">
            <div className="mb-5 flex items-center justify-between">
              <SectionTitle>{editingId ? "Edit Partner Setup" : "New Partner Setup"}</SectionTitle>
              <button onClick={() => { setEditingId(null); setShowCreate(false); }} className="text-[10px] text-slate-600 hover:text-slate-400">✕ Cancel</button>
            </div>

            {msg && (
              <div className={`mb-4 rounded-lg border px-3 py-2 text-xs ${msg.type === "ok" ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300" : "border-red-500/30 bg-red-500/10 text-red-300"}`}>
                {msg.text}
              </div>
            )}

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {[
                { label: "Partner Name *", key: "partner_name", type: "text" },
                { label: "Jurisdiction",   key: "jurisdiction",  type: "text" },
                { label: "License Reference", key: "license_reference", type: "text" },
                { label: "Supported Currencies (comma-sep)", key: "supported_currencies", type: "text" },
                { label: "Supported Payment Methods (comma-sep)", key: "supported_payment_methods", type: "text" },
              ].map(({ label, key, type }) => (
                <div key={key}>
                  <label className="mb-1 block text-[10px] font-medium text-slate-500">{label}</label>
                  <input
                    type={type}
                    value={(form as Record<string, string>)[key] ?? ""}
                    onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
                    className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-xs text-slate-200 placeholder-slate-600 focus:border-blue-500 focus:outline-none"
                  />
                </div>
              ))}

              <div>
                <label className="mb-1 block text-[10px] font-medium text-slate-500">Partner Type *</label>
                <select value={form.partner_type} onChange={(e) => setForm((f) => ({ ...f, partner_type: e.target.value as PartnerType }))}
                  className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-xs text-slate-200 focus:border-blue-500 focus:outline-none">
                  {PARTNER_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>

              <div>
                <label className="mb-1 block text-[10px] font-medium text-slate-500">Holding Model *</label>
                <select value={form.holding_model} onChange={(e) => setForm((f) => ({ ...f, holding_model: e.target.value as HoldingModel }))}
                  className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-xs text-slate-200 focus:border-blue-500 focus:outline-none">
                  {HOLDING_MODELS.map((m) => <option key={m} value={m}>{m}</option>)}
                </select>
              </div>

              <div>
                <label className="mb-1 block text-[10px] font-medium text-slate-500">Status</label>
                <select value={form.status} onChange={(e) => setForm((f) => ({ ...f, status: e.target.value as PartnerStatus }))}
                  className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-xs text-slate-200 focus:border-blue-500 focus:outline-none">
                  {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
            </div>

            <div className="mt-4 grid grid-cols-1 gap-4">
              {[
                { label: "Compliance Notes", key: "compliance_notes" },
                { label: "Allowed Wording (what admins may say)", key: "allowed_wording" },
                { label: "Prohibited Wording (what to avoid)", key: "prohibited_wording" },
                { label: "Settlement Process Note", key: "settlement_process_note" },
              ].map(({ label, key }) => (
                <div key={key}>
                  <label className="mb-1 block text-[10px] font-medium text-slate-500">{label}</label>
                  <textarea
                    value={(form as Record<string, string>)[key] ?? ""}
                    onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
                    rows={2}
                    className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-xs text-slate-200 placeholder-slate-600 focus:border-blue-500 focus:outline-none resize-none"
                  />
                </div>
              ))}
            </div>

            {wordingWarnings.length > 0 && (
              <div className="mt-3 space-y-1">
                <p className="text-[10px] font-semibold text-amber-400">Wording warnings detected:</p>
                {wordingWarnings.map((w, i) => (
                  <div key={i} className="flex items-start gap-1.5 rounded border border-amber-500/30 bg-amber-950/10 px-2.5 py-1.5 text-[10px]">
                    <span className="text-amber-400">⚠</span>
                    <span className="text-amber-300">"{w.found}"</span>
                    <span className="text-slate-500">— {w.suggestion}</span>
                  </div>
                ))}
              </div>
            )}

            <div className="mt-5 flex gap-2">
              <button onClick={handleSave} disabled={busy || !form.partner_name}
                className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-5 py-2 text-xs font-semibold text-emerald-300 hover:bg-emerald-500/20 disabled:opacity-40 transition-colors">
                {busy ? "Saving…" : editingId ? "Update" : "Create Partner Setup"}
              </button>
              <button onClick={() => { setEditingId(null); setShowCreate(false); }}
                className="rounded-xl border border-slate-700 px-4 py-2 text-xs text-slate-400 hover:bg-slate-800 transition-colors">Cancel</button>
            </div>
          </div>
        )}

        {/* ── Partner list ──────────────────────────────────────────────────── */}
        <section>
          <div className="mb-4 flex items-center justify-between">
            <SectionTitle>Partner Setups ({partners.length})</SectionTitle>
          </div>

          {loading ? (
            <p className="text-xs text-slate-600">Loading…</p>
          ) : partners.length === 0 ? (
            <div className="rounded-xl border border-slate-800 bg-slate-900/60 px-6 py-8 text-center">
              <p className="text-xs text-slate-600">No partner setups yet. Create one above to track payment holding arrangements.</p>
            </div>
          ) : (
            <div className="overflow-hidden rounded-2xl border border-slate-800">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-slate-800 bg-slate-900/80">
                    {["Name", "Type", "Holding Model", "Status", "Currencies", "Updated", ""].map((h) => (
                      <th key={h} className="px-4 py-3 text-left text-[10px] font-medium text-slate-500">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {partners.map((p) => (
                    <tr key={p.id} className="border-b border-slate-800/60 hover:bg-slate-800/30 transition-colors">
                      <td className="px-4 py-3 font-medium text-slate-200">{p.partner_name}</td>
                      <td className="px-4 py-3 text-slate-400">{p.partner_type}</td>
                      <td className="px-4 py-3 text-slate-400">{p.holding_model}</td>
                      <td className="px-4 py-3"><Badge label={p.status} cls={PARTNER_STATUS_BADGE[p.status] ?? ""} /></td>
                      <td className="px-4 py-3 text-slate-500">{(p.supported_currencies ?? []).join(", ") || "—"}</td>
                      <td className="px-4 py-3 text-slate-600 text-[10px]">{new Date(p.updated_at).toLocaleDateString("en-MY", { day: "2-digit", month: "short" })}</td>
                      <td className="px-4 py-3">
                        <button onClick={() => editPartner(p)}
                          className="rounded-lg border border-slate-700 px-2.5 py-1 text-[10px] text-slate-400 hover:bg-slate-800 transition-colors">
                          Edit
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <p className="mt-3 text-[9px] text-slate-700">
            Do not create setups that claim automated fund holding without appropriate legal/regulatory framework.
            Manual Pilot Account status = record-keeping only.
          </p>
        </section>
      </main>
    </div>
  );
}
