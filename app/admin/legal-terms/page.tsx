"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";
import { useAuth } from "@/contexts/AuthContext";

// ─── Types ────────────────────────────────────────────────────────────────────

interface LegalTemplate {
  id:                 string;
  template_reference: string;
  template_type:      string;
  template_title:     string;
  version_number:     string;
  language:           string;
  status:             string;
  effective_date:     string | null;
  content:            string;
  created_at:         string;
  updated_at:         string;
}

interface Acceptance {
  id:                 string;
  template_reference: string | null;
  template_type:      string | null;
  version_number:     string | null;
  user_email:         string | null;
  user_name:          string | null;
  job_reference:      string | null;
  acceptance_status:  string;
  accepted_at:        string;
  acceptance_method:  string | null;
  company:            { company_name: string } | null;
  template:           { template_title: string; version_number: string } | null;
}

type Tab = "templates" | "acceptances";

// ─── Helpers ──────────────────────────────────────────────────────────────────

const STATUS_BADGE: Record<string, string> = {
  Draft:    "bg-slate-700/50 text-slate-400 border-slate-600/40",
  Active:   "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
  Archived: "bg-slate-600/30 text-slate-500 border-slate-600/20",
};

const ACC_BADGE: Record<string, string> = {
  Accepted:   "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
  Rejected:   "bg-red-500/15 text-red-400 border-red-500/30",
  Withdrawn:  "bg-amber-500/15 text-amber-400 border-amber-500/30",
  Superseded: "bg-slate-600/30 text-slate-500 border-slate-600/20",
};

const TYPE_REQUIRED: string[] = [
  "Customer Pilot Terms",
  "Provider Pilot Terms",
  "Payment Holding Terms",
  "Release Terms",
  "Dispute Terms",
];

const ALL_TYPES = [
  "Customer Pilot Terms",
  "Provider Pilot Terms",
  "Payment Holding Terms",
  "Release Terms",
  "Dispute Terms",
  "Privacy Notice",
  "General Platform Terms",
  "Other",
];

function fmtTime(iso: string) {
  return new Date(iso).toLocaleString("en-MY", { dateStyle: "medium", timeStyle: "short" });
}

