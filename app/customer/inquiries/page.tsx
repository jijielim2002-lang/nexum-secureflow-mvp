"use client";

// ─── Customer Inquiries — pre-job service request workflow ────────────────────
// Customer submits a service inquiry → Provider quotes → Customer accepts →
// Secured job is auto-created and payment holding begins.

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";
import { useAuth } from "@/contexts/AuthContext";
import { LogoutButton } from "@/components/LogoutButton";
import { NotificationBell } from "@/components/NotificationBell";
import {
  SERVICE_TYPES,
  INCOTERMS,
  CURRENCIES,
  fmtInquiryStatus,
  fmtQuotationStatus,
  fmtQDate,
  fmtQAmount,
  type InquiryRow,
  type QuotationRow,
} from "@/lib/quotation";
import { ProviderBenchmarkCard } from "@/components/ProviderBenchmarkCard";

// ── Types ─────────────────────────────────────────────────────────────────────

type Tab = "active" | "quoted" | "converted" | "cancelled";

// ── Helpers ───────────────────────────────────────────────────────────────────

function getAuthHeader(token: string) {
  return { Authorization: `Bearer ${token}` };
}

async function getToken(): Promise<string | null> {
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? null;
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function CustomerInquiriesPage() {
  const { profile } = useAuth();
  const router = useRouter();

  const [tab, setTab] = useState<Tab>("active");
  const [inquiries, setInquiries] = useState<InquiryRow[]>([]);
  const [quotationMap, setQuotationMap] = useState<Record<string, QuotationRow>>({});
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [acceptingId, setAcceptingId] = useState<string | null>(null);
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [formError, setFormError] = useState<string | null>(null);

  // Form state
  const [form, setForm] = useState({
    service_type:           "",
    origin:                 "",
    destination:            "",
    cargo_description:      "",
    estimated_cargo_value:  "",
    currency:               "RM",
    incoterm_preference:    "",
    target_delivery_date:   "",
    special_requirements:   "",
  });

  const setField = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));

  // ── Load data ──────────────────────────────────────────────────────────────

  const load = useCallback(async () => {
    setLoading(true);
    const token = await getToken();
    if (!token) { setLoading(false); return; }

    const res = await fetch("/api/inquiries", {
      headers: getAuthHeader(token),
    });
    if (!res.ok) { setLoading(false); return; }

    const { data } = (await res.json()) as { data: InquiryRow[] };
    setInquiries(data ?? []);

    // Fetch quotations for all inquiries in one call
    const quotedInquiries = (data ?? []).filter((i) =>
      ["Quoted", "Converted"].includes(i.status),
    );

    if (quotedInquiries.length > 0) {
      const qRes = await fetch("/api/quotations", {
        headers: getAuthHeader(token),
      });
      if (qRes.ok) {
        const { data: qData } = (await qRes.json()) as { data: QuotationRow[] };
        const map: Record<string, QuotationRow> = {};
        for (const q of qData ?? []) {
          if (q.inquiry_id) map[q.inquiry_id] = q;
        }
        setQuotationMap(map);
      }
    }

    setLoading(false);
  }, []);

  useEffect(() => { void load(); }, [load]);

  // ── Filtered lists ─────────────────────────────────────────────────────────

  const filtered = inquiries.filter((i) => {
    if (tab === "active")    return ["Submitted", "Assigned"].includes(i.status);
    if (tab === "quoted")    return i.status === "Quoted";
    if (tab === "converted") return i.status === "Converted";
    if (tab === "cancelled") return i.status === "Cancelled";
    return true;
  });

  // ── Submit inquiry ─────────────────────────────────────────────────────────

  async function handleSubmit() {
    if (!form.service_type) { setFormError("Service type is required."); return; }
    setFormError(null);
    setSubmitting(true);

    const token = await getToken();
    if (!token) { setSubmitting(false); return; }

    const res = await fetch("/api/inquiries", {
      method:  "POST",
      headers: { ...getAuthHeader(token), "Content-Type": "application/json" },
      body:    JSON.stringify({
        service_type:          form.service_type,
        origin:                form.origin || undefined,
        destination:           form.destination || undefined,
        cargo_description:     form.cargo_description || undefined,
        estimated_cargo_value: form.estimated_cargo_value
          ? Number(form.estimated_cargo_value)
          : undefined,
        currency:              form.currency,
        incoterm_preference:   form.incoterm_preference || undefined,
        target_delivery_date:  form.target_delivery_date || undefined,
        special_requirements:  form.special_requirements || undefined,
      }),
    });

    setSubmitting(false);

    if (!res.ok) {
      const { error } = (await res.json()) as { error: string };
      setFormError(error);
      return;
    }

    setShowForm(false);
    setForm({
      service_type: "", origin: "", destination: "", cargo_description: "",
      estimated_cargo_value: "", currency: "RM", incoterm_preference: "",
      target_delivery_date: "", special_requirements: "",
    });
    setTab("active");
    await load();
  }

  // ── Accept quotation ───────────────────────────────────────────────────────

  async function handleAccept(quotation: QuotationRow) {
    setAcceptingId(quotation.id);
    const token = await getToken();
    if (!token) { setAcceptingId(null); return; }

    const res = await fetch(`/api/quotations/${quotation.id}`, {
      method:  "PATCH",
      headers: { ...getAuthHeader(token), "Content-Type": "application/json" },
      body:    JSON.stringify({ action: "accept" }),
    });

    setAcceptingId(null);

    if (!res.ok) {
      const { error } = (await res.json()) as { error: string };
      alert(`Failed to accept: ${error}`);
      return;
    }

    const { job_reference } = (await res.json()) as { job_reference: string };
    router.push(`/customer/jobs/${job_reference}`);
  }

  // ── Reject quotation ───────────────────────────────────────────────────────

  async function handleReject(quotation: QuotationRow) {
    if (!rejectReason.trim()) {
      alert("Please enter a reason for rejection.");
      return;
    }
    const token = await getToken();
    if (!token) return;

    const res = await fetch(`/api/quotations/${quotation.id}`, {
      method:  "PATCH",
      headers: { ...getAuthHeader(token), "Content-Type": "application/json" },
      body:    JSON.stringify({ action: "reject", rejection_reason: rejectReason }),
    });

    if (!res.ok) {
      const { error } = (await res.json()) as { error: string };
      alert(`Failed to reject: ${error}`);
      return;
    }

    setRejectingId(null);
    setRejectReason("");
    await load();
  }

  // ── Cancel inquiry ─────────────────────────────────────────────────────────

  async function handleCancel(inquiryId: string) {
    if (!confirm("Are you sure you want to cancel this inquiry?")) return;
    const token = await getToken();
    if (!token) return;

    await fetch(`/api/inquiries/${inquiryId}`, {
      method:  "PATCH",
      headers: { ...getAuthHeader(token), "Content-Type": "application/json" },
      body:    JSON.stringify({ action: "cancel" }),
    });
    await load();
  }

  // ── Tab counts ─────────────────────────────────────────────────────────────

  const tabCounts = {
    active:    inquiries.filter((i) => ["Submitted", "Assigned"].includes(i.status)).length,
    quoted:    inquiries.filter((i) => i.status === "Quoted").length,
    converted: inquiries.filter((i) => i.status === "Converted").length,
    cancelled: inquiries.filter((i) => i.status === "Cancelled").length,
  };

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-slate-950 text-slate-200">
      {/* Nav */}
      <nav className="border-b border-slate-800 bg-slate-900/60 backdrop-blur px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link href="/customer" className="text-slate-400 hover:text-slate-200 text-sm">← Dashboard</Link>
          <span className="text-slate-700">|</span>
          <h1 className="text-sm font-semibold text-slate-100">Service Inquiries</h1>
        </div>
        <div className="flex items-center gap-3">
          <NotificationBell />
          <span className="text-xs text-slate-500">{profile?.full_name}</span>
          <LogoutButton />
        </div>
      </nav>

      <div className="max-w-6xl mx-auto px-6 py-8 space-y-6">

        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-bold text-slate-100">My Service Inquiries</h2>
            <p className="text-xs text-slate-500 mt-0.5">Submit a service request, review quotations, and create secured jobs.</p>
          </div>
          <button
            onClick={() => setShowForm((v) => !v)}
            className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium transition-colors"
          >
            {showForm ? "Cancel" : "+ New Inquiry"}
          </button>
        </div>

        {/* New inquiry form */}
        {showForm && (
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 space-y-4">
            <h3 className="text-sm font-semibold text-slate-100">New Service Inquiry</h3>
            {formError && (
              <p className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">{formError}</p>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Service type */}
              <div className="sm:col-span-2">
                <label className="block text-xs text-slate-400 mb-1">Service Type <span className="text-red-400">*</span></label>
                <select
                  value={form.service_type}
                  onChange={(e) => setField("service_type", e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-blue-500"
                >
                  <option value="">Select service type…</option>
                  {SERVICE_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>

              {/* Origin / Destination */}
              <div>
                <label className="block text-xs text-slate-400 mb-1">Origin</label>
                <input
                  type="text"
                  placeholder="e.g. Port Klang, Malaysia"
                  value={form.origin}
                  onChange={(e) => setField("origin", e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 placeholder-slate-600 focus:outline-none focus:border-blue-500"
                />
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-1">Destination</label>
                <input
                  type="text"
                  placeholder="e.g. Tanjung Pelepas, Malaysia"
                  value={form.destination}
                  onChange={(e) => setField("destination", e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 placeholder-slate-600 focus:outline-none focus:border-blue-500"
                />
              </div>

              {/* Cargo */}
              <div className="sm:col-span-2">
                <label className="block text-xs text-slate-400 mb-1">Cargo Description</label>
                <textarea
                  rows={2}
                  placeholder="Describe the cargo, quantity, packaging, special handling…"
                  value={form.cargo_description}
                  onChange={(e) => setField("cargo_description", e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 placeholder-slate-600 focus:outline-none focus:border-blue-500 resize-none"
                />
              </div>

              {/* Value + Currency */}
              <div>
                <label className="block text-xs text-slate-400 mb-1">Estimated Cargo Value</label>
                <input
                  type="number"
                  min="0"
                  placeholder="0.00"
                  value={form.estimated_cargo_value}
                  onChange={(e) => setField("estimated_cargo_value", e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 placeholder-slate-600 focus:outline-none focus:border-blue-500"
                />
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-1">Currency</label>
                <select
                  value={form.currency}
                  onChange={(e) => setField("currency", e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-blue-500"
                >
                  {CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>

              {/* Incoterm + Delivery date */}
              <div>
                <label className="block text-xs text-slate-400 mb-1">Incoterm Preference</label>
                <select
                  value={form.incoterm_preference}
                  onChange={(e) => setField("incoterm_preference", e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-blue-500"
                >
                  <option value="">Not specified</option>
                  {INCOTERMS.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-1">Target Delivery Date</label>
                <input
                  type="date"
                  value={form.target_delivery_date}
                  onChange={(e) => setField("target_delivery_date", e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-blue-500"
                />
              </div>

              {/* Special requirements */}
              <div className="sm:col-span-2">
                <label className="block text-xs text-slate-400 mb-1">Special Requirements</label>
                <textarea
                  rows={2}
                  placeholder="Temperature control, hazmat, oversized load, insurance requirements…"
                  value={form.special_requirements}
                  onChange={(e) => setField("special_requirements", e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 placeholder-slate-600 focus:outline-none focus:border-blue-500 resize-none"
                />
              </div>
            </div>

            <div className="flex items-center gap-3 pt-2">
              <button
                onClick={() => void handleSubmit()}
                disabled={submitting}
                className="px-5 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-sm font-medium transition-colors"
              >
                {submitting ? "Submitting…" : "Submit Inquiry"}
              </button>
              <button
                onClick={() => { setShowForm(false); setFormError(null); }}
                className="px-4 py-2 rounded-lg border border-slate-700 text-slate-400 hover:text-slate-200 text-sm transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* Tabs */}
        <div className="flex gap-1 border-b border-slate-800">
          {(["active", "quoted", "converted", "cancelled"] as Tab[]).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-4 py-2 text-sm font-medium capitalize transition-colors border-b-2 -mb-px ${
                tab === t
                  ? "border-blue-500 text-blue-400"
                  : "border-transparent text-slate-500 hover:text-slate-300"
              }`}
            >
              {t === "active" ? "Active" : t === "quoted" ? "Quotation Received" : t === "converted" ? "Converted to Job" : "Cancelled"}
              {tabCounts[t] > 0 && (
                <span className={`ml-1.5 text-xs px-1.5 py-0.5 rounded-full ${
                  tab === t ? "bg-blue-500/20 text-blue-400" : "bg-slate-800 text-slate-500"
                }`}>{tabCounts[t]}</span>
              )}
            </button>
          ))}
        </div>

        {/* List */}
        {loading ? (
          <div className="text-center py-16 text-slate-500 text-sm">Loading inquiries…</div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-16 text-slate-500 text-sm">
            {tab === "active" ? "No active inquiries. Click \"+ New Inquiry\" to submit one." : `No ${tab} inquiries.`}
          </div>
        ) : (
          <div className="space-y-3">
            {filtered.map((inquiry) => {
              const st = fmtInquiryStatus(inquiry.status);
              const quotation = quotationMap[inquiry.id];
              const isExpanded = expandedId === inquiry.id;

              return (
                <div
                  key={inquiry.id}
                  className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden"
                >
                  {/* Header row */}
                  <button
                    onClick={() => setExpandedId(isExpanded ? null : inquiry.id)}
                    className="w-full flex items-center justify-between px-5 py-4 hover:bg-slate-800/40 transition-colors text-left"
                  >
                    <div className="flex items-center gap-4 min-w-0">
                      <span className="text-xs font-mono text-slate-400 shrink-0">{inquiry.inquiry_reference}</span>
                      <span className="text-sm font-medium text-slate-200 truncate">{inquiry.service_type}</span>
                      {inquiry.route && (
                        <span className="hidden sm:inline text-xs text-slate-500 truncate">{inquiry.route}</span>
                      )}
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${st.cls}`}>{st.label}</span>
                      {quotation && (
                        <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${fmtQuotationStatus(quotation.status).cls}`}>
                          Quote: {fmtQuotationStatus(quotation.status).label}
                        </span>
                      )}
                      <span className="text-slate-600">{isExpanded ? "▲" : "▼"}</span>
                    </div>
                  </button>

                  {/* Expanded detail */}
                  {isExpanded && (
                    <div className="border-t border-slate-800 px-5 py-4 space-y-4">
                      {/* Inquiry details */}
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                        <div>
                          <span className="text-slate-500">Service</span>
                          <p className="text-slate-200 font-medium mt-0.5">{inquiry.service_type}</p>
                        </div>
                        <div>
                          <span className="text-slate-500">Route</span>
                          <p className="text-slate-200 font-medium mt-0.5">{inquiry.route ?? "—"}</p>
                        </div>
                        <div>
                          <span className="text-slate-500">Target Delivery</span>
                          <p className="text-slate-200 font-medium mt-0.5">{fmtQDate(inquiry.target_delivery_date)}</p>
                        </div>
                        <div>
                          <span className="text-slate-500">Submitted</span>
                          <p className="text-slate-200 font-medium mt-0.5">{fmtQDate(inquiry.created_at)}</p>
                        </div>
                        {inquiry.cargo_description && (
                          <div className="col-span-2 sm:col-span-4">
                            <span className="text-slate-500">Cargo</span>
                            <p className="text-slate-200 mt-0.5">{inquiry.cargo_description}</p>
                          </div>
                        )}
                        {inquiry.estimated_cargo_value != null && (
                          <div>
                            <span className="text-slate-500">Est. Cargo Value</span>
                            <p className="text-slate-200 font-medium mt-0.5">
                              {inquiry.currency} {inquiry.estimated_cargo_value.toLocaleString()}
                            </p>
                          </div>
                        )}
                        {inquiry.special_requirements && (
                          <div className="col-span-2 sm:col-span-4">
                            <span className="text-slate-500">Special Requirements</span>
                            <p className="text-slate-200 mt-0.5">{inquiry.special_requirements}</p>
                          </div>
                        )}
                      </div>

                      {/* Quotation panel */}
                      {quotation && (
                        <div className="bg-slate-800/60 border border-slate-700 rounded-xl p-4 space-y-3">
                          <div className="flex items-center justify-between">
                            <h4 className="text-xs font-semibold text-slate-300 uppercase tracking-wider">Quotation Received</h4>
                            <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${fmtQuotationStatus(quotation.status).cls}`}>
                              {fmtQuotationStatus(quotation.status).label}
                            </span>
                          </div>

                          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                            <div>
                              <span className="text-slate-500">Quotation Ref</span>
                              <p className="text-slate-200 font-medium font-mono mt-0.5">{quotation.quotation_reference}</p>
                            </div>
                            <div>
                              <span className="text-slate-500">Job Value</span>
                              <p className="text-emerald-400 font-bold text-base mt-0.5">{fmtQAmount(quotation.job_value, quotation.currency)}</p>
                            </div>
                            <div>
                              <span className="text-slate-500">Payment Terms</span>
                              <p className="text-slate-200 font-medium mt-0.5">{quotation.payment_terms ?? "—"}</p>
                            </div>
                            <div>
                              <span className="text-slate-500">Valid Until</span>
                              <p className="text-slate-200 font-medium mt-0.5">{fmtQDate(quotation.valid_until)}</p>
                            </div>
                            {quotation.required_deposit != null && (
                              <div>
                                <span className="text-slate-500">Required Deposit</span>
                                <p className="text-slate-200 font-medium mt-0.5">{fmtQAmount(quotation.required_deposit, quotation.currency)}</p>
                              </div>
                            )}
                            {quotation.incoterm && (
                              <div>
                                <span className="text-slate-500">Incoterm</span>
                                <p className="text-slate-200 font-medium mt-0.5">{quotation.incoterm}</p>
                              </div>
                            )}
                            {quotation.estimated_delivery_date && (
                              <div>
                                <span className="text-slate-500">Est. Delivery</span>
                                <p className="text-slate-200 font-medium mt-0.5">{fmtQDate(quotation.estimated_delivery_date)}</p>
                              </div>
                            )}
                            {quotation.special_conditions && (
                              <div className="col-span-2 sm:col-span-4">
                                <span className="text-slate-500">Special Conditions</span>
                                <p className="text-slate-200 mt-0.5">{quotation.special_conditions}</p>
                              </div>
                            )}
                          </div>

                          {/* Provider benchmark — shows reliability for this provider */}
                          {quotation.provider_company_id && (
                            <div className="pt-2 border-t border-slate-700/50">
                              <p className="text-[10px] text-slate-600 mb-2 uppercase tracking-wider font-semibold">Provider Performance</p>
                              <ProviderBenchmarkCard
                                companyId={quotation.provider_company_id}
                                showRecalc={false}
                                compact={false}
                              />
                            </div>
                          )}

                          {/* Accept / Reject — only for Submitted quotations */}
                          {quotation.status === "Submitted" && (
                            <div className="pt-2 flex flex-col gap-3">
                              {rejectingId === quotation.id ? (
                                <div className="space-y-2">
                                  <textarea
                                    rows={2}
                                    placeholder="Reason for rejection…"
                                    value={rejectReason}
                                    onChange={(e) => setRejectReason(e.target.value)}
                                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 placeholder-slate-600 focus:outline-none focus:border-red-500 resize-none"
                                  />
                                  <div className="flex gap-2">
                                    <button
                                      onClick={() => void handleReject(quotation)}
                                      className="px-4 py-2 rounded-lg bg-red-600 hover:bg-red-500 text-white text-sm font-medium transition-colors"
                                    >
                                      Confirm Rejection
                                    </button>
                                    <button
                                      onClick={() => { setRejectingId(null); setRejectReason(""); }}
                                      className="px-3 py-2 rounded-lg border border-slate-700 text-slate-400 hover:text-slate-200 text-sm transition-colors"
                                    >
                                      Cancel
                                    </button>
                                  </div>
                                </div>
                              ) : (
                                <div className="flex gap-3">
                                  <button
                                    onClick={() => void handleAccept(quotation)}
                                    disabled={acceptingId === quotation.id}
                                    className="flex-1 px-4 py-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-sm font-semibold transition-colors"
                                  >
                                    {acceptingId === quotation.id ? "Creating job…" : "✓ Accept Quotation & Create Job"}
                                  </button>
                                  <button
                                    onClick={() => { setRejectingId(quotation.id); setRejectReason(""); }}
                                    className="px-4 py-2.5 rounded-lg border border-red-500/40 text-red-400 hover:bg-red-500/10 text-sm font-medium transition-colors"
                                  >
                                    Reject
                                  </button>
                                </div>
                              )}
                              <p className="text-xs text-slate-600">
                                By accepting, you agree to the quoted terms. A secured job will be created and payment holding will begin.
                              </p>
                            </div>
                          )}

                          {/* Link to converted job */}
                          {quotation.status === "Converted" && quotation.job_reference && (
                            <div className="pt-2">
                              <Link
                                href={`/customer/jobs/${quotation.job_reference}`}
                                className="inline-flex items-center gap-1.5 text-sm text-emerald-400 hover:text-emerald-300 font-medium"
                              >
                                View Job {quotation.job_reference} →
                              </Link>
                            </div>
                          )}
                        </div>
                      )}

                      {/* Actions for active inquiries */}
                      {["Submitted", "Assigned"].includes(inquiry.status) && (
                        <div className="flex gap-3 pt-1">
                          <button
                            onClick={() => void handleCancel(inquiry.id)}
                            className="px-3 py-1.5 rounded-lg border border-slate-700 text-slate-500 hover:text-red-400 hover:border-red-500/40 text-xs transition-colors"
                          >
                            Cancel Inquiry
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
