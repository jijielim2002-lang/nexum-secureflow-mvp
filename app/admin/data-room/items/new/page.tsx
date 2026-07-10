"use client";

// ─── /admin/data-room/items/new ───────────────────────────────────────────────
// Create a new data room item. Supports manual and auto-linked items.

import { useEffect, useState, Suspense } from "react";
import { createClient } from "@supabase/supabase-js";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
);

const CATEGORIES = [
  "Pitch & Strategy",
  "Financial",
  "KPI & Metrics",
  "Capital",
  "Risk & Compliance",
  "Legal",
  "Governance",
  "Product",
  "People",
  "General",
];

const ITEM_TYPES = [
  "document",
  "report",
  "metric",
  "data",
  "legal",
  "financial",
  "other",
];

const SOURCE_TYPES = [
  "manual",
  "board_report",
  "credit_pack",
  "capital_readiness",
  "financing_offer",
  "kpi_target",
  "risk_register",
  "accounting_export",
  "other",
];

// Quick templates covering common investor data room items
const QUICK_TEMPLATES = [
  { name: "Executive Summary / Pitch Deck", category: "Pitch & Strategy", type: "document", description: "Investor-facing narrative of Nexum platform value proposition, market opportunity, and traction." },
  { name: "Financial Model & Projections", category: "Financial", type: "financial", description: "3-year revenue, cost, and growth projections with assumptions." },
  { name: "KPI Targets & Actuals Dashboard", category: "KPI & Metrics", type: "metric", description: "Live strategic KPI targets with actual progress from platform data.", source_type: "kpi_target" },
  { name: "Revenue & Fee Breakdown", category: "Financial", type: "financial", description: "Platform fee structure, nexum service fees collected, and revenue composition." },
  { name: "Capital Readiness Assessment Summary", category: "Capital", type: "report", description: "Aggregated SME capital readiness scores and recommendations.", source_type: "capital_readiness" },
  { name: "Operational Risk Register", category: "Risk & Compliance", type: "report", description: "Summary of identified risks, severity, and mitigation actions.", source_type: "risk_register" },
  { name: "Platform Terms & Legal Framework", category: "Legal", type: "legal", description: "Service agreements, platform terms, and regulatory compliance documentation." },
  { name: "Latest Board Report", category: "Governance", type: "report", description: "Most recent board-level summary of platform operations and strategic progress.", source_type: "board_report" },
  { name: "Product Overview & Roadmap", category: "Product", type: "document", description: "Platform capabilities, current features, and product development roadmap." },
  { name: "Team & Org Structure", category: "People", type: "document", description: "Leadership team bios, org chart, and hiring plan." },
];