function exportAccCSV(accs: Acceptance[]) {
  const rows = [
    ["Template Ref","Type","Version","User Email","User Name","Company","Job","Status","Method","Accepted At"].join(","),
    ...accs.map((a) => [
      `"${a.template_reference ?? ""}"`,
      `"${a.template_type ?? ""}"`,
      a.version_number ?? "",
      `"${a.user_email ?? ""}"`,
      `"${a.user_name ?? ""}"`,
      `"${a.company?.company_name ?? ""}"`,
      a.job_reference ?? "",
      a.acceptance_status,
      `"${a.acceptance_method ?? ""}"`,
      new Date(a.accepted_at).toISOString(),
    ].join(",")),
  ];
  const blob = new Blob([rows.join("\n")], { type: "text/csv" });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement("a");
  a.href     = url;
  a.download = `legal-acceptances-${new Date().toISOString().slice(0,10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

// ─── Edit/Create modal ────────────────────────────────────────────────────────

interface EditState {
  mode:           "create" | "edit";
  tmpl?:          LegalTemplate;
  template_type:  string;
  template_title: string;
  version_number: string;
  content:        string;
  effective_date: string;
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function LegalTermsPage() {
  const { profile } = useAuth();

  async function getToken() {
    const { data: { session } } = await supabase.auth.getSession();
    return session?.access_token ?? "";
  }

  const [tab,        setTab]        = useState<Tab>("templates");
  const [templates,  setTemplates]  = useState<LegalTemplate[]>([]);
  const [accs,       setAccs]       = useState<Acceptance[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [error,      setError]      = useState<string | null>(null);

  // Acceptances filters
  const [accSearch,      setAccSearch]      = useState("");
  const [accTypeFilter,  setAccTypeFilter]  = useState("All");
  const [accStatusFilter,setAccStatusFilter]= useState("All");

  // Template viewer
  const [viewing, setViewing] = useState<LegalTemplate | null>(null);

  // Edit/create modal
  const [editState, setEditState] = useState<EditState | null>(null);
  const [saving,    setSaving]    = useState(false);
  const [saveErr,   setSaveErr]   = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!profile) return;
    setLoading(true);
    setError(null);
    const token = await getToken();

    const [tmplRes, accRes] = await Promise.all([
      fetch("/api/legal-terms?all=true", { headers: { Authorization: `Bearer ${token}` } }),
      fetch("/api/legal-terms/acceptances", { headers: { Authorization: `Bearer ${token}` } }),
    ]);

    const tmplJson = await tmplRes.json();
    const accJson  = await accRes.json();

    if (!tmplRes.ok) { setError(tmplJson.error ?? "Failed to load templates"); setLoading(false); return; }
    setTemplates(tmplJson.templates ?? []);
    setAccs(accJson.acceptances ?? []);
    setLoading(false);
  }, [profile]);

  useEffect(() => { load(); }, [load]);

  // ── Template actions ──────────────────────────────────────────────────────

  async function templateAction(id: string, action: "activate" | "archive") {
    const token = await getToken();
    const res = await fetch("/api/legal-terms", {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ id, action }),
    });
    const json = await res.json();
    if (res.ok) {
      setTemplates((prev) => prev.map((t) => t.id === id ? { ...t, ...json.template } : t));
    }
  }

  async function submitEdit() {
    if (!editState) return;
    setSaving(true);
    setSaveErr(null);
    const token = await getToken();

    let res: Response;
    if (editState.mode === "create") {
      res = await fetch("/api/legal-terms", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          template_type:  editState.template_type,
          template_title: editState.template_title,
          version_number: editState.version_number,
          content:        editState.content,
          effective_date: editState.effective_date || undefined,
        }),
      });
    } else {
      res = await fetch("/api/legal-terms", {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          id:             editState.tmpl!.id,
          action:         "edit",
          template_title: editState.template_title,
          version_number: editState.version_number,
          content:        editState.content,
          effective_date: editState.effective_date || undefined,
        }),
      });
    }

    const json = await res.json();
    if (!res.ok) { setSaveErr(json.error ?? "Save failed"); setSaving(false); return; }

    if (editState.mode === "create") {
      setTemplates((prev) => [...prev, json.template]);
    } else {
      setTemplates((prev) => prev.map((t) => t.id === editState.tmpl!.id ? { ...t, ...json.template } : t));
    }
    setEditState(null);
    setSaving(false);
  }

  // ── Derived ───────────────────────────────────────────────────────────────

  const activeTemplates  = templates.filter((t) => t.status === "Active");
  const requiredCovered  = TYPE_REQUIRED.filter((type) => activeTemplates.some((t) => t.template_type === type));
  const allRequiredReady = requiredCovered.length === TYPE_REQUIRED.length;

  const filteredAccs = accs.filter((a) => {
    if (accStatusFilter !== "All" && a.acceptance_status !== accStatusFilter) return false;
    if (accTypeFilter   !== "All" && a.template_type     !== accTypeFilter)   return false;
    if (accSearch) {
      const q = accSearch.toLowerCase();
      if (!(a.user_email ?? "").toLowerCase().includes(q) &&
          !(a.job_reference ?? "").toLowerCase().includes(q) &&
          !(a.company?.company_name ?? "").toLowerCase().includes(q)) return false;
    }
    return true;
  });

  return (
    <div className="min-h-screen bg-[#0a0f1e] text-white">
      <div className="max-w-screen-2xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">

        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Link href="/admin" className="text-slate-500 hover:text-slate-300 text-sm transition-colors">Admin</Link>
              <span className="text-slate-600">/</span>
              <span className="text-slate-300 text-sm">Legal Terms</span>
            </div>
            <h1 className="text-2xl font-bold text-white">Pilot Terms & Legal Acceptance</h1>
            <p className="text-slate-400 text-sm mt-1">
              Manage pilot terms templates and view user acceptance records.
            </p>
          </div>
          <div className="flex gap-2">
            {tab === "acceptances" && (
              <button onClick={() => exportAccCSV(filteredAccs)}
                className="px-4 py-2 bg-slate-700/60 hover:bg-slate-700 border border-slate-600/50 text-slate-300 text-sm rounded-xl transition-colors">
                Export CSV
              </button>
            )}
            {tab === "templates" && (
              <button
                onClick={() => setEditState({
                  mode: "create", template_type: "Customer Pilot Terms",
                  template_title: "", version_number: "1.0", content: "", effective_date: "",
                })}
                className="px-4 py-2 bg-teal-600/80 hover:bg-teal-600 text-white text-sm rounded-xl transition-colors"
              >
                + New Template
              </button>
            )}
            <button onClick={load} disabled={loading}
              className="px-4 py-2 bg-slate-700/60 hover:bg-slate-700 border border-slate-600/50 text-slate-300 text-sm rounded-xl transition-colors disabled:opacity-50">
              {loading ? "Loading…" : "Refresh"}
            </button>
          </div>
        </div>

        {/* Required templates status */}
        <div className={`border rounded-xl px-5 py-4 ${allRequiredReady ? "bg-emerald-500/5 border-emerald-500/20" : "bg-amber-500/10 border-amber-500/30"}`}>
          <p className={`text-sm font-medium mb-2 ${allRequiredReady ? "text-emerald-400" : "text-amber-400"}`}>
            Required Templates: {requiredCovered.length}/{TYPE_REQUIRED.length} Active
            {allRequiredReady ? " ✓ — All pilot terms are Active" : " — Some required templates are missing or not Active"}
          </p>
          <div className="flex flex-wrap gap-2">
            {TYPE_REQUIRED.map((type) => {
              const covered = activeTemplates.some((t) => t.template_type === type);
              return (
                <span key={type} className={`text-xs px-2 py-0.5 rounded-md border ${covered ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" : "bg-red-500/10 text-red-400 border-red-500/30"}`}>
                  {covered ? "✓" : "✕"} {type}
                </span>
              );
            })}
          </div>
          {!allRequiredReady && (
            <p className="text-xs text-amber-400/70 mt-2">Run 005_legal_terms.sql or activate Draft templates to cover all required types.</p>
          )}
        </div>

        {/* Pilot wording guard */}
        <div className="bg-red-500/5 border border-red-500/20 rounded-xl px-5 py-3 text-xs space-y-1">
          <p className="text-red-400/90 font-medium">Compliance Wording Guard — Forbidden Terms</p>
          <div className="flex flex-wrap gap-3 text-red-400/60">
            {["escrow","guaranteed payment","auto release guaranteed","bank-like custody","trust account"].map((w) => (
              <span key={w} className="line-through">{w}</span>
            ))}
          </div>
          <div className="flex flex-wrap gap-3 text-emerald-400/70 pt-1">
            <span className="text-slate-600">Use instead:</span>
            {["designated payment holding workflow","payment secured subject to verification","controlled release workflow","manual reconciliation","settlement record","pilot terms"].map((w) => (
              <span key={w}>"{w}"</span>
            ))}
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 bg-slate-800/40 border border-slate-700/40 rounded-xl p-1 w-fit">
          {(["templates","acceptances"] as Tab[]).map((t) => (
            <button key={t} onClick={() => setTab(t)}
              className={`px-4 py-1.5 text-sm rounded-lg capitalize transition-colors ${tab === t ? "bg-slate-700 text-white" : "text-slate-500 hover:text-slate-300"}`}>
              {t}
              {t === "templates"   && <span className="ml-2 text-xs text-slate-500">{templates.length}</span>}
              {t === "acceptances" && <span className="ml-2 text-xs text-slate-500">{accs.length}</span>}
            </button>
          ))}
        </div>

        {error && (
          <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-4 text-red-400 text-sm">{error}</div>
        )}

        {/* ── Templates tab ─────────────────────────────────────────────────── */}
        {tab === "templates" && !loading && (
          <div className="space-y-3">
            {templates.length === 0 && (
              <div className="bg-slate-800/60 border border-slate-700/60 rounded-2xl p-8 text-center text-slate-600">
                No templates found. Run 005_legal_terms.sql to seed the pilot templates.
              </div>
            )}
            {templates.map((tmpl) => (
              <div key={tmpl.id} className="bg-slate-800/60 border border-slate-700/60 rounded-2xl p-5">
                <div className="flex items-start gap-4">
                  <div className="flex-1 min-w-0 space-y-1">
                    <div className="flex items-center flex-wrap gap-2">
                      <span className="text-sm font-medium text-white">{tmpl.template_title}</span>
                      <span className={`text-xs px-2 py-0.5 rounded-md border ${STATUS_BADGE[tmpl.status] ?? ""}`}>
                        {tmpl.status}
                      </span>
                      {TYPE_REQUIRED.includes(tmpl.template_type) && (
                        <span className="text-xs text-amber-400 border border-amber-500/20 px-1.5 py-0.5 rounded-md">Required</span>
                      )}
                    </div>
                    <div className="flex flex-wrap gap-4 text-xs text-slate-500">
                      <span className="font-mono text-teal-400/70">{tmpl.template_reference}</span>
                      <span>Type: {tmpl.template_type}</span>
                      <span>v{tmpl.version_number}</span>
                      <span>{tmpl.language}</span>
                      {tmpl.effective_date && <span>Effective: {tmpl.effective_date}</span>}
                    </div>
                  </div>
                  <div className="flex gap-2 shrink-0">
                    <button onClick={() => setViewing(tmpl)}
                      className="px-3 py-1.5 bg-slate-700/60 hover:bg-slate-700 border border-slate-600/40 text-slate-300 text-xs rounded-lg">
                      View
                    </button>
                    <button
                      onClick={() => setEditState({
                        mode: "edit", tmpl,
                        template_type:  tmpl.template_type,
                        template_title: tmpl.template_title,
                        version_number: tmpl.version_number,
                        content:        tmpl.content,
                        effective_date: tmpl.effective_date ?? "",
                      })}
                      className="px-3 py-1.5 bg-slate-700/60 hover:bg-slate-700 border border-slate-600/40 text-slate-300 text-xs rounded-lg">
                      Edit
                    </button>
                    {tmpl.status === "Draft" && (
                      <button onClick={() => templateAction(tmpl.id, "activate")}
                        className="px-3 py-1.5 bg-emerald-600/20 hover:bg-emerald-600/30 border border-emerald-500/30 text-emerald-400 text-xs rounded-lg">
                        Activate
                      </button>
                    )}
                    {tmpl.status === "Active" && (
                      <button onClick={() => templateAction(tmpl.id, "archive")}
                        className="px-3 py-1.5 bg-slate-700/40 hover:bg-slate-700 border border-slate-600/30 text-slate-500 text-xs rounded-lg">
                        Archive
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* ── Acceptances tab ───────────────────────────────────────────────── */}
        {tab === "acceptances" && !loading && (
          <div className="space-y-4">
            {/* Filters */}
            <div className="flex flex-wrap gap-3">
              <input type="text" placeholder="Search email, job, company…"
                value={accSearch} onChange={(e) => setAccSearch(e.target.value)}
                className="bg-slate-800/60 border border-slate-700/50 text-slate-300 text-sm rounded-xl px-3 py-2 w-64 focus:outline-none focus:border-teal-500/40" />
              <select value={accTypeFilter} onChange={(e) => setAccTypeFilter(e.target.value)}
                className="bg-slate-800/60 border border-slate-700/50 text-slate-300 text-sm rounded-xl px-3 py-2 focus:outline-none">
                <option value="All">All Types</option>
                {ALL_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
              <select value={accStatusFilter} onChange={(e) => setAccStatusFilter(e.target.value)}
                className="bg-slate-800/60 border border-slate-700/50 text-slate-300 text-sm rounded-xl px-3 py-2 focus:outline-none">
                <option value="All">All Statuses</option>
                {["Accepted","Rejected","Withdrawn","Superseded"].map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>

            {/* Acceptances table */}
            <div className="bg-slate-800/60 border border-slate-700/60 rounded-2xl overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-slate-500 border-b border-slate-700/40 bg-slate-800/40">
                      {["Template","Version","User","Company","Job","Method","Status","Accepted At"].map((h) => (
                        <th key={h} className="text-left px-4 py-3 font-medium whitespace-nowrap">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-700/20">
                    {filteredAccs.length === 0 && (
                      <tr><td colSpan={8} className="px-4 py-8 text-center text-slate-600">No acceptance records found</td></tr>
                    )}
                    {filteredAccs.map((a) => (
                      <tr key={a.id} className="hover:bg-slate-700/20 transition-colors">
                        <td className="px-4 py-3">
                          <p className="text-slate-300">{a.template?.template_title ?? a.template_type ?? "—"}</p>
                          {a.template_reference && (
                            <p className="text-slate-600 font-mono text-xs mt-0.5">{a.template_reference}</p>
                          )}
                        </td>
                        <td className="px-4 py-3 text-slate-400">{a.version_number ?? "—"}</td>
                        <td className="px-4 py-3">
                          <p className="text-slate-300">{a.user_name ?? "—"}</p>
                          <p className="text-slate-600 text-xs">{a.user_email ?? ""}</p>
                        </td>
                        <td className="px-4 py-3 text-slate-400">{a.company?.company_name ?? "—"}</td>
                        <td className="px-4 py-3">
                          {a.job_reference ? (
                            <Link href={`/admin/jobs/${a.job_reference}`} className="text-teal-400 hover:text-teal-300 font-mono">
                              {a.job_reference}
                            </Link>
                          ) : <span className="text-slate-600">—</span>}
                        </td>
                        <td className="px-4 py-3 text-slate-500">{a.acceptance_method ?? "—"}</td>
                        <td className="px-4 py-3">
                          <span className={`inline-flex items-center px-2 py-0.5 rounded-md border text-xs font-medium ${ACC_BADGE[a.acceptance_status] ?? ""}`}>
                            {a.acceptance_status}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-slate-500 whitespace-nowrap">{fmtTime(a.accepted_at)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* Footer note */}
        <div className="bg-slate-800/40 border border-slate-700/30 rounded-xl p-4 text-xs text-slate-600 space-y-1">
          <p className="text-slate-500 font-medium">⚖ Legal Notice</p>
          <p>• This is a system acceptance capture tool for pilot purposes only. It is not a substitute for formal legal advice.</p>
          <p>• Final pilot terms must be reviewed by a qualified lawyer before full public launch.</p>
          <p>• Acceptance records are immutable — no user can delete or alter their acceptance log.</p>
          <p>• Do not describe this workflow as legal escrow, trust, or guaranteed payment in any customer-facing material.</p>
        </div>

        {/* Footer nav */}
        <div className="flex items-center justify-between pt-4 border-t border-slate-700/40">
          <Link href="/admin" className="text-sm text-teal-400 hover:text-teal-300 transition-colors">← Admin</Link>
          <Link href="/admin/go-live-readiness" className="text-sm text-slate-500 hover:text-slate-300 transition-colors">Go-Live Readiness</Link>
        </div>

      </div>

      {/* ── Template viewer modal ─────────────────────────────────────────────── */}
      {viewing && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-3xl max-h-[90vh] flex flex-col shadow-2xl">
            <div className="px-6 py-4 border-b border-slate-700/50 flex items-start justify-between shrink-0">
              <div>
                <h3 className="font-semibold text-white">{viewing.template_title}</h3>
                <p className="text-xs text-slate-500 mt-0.5 font-mono">{viewing.template_reference} · v{viewing.version_number}</p>
              </div>
              <button onClick={() => setViewing(null)} className="text-slate-500 hover:text-slate-300 text-xl leading-none">×</button>
            </div>
            <div className="flex-1 overflow-y-auto p-6">
              <pre className="text-xs text-slate-300 whitespace-pre-wrap font-sans leading-relaxed bg-slate-950/60 rounded-xl p-5">
                {viewing.content}
              </pre>
            </div>
            <div className="px-6 py-4 border-t border-slate-700/50 flex justify-end gap-3">
              <span className={`text-xs px-2 py-1 rounded-md border ${STATUS_BADGE[viewing.status] ?? ""}`}>{viewing.status}</span>
              <button onClick={() => setViewing(null)} className="px-4 py-2 text-sm text-slate-400 hover:text-slate-200">Close</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Edit/Create modal ─────────────────────────────────────────────────── */}
      {editState && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-3xl max-h-[90vh] flex flex-col shadow-2xl">
            <div className="px-6 py-4 border-b border-slate-700/50 flex items-start justify-between shrink-0">
              <h3 className="font-semibold text-white">
                {editState.mode === "create" ? "Create New Template" : `Edit — ${editState.tmpl?.template_reference}`}
              </h3>
              <button onClick={() => setEditState(null)} className="text-slate-500 hover:text-slate-300 text-xl leading-none">×</button>
            </div>
            <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4 min-h-0">
              {editState.mode === "create" && (
                <div>
                  <label className="text-xs text-slate-400 block mb-1.5">Template Type <span className="text-red-400">*</span></label>
                  <select value={editState.template_type}
                    onChange={(e) => setEditState((s) => s ? { ...s, template_type: e.target.value } : s)}
                    className="w-full bg-slate-800/60 border border-slate-700/50 text-slate-300 text-sm rounded-xl px-3 py-2 focus:outline-none focus:border-teal-500/40">
                    {ALL_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
              )}
              <div>
                <label className="text-xs text-slate-400 block mb-1.5">Template Title <span className="text-red-400">*</span></label>
                <input type="text" value={editState.template_title}
                  onChange={(e) => setEditState((s) => s ? { ...s, template_title: e.target.value } : s)}
                  className="w-full bg-slate-800/60 border border-slate-700/50 text-slate-300 text-sm rounded-xl px-3 py-2 focus:outline-none focus:border-teal-500/40" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-slate-400 block mb-1.5">Version</label>
                  <input type="text" value={editState.version_number}
                    onChange={(e) => setEditState((s) => s ? { ...s, version_number: e.target.value } : s)}
                    placeholder="e.g. 1.0"
                    className="w-full bg-slate-800/60 border border-slate-700/50 text-slate-300 text-sm rounded-xl px-3 py-2 focus:outline-none focus:border-teal-500/40" />
                </div>
                <div>
                  <label className="text-xs text-slate-400 block mb-1.5">Effective Date</label>
                  <input type="date" value={editState.effective_date}
                    onChange={(e) => setEditState((s) => s ? { ...s, effective_date: e.target.value } : s)}
                    className="w-full bg-slate-800/60 border border-slate-700/50 text-slate-300 text-sm rounded-xl px-3 py-2 focus:outline-none focus:border-teal-500/40" />
                </div>
              </div>
              <div>
                <label className="text-xs text-slate-400 block mb-1.5">Content <span className="text-red-400">*</span></label>
                <div className="text-xs text-amber-400/70 mb-2">
                  Do not use: escrow, guaranteed payment, auto release guaranteed, bank-like custody
                </div>
                <textarea value={editState.content}
                  onChange={(e) => setEditState((s) => s ? { ...s, content: e.target.value } : s)}
                  rows={16}
                  className="w-full bg-slate-800/60 border border-slate-700/50 text-slate-300 text-sm rounded-xl px-3 py-2 resize-none focus:outline-none focus:border-teal-500/40 font-mono leading-relaxed" />
              </div>
              {saveErr && (
                <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-3 text-xs text-red-400">{saveErr}</div>
              )}
            </div>
            <div className="px-6 py-4 border-t border-slate-700/50 flex justify-end gap-3 shrink-0">
              <button onClick={() => setEditState(null)} className="px-4 py-2 text-sm text-slate-400 hover:text-slate-200">Cancel</button>
              <button onClick={submitEdit} disabled={saving || !editState.template_title || !editState.content}
                className="px-5 py-2 bg-teal-600/80 hover:bg-teal-600 text-white text-sm rounded-xl transition-colors disabled:opacity-40">
                {saving ? "Saving…" : editState.mode === "create" ? "Create Draft" : "Save Changes"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
