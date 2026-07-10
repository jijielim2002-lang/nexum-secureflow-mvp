"use client";

// ─── Admin Inquiries — manage service inquiry pipeline ────────────────────────

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";
import { useAuth } from "@/contexts/AuthContext";
import { LogoutButton } from "@/components/LogoutButton";
import { NotificationBell } from "@/components/NotificationBell";
import {
  fmtInquiryStatus,
  fmtQuotationStatus,
  fmtQDate,
  fmtQAmount,
  type InquiryRow,
  type QuotationRow,
} from "@/lib/quotation";

// ── Types ─────────────────────────────────────────────────────────────────────

type Tab = "all" | "pending" | "quoted" | "converted";

interface CompanyOption {
  id:           string;
  name:         string;
  company_type: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

async function getToken(): Promise<string | null> {
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? null;
}

function authHeader(token: string) {
  return { Authorization: `Bearer ${token}` };
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function AdminInquiriesPage() {
  const { profile } = useAuth();

  const [tab, setTab] = useState<Tab>("all");
  const [inquiries, setInquiries] = useState<InquiryRow[]>([]);
  const [quotationMap, setQuotationMap] = useState<Record<string, QuotationRow[]>>({});
  const [companies, setCompanies] = useState<CompanyOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // Assign provider modal state
  const [assigningId, setAssigningId] = useState<string | null>(null);
  const [selectedProvider, setSelectedProvider] = useState("");
  const [adminNotes, setAdminNotes] = useState("");
  const [assigning, setAssigning] = useState(false);
  const [assignError, setAssignError] = useState<string | null>(null);

  // ── Load ───────────────────────────────────────────────────────────────────

  const load = useCallback(async () => {
    setLoading(true);
    const token = await getToken();
    if (!token) { setLoading(false); return; }

    const [iRes, qRes, { data: coData }] = await Promise.all([
      fetch("/api/inquiries", { headers: authHeader(token) }),
      fetch("/api/quotations", { headers: authHeader(token) }),
      supabase.from("companies").select("id, name, company_type").order("name"),
    ]);

    if (iRes.ok) {
      const { data } = (await iRes.json()) as { data: InquiryRow[] };
      setInquiries(data ?? []);
    }
    if (qRes.ok) {
      const { data } = (await qRes.json()) as { data: QuotationRow[] };
      const map: Record<string, QuotationRow[]> = {};
      for (const q of data ?? []) {
        if (q.inquiry_id) {
          map[q.inquiry_id] = [...(map[q.inquiry_id] ?? []), q];
        }
      }
      setQuotationMap(map);
    }
    setCompanies((coData ?? []) as CompanyOption[]);
    setLoading(false);
  }, []);

  useEffect(() => { void load(); }, [load]);

  // ── Filtered lists ─────────────────────────────────────────────────────────

  const filtered = inquiries.filter((i) => {
    if (tab === "pending")   return ["Submitted", "Assigned"].includes(i.status);
    if (tab === "quoted")    return i.status === "Quoted";
    if (tab === "converted") return i.status === "Converted";
    return true;
  });

  const providerCompanies = companies.filter((c) =>
    c.company_type === "service_provider" || c.company_type === "Service Provider",
  );

  const tabCounts = {
    all:       inquiries.length,
    pending:   inquiries.filter((i) => ["Submitted", "Assigned"].includes(i.status)).length,
    quoted:    inquiries.filter((i) => i.status === "Quoted").length,
    converted: inquiries.filter((i) => i.status === "Converted").length,
  };

  // ── Assign provider ────────────────────────────────────────────────────────

  async function handleAssign(inquiryId: string) {
    if (!selectedProvider) { setAssignError("Please select a provider."); return; }
    setAssignError(null);
    setAssigning(true);

    const token = await getToken();
    if (!token) { setAssigning(false); return; }

    const res = await fetch(`/api/inquiries/${inquiryId}`, {
      method:  "PATCH",
      headers: { ...authHeader(token), "Content-Type": "application/json" },
      body:    JSON.stringify({
        action:              "assign-provider",
        provider_company_id: selectedProvider,
        admin_notes:         adminNotes || undefined,
      }),
    });

    setAssigning(false);

    if (!res.ok) {
      const { error } = (await res.json()) as { error: string };
      setAssignError(error);
      return;
    }

    setAssigningId(null);
    setSelectedProvider("");
    setAdminNotes("");
    await load();
  }

  // ── Cancel inquiry ─────────────────────────────────────────────────────────

  async function handleCancel(inquiryId: string) {
    if (!confirm("Cancel this inquiry?")) return;
    const token = await getToken();
    if (!token) return;
    await fetch(`/api/inquiries/${inquiryId}`, {
      method:  "PATCH",
      headers: { ...authHeader(token), "Content-Type": "application/json" },
      body:    JSON.stringify({ action: "cancel" }),
    });
    await load();
  }

  // ── Company name lookup ────────────────────────────────────────────────────

  function companyName(id: string | null): string {
    if (!id) return "—";
    return companies.find((c) => c.id === id)?.name ?? id.slice(0, 8) + "…";
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-slate-950 text-slate-200">
      {/* Nav */}
      <nav className="border-b border-slate-800 bg-slate-900/60 backdrop-blur px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link href="/admin" className="text-slate-400 hover:text-slate-200 text-sm">← Admin</Link>
          <span className="text-slate-700">|</span>
          <h1 className="text-sm font-semibold text-slate-100">Service Inquiries</h1>
        </div>
        <div className="flex items-center gap-3">
          <NotificationBell />
          <span className="text-xs text-slate-500">{profile?.full_name}</span>
          <LogoutButton />
        </div>
      </nav>

      <div className="max-w-7xl mx-auto px-6 py-8 space-y-6">

        {/* Header */}
        <div>
          <h2 className="text-xl font-bold text-slate-100">Service Inquiries</h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Review customer service inquiries, assign providers, and track the pipeline to secured job creation.
          </p>
        </div>

        {/* Summary cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {[
            { label: "Pending Assignment", value: inquiries.filter((i) => i.status === "Submitted").length, cls: "text-amber-400" },
            { label: "Assigned",           value: inquiries.filter((i) => i.status === "Assigned").length,  cls: "text-blue-400" },
            { label: "Quoted",             value: inquiries.filter((i) => i.status === "Quoted").length,    cls: "text-purple-400" },
            { label: "Converted to Job",   value: inquiries.filter((i) => i.status === "Converted").length, cls: "text-emerald-400" },
          ].map((card) => (
            <div key={card.label} className="bg-slate-900 border border-slate-800 rounded-xl p-4 text-center">
              <p className={`text-2xl font-bold ${card.cls}`}>{card.value}</p>
              <p className="text-xs text-slate-500 mt-1">{card.label}</p>
            </div>
          ))}
        </div>

        {/* Tabs */}
        <div className="flex gap-1 border-b border-slate-800">
          {([
            { key: "all" as Tab,       label: "All" },
            { key: "pending" as Tab,   label: "Pending / Assigned" },
            { key: "quoted" as Tab,    label: "Quoted" },
            { key: "converted" as Tab, label: "Converted" },
          ]).map(({ key, label }) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px ${
                tab === key
                  ? "border-blue-500 text-blue-400"
                  : "border-transparent text-slate-500 hover:text-slate-300"
              }`}
            >
              {label}
              {tabCounts[key] > 0 && (
                <span className={`ml-1.5 text-xs px-1.5 py-0.5 rounded-full ${
                  tab === key ? "bg-blue-500/20 text-blue-400" : "bg-slate-800 text-slate-500"
                }`}>{tabCounts[key]}</span>
              )}
            </button>
          ))}
        </div>

        {/* Table */}
        {loading ? (
          <div className="text-center py-16 text-slate-500 text-sm">Loading inquiries…</div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-16 text-slate-500 text-sm">No inquiries in this category.</div>
        ) : (
          <div className="space-y-3">
            {filtered.map((inquiry) => {
              const st = fmtInquiryStatus(inquiry.status);
              const isExpanded = expandedId === inquiry.id;
              const isAssigning = assigningId === inquiry.id;
              const inqQuotations = quotationMap[inquiry.id] ?? [];

              return (
                <div key={inquiry.id} className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
                  {/* Row header */}
                  <div className="px-5 py-4 flex items-center gap-4">
                    <button
                      onClick={() => setExpandedId(isExpanded ? null : inquiry.id)}
                      className="flex-1 flex items-center gap-4 min-w-0 text-left"
                    >
                      <span className="text-xs font-mono text-slate-400 shrink-0">{inquiry.inquiry_reference}</span>
                      <span className="text-sm font-medium text-slate-200 truncate">{inquiry.service_type}</span>
                      <span className="hidden md:inline text-xs text-slate-500 truncate">
                        {companyName(inquiry.customer_company_id)}
                      </span>
                      {inquiry.route && (
                        <span className="hidden lg:inline text-xs text-slate-600 truncate">{inquiry.route}</span>
                      )}
                    </button>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${st.cls}`}>{st.label}</span>
                      {inquiry.status === "Submitted" && (
                        <button
                          onClick={() => {
                            setAssigningId(isAssigning ? null : inquiry.id);
                            setSelectedProvider("");
                            setAdminNotes("");
                            setAssignError(null);
                          }}
                          className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                            isAssigning
                              ? "border border-slate-700 text-slate-400"
                              : "bg-amber-600 hover:bg-amber-500 text-white"
                          }`}
                        >
                          {isAssigning ? "Cancel" : "Assign Provider"}
                        </button>
                      )}
                      {inquiry.status === "Assigned" && (
                        <button
                          onClick={() => {
                            setAssigningId(isAssigning ? null : inquiry.id);
                            setSelectedProvider(inquiry.assigned_provider_company_id ?? "");
                            setAdminNotes(inquiry.admin_notes ?? "");
                            setAssignError(null);
                          }}
                          className="px-3 py-1.5 rounded-lg text-xs font-medium border border-slate-700 text-slate-400 hover:text-slate-200 transition-colors"
                        >
                          {isAssigning ? "Cancel" : "Reassign"}
                        </button>
                      )}
                      {!["Converted", "Cancelled"].includes(inquiry.status) && (
                        <button
                          onClick={() => void handleCancel(inquiry.id)}
                          className="px-2 py-1.5 rounded-lg text-xs text-slate-600 hover:text-red-400 transition-colors"
                          title="Cancel inquiry"
                        >
                          ✕
                        </button>
                      )}
                      <span className="text-slate-600 text-xs">{isExpanded ? "▲" : "▼"}</span>
                    </div>
                  </div>

                  {/* Assign provider panel */}
                  {isAssigning && (
                    <div className="border-t border-slate-800 bg-slate-800/30 px-5 py-4 space-y-3">
                      <h4 className="text-xs font-semibold text-slate-300">Assign Service Provider</h4>
                      {assignError && (
                        <p className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded px-3 py-2">{assignError}</p>
                      )}
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                          <label className="block text-xs text-slate-400 mb-1">Provider Company <span className="text-red-400">*</span></label>
                          <select
                            value={selectedProvider}
                            onChange={(e) => setSelectedProvider(e.target.value)}
                            className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-amber-500"
                          >
                            <option value="">Select provider…</option>
                            {providerCompanies.map((c) => (
                              <option key={c.id} value={c.id}>{c.name}</option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <label className="block text-xs text-slate-400 mb-1">Admin Notes</label>
                          <input
                            type="text"
                            placeholder="Optional notes for the provider…"
                            value={adminNotes}
                            onChange={(e) => setAdminNotes(e.target.value)}
                            className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 placeholder-slate-600 focus:outline-none focus:border-amber-500"
                          />
                        </div>
                      </div>
                      <button
                        onClick={() => void handleAssign(inquiry.id)}
                        disabled={assigning}
                        className="px-5 py-2 rounded-lg bg-amber-600 hover:bg-amber-500 disabled:opacity-50 text-white text-sm font-medium transition-colors"
                      >
                        {assigning ? "Assigning…" : "Assign & Notify Provider"}
                      </button>
                    </div>
                  )}

                  {/* Expanded detail */}
                  {isExpanded && (
                    <div className="border-t border-slate-800 px-5 py-4 space-y-4">
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                        <div>
                          <span className="text-slate-500">Customer</span>
                          <p className="text-slate-200 font-medium mt-0.5">{companyName(inquiry.customer_company_id)}</p>
                        </div>
                        <div>
                          <span className="text-slate-500">Assigned Provider</span>
                          <p className="text-slate-200 font-medium mt-0.5">{companyName(inquiry.assigned_provider_company_id)}</p>
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
                        <div>
                          <span className="text-slate-500">Incoterm Pref.</span>
                          <p className="text-slate-200 font-medium mt-0.5">{inquiry.incoterm_preference ?? "—"}</p>
                        </div>
                        {inquiry.estimated_cargo_value != null && (
                          <div>
                            <span className="text-slate-500">Est. Cargo Value</span>
                            <p className="text-slate-200 font-medium mt-0.5">
                              {inquiry.currency} {inquiry.estimated_cargo_value.toLocaleString()}
                            </p>
                          </div>
                        )}
                        {inquiry.cargo_description && (
                          <div className="col-span-2 sm:col-span-4">
                            <span className="text-slate-500">Cargo</span>
                            <p className="text-slate-200 mt-0.5">{inquiry.cargo_description}</p>
                          </div>
                        )}
                        {inquiry.special_requirements && (
                          <div className="col-span-2 sm:col-span-4">
                            <span className="text-slate-500">Special Requirements</span>
                            <p className="text-slate-200 mt-0.5">{inquiry.special_requirements}</p>
                          </div>
                        )}
                        {inquiry.admin_notes && (
                          <div className="col-span-2 sm:col-span-4">
                            <span className="text-slate-500">Admin Notes</span>
                            <p className="text-amber-300 mt-0.5">{inquiry.admin_notes}</p>
                          </div>
                        )}
                      </div>

                      {/* Quotations */}
                      {inqQuotations.length > 0 && (
                        <div className="space-y-2">
                          <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Quotations ({inqQuotations.length})</h4>
                          {inqQuotations.map((q) => (
                            <div key={q.id} className="bg-slate-800/50 border border-slate-700 rounded-lg px-4 py-3">
                              <div className="flex items-center justify-between mb-2">
                                <span className="text-xs font-mono text-slate-400">{q.quotation_reference}</span>
                                <div className="flex items-center gap-2">
                                  <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${fmtQuotationStatus(q.status).cls}`}>
                                    {fmtQuotationStatus(q.status).label}
                                  </span>
                                  {q.status === "Converted" && q.job_reference && (
                                    <Link href={`/admin/jobs/${q.job_reference}`} className="text-xs text-emerald-400 hover:text-emerald-300">
                                      Job {q.job_reference} →
                                    </Link>
                                  )}
                                </div>
                              </div>
                              <div className="grid grid-cols-3 sm:grid-cols-5 gap-2 text-xs">
                                <div>
                                  <span className="text-slate-500">Value</span>
                                  <p className="text-emerald-400 font-bold mt-0.5">{fmtQAmount(q.job_value, q.currency)}</p>
                                </div>
                                <div>
                                  <span className="text-slate-500">Payment Terms</span>
                                  <p className="text-slate-300 font-medium mt-0.5">{q.payment_terms ?? "—"}</p>
                                </div>
                                <div>
                                  <span className="text-slate-500">Valid Until</span>
                                  <p className="text-slate-300 font-medium mt-0.5">{fmtQDate(q.valid_until)}</p>
                                </div>
                                {q.incoterm && (
                                  <div>
                                    <span className="text-slate-500">Incoterm</span>
                                    <p className="text-slate-300 font-medium mt-0.5">{q.incoterm}</p>
                                  </div>
                                )}
                                {q.rejection_reason && (
                                  <div className="col-span-3 sm:col-span-5">
                                    <span className="text-slate-500">Rejection Reason</span>
                                    <p className="text-red-400 mt-0.5">{q.rejection_reason}</p>
                                  </div>
                                )}
                              </div>
                            </div>
                          ))}
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
