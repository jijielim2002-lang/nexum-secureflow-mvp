"use client";
import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useAuth } from "@/contexts/AuthContext";
import { AuthGuard } from "@/components/AuthGuard";
import { AdminNav } from "@/components/AdminNav";

// ─── Types ────────────────────────────────────────────────────────────────────

interface Mapping {
  id:                 string;
  real_company_id:    string;
  real_company_name:  string;
  owner_company_id:   string;
  owner_company_name: string;
  masked_code:        string;
  masked_name:        string | null;
  relationship_type:  string | null;
  visibility_level:   string;
  created_at:         string;
}

interface Company {
  id:   string;
  name: string;
}

// ─── Colour maps ──────────────────────────────────────────────────────────────

const visibilityColors: Record<string, string> = {
  Full:   "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
  Masked: "bg-amber-500/15  text-amber-400  border-amber-500/30",
  Hidden: "bg-slate-700     text-slate-400  border-slate-600",
};

const RELATIONSHIPS = ["Supplier","Customer","Buyer","Service Provider","Broker","Consignee","Shipper","Other"];
const VISIBILITIES  = ["Full","Masked","Hidden"];

// ─── Page ─────────────────────────────────────────────────────────────────────

function CounterpartyMappingsInner() {
  const { profile } = useAuth();
  const [mappings,   setMappings]   = useState<Mapping[]>([]);
  const [companies,  setCompanies]  = useState<Company[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [error,      setError]      = useState<string | null>(null);
  const [search,     setSearch]     = useState("");

  // Create modal
  const [showCreate,  setShowCreate]  = useState(false);
  const [form, setForm] = useState({
    real_company_id:   "",
    owner_company_id:  "",
    masked_code:       "",
    masked_name:       "",
    relationship_type: "Service Provider",
    visibility_level:  "Masked",
  });
  const [saving,        setSaving]        = useState(false);
  const [formError,     setFormError]     = useState<string | null>(null);
  const [autoGenerating, setAutoGenerating] = useState(false);
  const [autoResult,    setAutoResult]    = useState<string | null>(null);

  // Edit modal
  const [editMapping, setEditMapping] = useState<Mapping | null>(null);
  const [editForm,    setEditForm]    = useState({
    masked_code:       "",
    masked_name:       "",
    relationship_type: "",
    visibility_level:  "",
  });

  function getToken() {
    try {
      const s = localStorage.getItem("supabase.auth.token");
      return s ? (JSON.parse(s) as { access_token?: string }).access_token ?? "" : "";
    } catch { return ""; }
  }

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const token = getToken();
      const [mappingsRes, companiesRes] = await Promise.all([
        fetch("/api/admin/counterparty-mappings", { headers: { Authorization: "Bearer " + token } }),
        fetch("/api/admin/companies",             { headers: { Authorization: "Bearer " + token } }),
      ]);
      const mappingsJson = await mappingsRes.json() as { ok?: boolean; mappings?: Mapping[]; error?: string };
      const companiesJson = await companiesRes.json() as { companies?: Company[] };
      if (!mappingsJson.ok) throw new Error(mappingsJson.error ?? "Failed to load mappings");
      setMappings(mappingsJson.mappings ?? []);
      setCompanies((companiesJson.companies ?? []).sort((a, b) => a.name.localeCompare(b.name)));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void fetchData(); }, [fetchData]);

  async function handleAutoGenerate() {
    setAutoGenerating(true);
    setAutoResult(null);
    try {
      const token = getToken();
      const res   = await fetch("/api/admin/counterparty-mappings/auto-generate", {
        method:  "POST",
        headers: { Authorization: "Bearer " + token },
      });
      const json = await res.json() as { ok?: boolean; created?: number; message?: string; error?: string };
      if (!json.ok) throw new Error(json.error ?? "Auto-generate failed");
      setAutoResult(json.message ?? `Created ${json.created} mappings`);
      await fetchData();
    } catch (e) {
      setAutoResult("Error: " + (e instanceof Error ? e.message : String(e)));
    } finally {
      setAutoGenerating(false);
    }
  }

  async function handleCreate() {
    if (!form.real_company_id || !form.owner_company_id || !form.masked_code.trim()) {
      setFormError("Real company, viewer company, and masked code are required");
      return;
    }
    if (form.real_company_id === form.owner_company_id) {
      setFormError("Real company and viewer company must be different");
      return;
    }
    setSaving(true);
    setFormError(null);
    try {
      const token = getToken();
      const res   = await fetch("/api/admin/counterparty-mappings", {
        method:  "POST",
        headers: { Authorization: "Bearer " + token, "Content-Type": "application/json" },
        body:    JSON.stringify({
          real_company_id:   form.real_company_id,
          owner_company_id:  form.owner_company_id,
          masked_code:       form.masked_code.trim(),
          masked_name:       form.masked_name.trim() || null,
          relationship_type: form.relationship_type,
          visibility_level:  form.visibility_level,
        }),
      });
      const json = await res.json() as { ok?: boolean; error?: string };
      if (!json.ok) throw new Error(json.error ?? "Create failed");
      setShowCreate(false);
      setForm({ real_company_id: "", owner_company_id: "", masked_code: "", masked_name: "", relationship_type: "Service Provider", visibility_level: "Masked" });
      await fetchData();
    } catch (e) {
      setFormError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  async function handleEdit() {
    if (!editMapping) return;
    setSaving(true);
    try {
      const token = getToken();
      const res   = await fetch("/api/admin/counterparty-mappings?id=" + editMapping.id, {
        method:  "PATCH",
        headers: { Authorization: "Bearer " + token, "Content-Type": "application/json" },
        body:    JSON.stringify({
          masked_code:       editForm.masked_code.trim(),
          masked_name:       editForm.masked_name.trim() || null,
          relationship_type: editForm.relationship_type,
          visibility_level:  editForm.visibility_level,
        }),
      });
      const json = await res.json() as { ok?: boolean; error?: string };
      if (!json.ok) throw new Error(json.error ?? "Update failed");
      setEditMapping(null);
      await fetchData();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string, realName: string, ownerName: string) {
    if (!confirm(`Delete mapping: ${realName} → masked for ${ownerName}? This cannot be undone.`)) return;
    try {
      const token = getToken();
      await fetch("/api/admin/counterparty-mappings?id=" + id, {
        method:  "DELETE",
        headers: { Authorization: "Bearer " + token },
      });
      await fetchData();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  const filtered = search.trim()
    ? mappings.filter(m =>
        m.real_company_name.toLowerCase().includes(search.toLowerCase()) ||
        m.owner_company_name.toLowerCase().includes(search.toLowerCase()) ||
        m.masked_code.toLowerCase().includes(search.toLowerCase()) ||
        (m.masked_name ?? "").toLowerCase().includes(search.toLowerCase())
      )
    : mappings;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 font-sans">
      <header className="border-b border-slate-800 bg-slate-950/80 sticky top-0 z-50">
        <div className="mx-auto flex h-14 max-w-7xl items-center justify-between px-6">
          <Link href="/" className="flex items-center gap-2 text-sm font-semibold">
            <span className="text-blue-400">&#9632;</span> Nexum SecureFlow
          </Link>
          <AdminNav />
        </div>
      </header>

      <main className="mx-auto w-full max-w-7xl px-6 py-10">
        {/* Header */}
        <div className="mb-8 flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-50">Counterparty Mappings</h1>
            <p className="mt-1 text-sm text-slate-400">
              Control what company name each party sees when viewing a job. Masked names protect commercial confidentiality.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => void handleAutoGenerate()}
              disabled={autoGenerating}
              className="shrink-0 rounded-lg border border-slate-700 bg-slate-800 px-4 py-2 text-sm font-medium text-slate-300 hover:bg-slate-700 disabled:opacity-50 transition-colors"
            >
              {autoGenerating ? "Generating…" : "⚡ Auto-generate all"}
            </button>
            <button
              onClick={() => { setShowCreate(true); setFormError(null); }}
              className="shrink-0 rounded-lg border border-purple-500/40 bg-purple-500/15 px-4 py-2 text-sm font-semibold text-purple-300 hover:bg-purple-500/25 transition-colors"
            >
              + New mapping
            </button>
          </div>
        </div>

        {/* Auto-generate result */}
        {autoResult && (
          <div className={`mb-4 rounded-xl border px-5 py-3 text-sm flex items-center justify-between ${
            autoResult.startsWith("Error")
              ? "border-red-500/30 bg-red-500/5 text-red-300"
              : "border-emerald-500/30 bg-emerald-500/5 text-emerald-300"
          }`}>
            <span>{autoResult}</span>
            <button onClick={() => setAutoResult(null)} className="ml-4 text-slate-500 hover:text-slate-300">✕</button>
          </div>
        )}

        {/* How it works */}
        <div className="mb-6 rounded-xl border border-slate-800 bg-slate-900/40 p-4 text-xs text-slate-400 space-y-1">
          <p className="font-semibold text-slate-300 mb-2">How masking works</p>
          <p>• <span className="text-amber-400">Masked</span> — viewer sees the masked code/name instead of the real company name</p>
          <p>• <span className="text-emerald-400">Full</span> — viewer sees the real company name (use for trusted relationships)</p>
          <p>• <span className="text-slate-500">Hidden</span> — viewer sees only "[Hidden]" (maximum privacy)</p>
          <p className="mt-2 text-slate-500">If no mapping exists for a company pair, the viewer sees an auto-generated code (e.g. Company-A1B2C3).</p>
        </div>

        {/* Search */}
        <div className="mb-4">
          <input
            type="text"
            placeholder="Search by company name or masked code…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full max-w-sm rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 placeholder-slate-600 focus:border-purple-500 focus:outline-none"
          />
        </div>

        {/* Error */}
        {error && (
          <div className="mb-6 rounded-xl border border-red-500/30 bg-red-500/5 px-5 py-3 text-sm text-red-300">
            {error}
          </div>
        )}

        {/* Loading */}
        {loading && (
          <div className="py-20 text-center">
            <div className="inline-block h-7 w-7 animate-spin rounded-full border-2 border-purple-500 border-t-transparent mb-4" />
            <p className="text-sm text-slate-400">Loading mappings…</p>
          </div>
        )}

        {/* Table */}
        {!loading && (
          <div className="overflow-x-auto rounded-xl border border-slate-800">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-800 bg-slate-900 text-left text-xs text-slate-500">
                  <th className="px-4 py-3">Real company</th>
                  <th className="px-4 py-3">Seen by</th>
                  <th className="px-4 py-3">Masked code</th>
                  <th className="px-4 py-3">Masked name</th>
                  <th className="px-4 py-3">Relationship</th>
                  <th className="px-4 py-3">Visibility</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {filtered.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-12 text-center text-sm text-slate-600">
                      {search ? "No mappings match your search" : "No mappings configured yet. Create one to start masking counterparty names."}
                    </td>
                  </tr>
                ) : (
                  filtered.map(m => (
                    <tr key={m.id} className="bg-slate-900/40 hover:bg-slate-900 transition-colors">
                      <td className="px-4 py-3 text-xs text-slate-200 whitespace-nowrap font-medium">
                        {m.real_company_name}
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-400 whitespace-nowrap">
                        {m.owner_company_name}
                      </td>
                      <td className="px-4 py-3 font-mono text-xs text-slate-300 whitespace-nowrap">
                        {m.masked_code}
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-400 whitespace-nowrap">
                        {m.masked_name ?? <span className="text-slate-600">—</span>}
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-400 whitespace-nowrap">
                        {m.relationship_type ?? <span className="text-slate-600">—</span>}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <span className={`rounded-full border px-2 py-0.5 text-xs font-medium ${visibilityColors[m.visibility_level] ?? "bg-slate-800 text-slate-400 border-slate-700"}`}>
                          {m.visibility_level}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right whitespace-nowrap">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => {
                              setEditMapping(m);
                              setEditForm({
                                masked_code:       m.masked_code,
                                masked_name:       m.masked_name ?? "",
                                relationship_type: m.relationship_type ?? "Service Provider",
                                visibility_level:  m.visibility_level,
                              });
                            }}
                            className="rounded border border-slate-700 bg-slate-800 px-2 py-1 text-xs text-slate-300 hover:bg-slate-700 transition-colors"
                          >
                            Edit
                          </button>
                          <button
                            onClick={() => void handleDelete(m.id, m.real_company_name, m.owner_company_name)}
                            className="rounded border border-red-500/30 bg-red-500/5 px-2 py-1 text-xs text-red-400 hover:bg-red-500/15 transition-colors"
                          >
                            Delete
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}
      </main>

      {/* Create modal */}
      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4">
          <div className="w-full max-w-lg rounded-2xl border border-slate-700 bg-slate-900 p-6 max-h-[90vh] overflow-y-auto">
            <h2 className="mb-1 text-base font-bold text-slate-100">New Counterparty Mapping</h2>
            <p className="mb-5 text-xs text-slate-500">
              Define what name the viewer company sees when encountering the real company on a job.
            </p>
            <div className="space-y-4">
              <div>
                <label className="mb-1.5 block text-xs text-slate-400">Real company <span className="text-red-400">*</span></label>
                <select
                  value={form.real_company_id}
                  onChange={e => setForm(f => ({ ...f, real_company_id: e.target.value }))}
                  className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 focus:border-purple-500 focus:outline-none"
                >
                  <option value="">Select company…</option>
                  {companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
                <p className="mt-1 text-xs text-slate-600">The company whose name will be masked</p>
              </div>
              <div>
                <label className="mb-1.5 block text-xs text-slate-400">Seen by (viewer company) <span className="text-red-400">*</span></label>
                <select
                  value={form.owner_company_id}
                  onChange={e => setForm(f => ({ ...f, owner_company_id: e.target.value }))}
                  className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 focus:border-purple-500 focus:outline-none"
                >
                  <option value="">Select company…</option>
                  {companies.filter(c => c.id !== form.real_company_id).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
                <p className="mt-1 text-xs text-slate-600">This company will see the masked name instead of the real name</p>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1.5 block text-xs text-slate-400">Masked code <span className="text-red-400">*</span></label>
                  <input
                    type="text"
                    value={form.masked_code}
                    onChange={e => setForm(f => ({ ...f, masked_code: e.target.value }))}
                    placeholder="e.g. SP-001"
                    className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm font-mono text-slate-100 placeholder-slate-600 focus:border-purple-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-xs text-slate-400">Masked name (optional)</label>
                  <input
                    type="text"
                    value={form.masked_name}
                    onChange={e => setForm(f => ({ ...f, masked_name: e.target.value }))}
                    placeholder="e.g. Trusted Freight Co"
                    className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 placeholder-slate-600 focus:border-purple-500 focus:outline-none"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1.5 block text-xs text-slate-400">Relationship type</label>
                  <select
                    value={form.relationship_type}
                    onChange={e => setForm(f => ({ ...f, relationship_type: e.target.value }))}
                    className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 focus:border-purple-500 focus:outline-none"
                  >
                    {RELATIONSHIPS.map(r => <option key={r} value={r}>{r}</option>)}
                  </select>
                </div>
                <div>
                  <label className="mb-1.5 block text-xs text-slate-400">Visibility</label>
                  <select
                    value={form.visibility_level}
                    onChange={e => setForm(f => ({ ...f, visibility_level: e.target.value }))}
                    className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 focus:border-purple-500 focus:outline-none"
                  >
                    {VISIBILITIES.map(v => <option key={v} value={v}>{v} — {v === "Full" ? "show real name" : v === "Masked" ? "show masked name" : "show [Hidden]"}</option>)}
                  </select>
                </div>
              </div>
              {formError && <p className="text-xs text-red-400">{formError}</p>}
              <div className="flex gap-3 pt-2">
                <button
                  onClick={() => setShowCreate(false)}
                  className="flex-1 rounded-lg border border-slate-700 bg-slate-800 py-2 text-sm text-slate-300 hover:bg-slate-700 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={() => void handleCreate()}
                  disabled={saving}
                  className="flex-1 rounded-lg bg-purple-600 py-2 text-sm font-semibold text-white hover:bg-purple-500 disabled:opacity-50 transition-colors"
                >
                  {saving ? "Creating…" : "Create mapping"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Edit modal */}
      {editMapping && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4">
          <div className="w-full max-w-md rounded-2xl border border-slate-700 bg-slate-900 p-6">
            <h2 className="mb-1 text-base font-bold text-slate-100">Edit Mapping</h2>
            <p className="mb-5 text-xs text-slate-500">
              {editMapping.real_company_name} → as seen by {editMapping.owner_company_name}
            </p>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1.5 block text-xs text-slate-400">Masked code</label>
                  <input
                    type="text"
                    value={editForm.masked_code}
                    onChange={e => setEditForm(f => ({ ...f, masked_code: e.target.value }))}
                    className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm font-mono text-slate-100 focus:border-purple-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-xs text-slate-400">Masked name</label>
                  <input
                    type="text"
                    value={editForm.masked_name}
                    onChange={e => setEditForm(f => ({ ...f, masked_name: e.target.value }))}
                    placeholder="Optional"
                    className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 placeholder-slate-600 focus:border-purple-500 focus:outline-none"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1.5 block text-xs text-slate-400">Relationship</label>
                  <select
                    value={editForm.relationship_type}
                    onChange={e => setEditForm(f => ({ ...f, relationship_type: e.target.value }))}
                    className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 focus:border-purple-500 focus:outline-none"
                  >
                    {RELATIONSHIPS.map(r => <option key={r} value={r}>{r}</option>)}
                  </select>
                </div>
                <div>
                  <label className="mb-1.5 block text-xs text-slate-400">Visibility</label>
                  <select
                    value={editForm.visibility_level}
                    onChange={e => setEditForm(f => ({ ...f, visibility_level: e.target.value }))}
                    className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 focus:border-purple-500 focus:outline-none"
                  >
                    {VISIBILITIES.map(v => <option key={v} value={v}>{v}</option>)}
                  </select>
                </div>
              </div>
              <div className="flex gap-3 pt-2">
                <button
                  onClick={() => setEditMapping(null)}
                  className="flex-1 rounded-lg border border-slate-700 bg-slate-800 py-2 text-sm text-slate-300 hover:bg-slate-700 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={() => void handleEdit()}
                  disabled={saving}
                  className="flex-1 rounded-lg bg-purple-600 py-2 text-sm font-semibold text-white hover:bg-purple-500 disabled:opacity-50 transition-colors"
                >
                  {saving ? "Saving…" : "Save changes"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function CounterpartyMappingsPage() {
  return (
    <AuthGuard requiredRole="admin">
      <CounterpartyMappingsInner />
    </AuthGuard>
  );
}