function NewItemForm() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [token,   setToken]   = useState<string | null>(null);
  const [role,    setRole]    = useState<string | null>(null);
  const [saving,  setSaving]  = useState(false);
  const [error,   setError]   = useState<string | null>(null);

  // Form fields
  const [itemName,     setItemName]     = useState(searchParams.get("label") ?? "");
  const [itemCategory, setItemCategory] = useState(searchParams.get("category") ?? "General");
  const [itemType,     setItemType]     = useState("document");
  const [itemStatus,   setItemStatus]   = useState("Draft");
  const [sourceType,   setSourceType]   = useState("manual");
  const [sourceId,     setSourceId]     = useState("");
  const [sourceUrl,    setSourceUrl]    = useState("");
  const [description,  setDescription]  = useState("");
  const [notes,        setNotes]        = useState("");
  const [nextReview,   setNextReview]   = useState("");
  const [confidential, setConfidential] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) { setError("Not authenticated"); return; }
      setToken(session.access_token);
      supabase.from("profiles").select("role").eq("id", session.user.id).single()
        .then(({ data: p }) => setRole(p?.role ?? null));
    });
  }, []);

  const applyTemplate = (tpl: typeof QUICK_TEMPLATES[0]) => {
    setItemName(tpl.name);
    setItemCategory(tpl.category);
    setItemType(tpl.type);
    setDescription(tpl.description);
    if (tpl.source_type) setSourceType(tpl.source_type);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) return;
    if (!itemName.trim()) { setError("Item name is required"); return; }

    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/fundraising-data-room", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          item_name:       itemName.trim(),
          item_category:   itemCategory,
          item_type:       itemType,
          item_status:     itemStatus,
          source_type:     sourceType,
          source_id:       sourceId || null,
          source_url:      sourceUrl || null,
          item_description: description || null,
          notes:           notes || null,
          next_review_date: nextReview || null,
          is_confidential: confidential,
        }),
      });
      const json = await res.json();
      if (!res.ok) { setError(json.error ?? "Failed to save"); return; }
      router.push(`/admin/data-room/${json.data.id}`);
    } catch { setError("Network error"); }
    finally { setSaving(false); }
  };

  if (role && role !== "admin") return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center">
      <div className="text-red-400">Access restricted to admin users.</div>
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-950 text-slate-200 p-6">
      <div className="max-w-3xl mx-auto">
        {/* Header */}
        <div className="mb-6">
          <div className="flex items-center gap-2 text-xs text-slate-500 mb-1">
            <Link href="/admin" className="hover:text-slate-300">Admin</Link>
            <span>/</span>
            <Link href="/admin/data-room" className="hover:text-slate-300">Data Room</Link>
            <span>/</span>
            <Link href="/admin/data-room/items" className="hover:text-slate-300">Items</Link>
            <span>/</span>
            <span className="text-slate-300">New</span>
          </div>
          <h1 className="text-2xl font-bold text-slate-100">Add Data Room Item</h1>
        </div>

        {/* Quick Templates */}
        <div className="bg-slate-900 rounded-xl border border-slate-800 p-5 mb-6">
          <h2 className="text-sm font-semibold text-slate-200 mb-3">Quick Templates</h2>
          <p className="text-xs text-slate-500 mb-3">Click to pre-fill the form with a common investor data room item.</p>
          <div className="flex flex-wrap gap-2">
            {QUICK_TEMPLATES.map(tpl => (
              <button
                key={tpl.name}
                type="button"
                onClick={() => applyTemplate(tpl)}
                className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-slate-100 text-xs transition-colors border border-slate-700 hover:border-slate-600"
              >
                {tpl.name}
              </button>
            ))}
          </div>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="bg-slate-900 rounded-xl border border-slate-800 p-5 space-y-5">
          {error && (
            <div className="bg-red-400/10 border border-red-400/30 rounded-lg p-3 text-sm text-red-300">
              {error}
            </div>
          )}

          {/* Item Name */}
          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1.5">Item Name <span className="text-red-400">*</span></label>
            <input
              type="text"
              value={itemName}
              onChange={e => setItemName(e.target.value)}
              placeholder="e.g. Q2 2026 Board Report, Financial Model v3"
              required
              className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-slate-200 placeholder-slate-500 text-sm focus:outline-none focus:border-indigo-500"
            />
          </div>

          {/* Category & Type */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1.5">Category</label>
              <select
                value={itemCategory}
                onChange={e => setItemCategory(e.target.value)}
                className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-slate-200 text-sm focus:outline-none focus:border-indigo-500"
              >
                {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1.5">Item Type</label>
              <select
                value={itemType}
                onChange={e => setItemType(e.target.value)}
                className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-slate-200 text-sm focus:outline-none focus:border-indigo-500"
              >
                {ITEM_TYPES.map(t => <option key={t} value={t} className="capitalize">{t}</option>)}
              </select>
            </div>
          </div>

          {/* Status */}
          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1.5">Status</label>
            <div className="flex gap-2">
              {["Draft","Ready","Needs Update"].map(s => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setItemStatus(s)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                    itemStatus === s
                      ? s === "Ready" ? "bg-emerald-500/20 text-emerald-400 border-emerald-500/40"
                        : s === "Draft" ? "bg-yellow-500/20 text-yellow-400 border-yellow-500/40"
                        : "bg-orange-500/20 text-orange-400 border-orange-500/40"
                      : "bg-slate-800 text-slate-400 border-slate-700 hover:border-slate-600"
                  }`}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>

          {/* Source */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1.5">Source Type</label>
              <select
                value={sourceType}
                onChange={e => setSourceType(e.target.value)}
                className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-slate-200 text-sm focus:outline-none focus:border-indigo-500"
              >
                {SOURCE_TYPES.map(t => (
                  <option key={t} value={t}>{t.replace(/_/g, " ")}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1.5">Source ID (optional)</label>
              <input
                type="text"
                value={sourceId}
                onChange={e => setSourceId(e.target.value)}
                placeholder="UUID of linked record"
                className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-slate-200 placeholder-slate-500 text-sm focus:outline-none focus:border-indigo-500"
              />
            </div>
          </div>

          {/* Source URL */}
          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1.5">Source / Reference URL (optional)</label>
            <input
              type="text"
              value={sourceUrl}
              onChange={e => setSourceUrl(e.target.value)}
              placeholder="Internal page path or external reference"
              className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-slate-200 placeholder-slate-500 text-sm focus:outline-none focus:border-indigo-500"
            />
          </div>

          {/* Description */}
          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1.5">Description</label>
            <textarea
              value={description}
              onChange={e => setDescription(e.target.value)}
              rows={3}
              placeholder="What does this item contain? What investor question does it answer?"
              className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-slate-200 placeholder-slate-500 text-sm focus:outline-none focus:border-indigo-500 resize-none"
            />
          </div>

          {/* Notes */}
          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1.5">Internal Notes</label>
            <textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              rows={2}
              placeholder="Admin-only notes (not shown to investors)"
              className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-slate-200 placeholder-slate-500 text-sm focus:outline-none focus:border-indigo-500 resize-none"
            />
          </div>

          {/* Next Review Date */}
          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1.5">Next Review Date</label>
            <input
              type="date"
              value={nextReview}
              onChange={e => setNextReview(e.target.value)}
              className="px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-slate-200 text-sm focus:outline-none focus:border-indigo-500"
            />
          </div>

          {/* Confidential */}
          <div>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={confidential}
                onChange={e => setConfidential(e.target.checked)}
                className="rounded"
              />
              <span className="text-sm text-slate-300">Mark as Confidential</span>
              <span className="text-xs text-slate-500">(flagged with 🔒 in data room)</span>
            </label>
          </div>

          {/* Submit */}
          <div className="flex items-center gap-3 pt-2">
            <button
              type="submit"
              disabled={saving || !token}
              className="px-6 py-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-medium transition-colors disabled:opacity-50"
            >
              {saving ? "Saving…" : "Add to Data Room"}
            </button>
            <Link
              href="/admin/data-room"
              className="px-6 py-2.5 rounded-lg bg-slate-700 hover:bg-slate-600 text-slate-200 text-sm font-medium transition-colors"
            >
              Cancel
            </Link>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function NewItemPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <div className="text-slate-400 animate-pulse">Loading…</div>
      </div>
    }>
      <NewItemForm />
    </Suspense>
  );
}
