"use client";
import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { AuthGuard } from "@/components/AuthGuard";
import { LogoutButton } from "@/components/LogoutButton";

interface ProviderCustomer {
  id: string;
  customer_company: string;
  contact_name: string;
  email: string | null;
  phone: string | null;
  address: string | null;
  created_at: string;
}

const EMPTY_FORM = {
  customer_company: "",
  contact_name: "",
  email: "",
  phone: "",
  address: "",
};

function getToken(): string {
  try {
    const stored = localStorage.getItem("supabase.auth.token");
    return stored
      ? (JSON.parse(stored) as { access_token?: string }).access_token ?? ""
      : "";
  } catch { return ""; }
}

function CustomersContent() {
  const [customers, setCustomers] = useState<ProviderCustomer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/provider/customers", {
        headers: { Authorization: "Bearer " + getToken() },
      });
      const json = await res.json() as { ok?: boolean; customers?: ProviderCustomer[]; error?: string };
      if (!json.ok) throw new Error(json.error ?? "Failed to load");
      setCustomers(json.customers ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  function openNew() {
    setForm({ ...EMPTY_FORM });
    setEditId(null);
    setShowForm(true);
  }

  function openEdit(c: ProviderCustomer) {
    setForm({
      customer_company: c.customer_company,
      contact_name: c.contact_name,
      email: c.email ?? "",
      phone: c.phone ?? "",
      address: c.address ?? "",
    });
    setEditId(c.id);
    setShowForm(true);
  }

  async function handleSave() {
    if (!form.customer_company.trim() || !form.contact_name.trim()) {
      alert("Company name and contact name are required.");
      return;
    }
    setSaving(true);
    try {
      const url = editId ? `/api/provider/customers?id=${editId}` : "/api/provider/customers";
      const method = editId ? "PATCH" : "POST";
      const res = await fetch(url, {
        method,
        headers: { Authorization: "Bearer " + getToken(), "Content-Type": "application/json" },
        body: JSON.stringify({
          customer_company: form.customer_company.trim(),
          contact_name: form.contact_name.trim(),
          email: form.email.trim() || null,
          phone: form.phone.trim() || null,
          address: form.address.trim() || null,
        }),
      });
      const json = await res.json() as { ok?: boolean; error?: string };
      if (!json.ok) throw new Error(json.error ?? "Save failed");
      setShowForm(false);
      setEditId(null);
      await load();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("Delete this customer? This cannot be undone.")) return;
    setDeleting(id);
    try {
      const res = await fetch(`/api/provider/customers?id=${id}`, {
        method: "DELETE",
        headers: { Authorization: "Bearer " + getToken() },
      });
      const json = await res.json() as { ok?: boolean; error?: string };
      if (!json.ok) throw new Error(json.error ?? "Delete failed");
      await load();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Delete failed");
    } finally {
      setDeleting(null);
    }
  }

  const filtered = customers.filter(
    (c) =>
      c.customer_company.toLowerCase().includes(search.toLowerCase()) ||
      c.contact_name.toLowerCase().includes(search.toLowerCase()) ||
      (c.email ?? "").toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      {/* Nav */}
      <header className="border-b border-slate-800 bg-slate-950 sticky top-0 z-30">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-6">
          <Link href="/" className="flex items-center gap-2 text-sm font-semibold">
            <span className="text-blue-400">&#9632;</span>
            Nexum SecureFlow
          </Link>
          <nav className="flex items-center gap-4 text-xs text-slate-400">
            <span className="rounded-full border border-purple-500/30 bg-purple-500/10 px-3 py-1 text-purple-400 font-medium">
              Provider
            </span>
            <Link href="/provider" className="hover:text-slate-100 transition-colors">Dashboard</Link>
            <Link href="/provider/jobs" className="hover:text-slate-100 transition-colors">My Jobs</Link>
            <Link href="/provider/customers" className="text-slate-100 font-medium transition-colors">Customers</Link>
            <Link href="/provider/create-from-documents" className="hover:text-slate-100 transition-colors">Create from Docs</Link>
            <LogoutButton />
          </nav>
        </div>
      </header>

      <div className="mx-auto max-w-5xl px-6 py-10">
        {/* Header */}
        <div className="mb-8 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-slate-100">My Customers</h1>
            <p className="mt-1 text-sm text-slate-400">
              Manage your customer contacts. Select a customer when creating a new job.
            </p>
          </div>
          <button
            onClick={openNew}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold hover:bg-blue-500 transition-colors"
          >
            + Add Customer
          </button>
        </div>

        {/* Search */}
        <input
          type="text"
          placeholder="Search by company, contact or email…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="mb-6 w-full rounded-lg border border-slate-700 bg-slate-900 px-4 py-2.5 text-sm text-slate-100 placeholder-slate-600 focus:border-blue-600 focus:outline-none"
        />

        {/* Error */}
        {error && (
          <div className="mb-6 rounded-lg border border-red-800 bg-red-950/40 px-4 py-3 text-sm text-red-400">
            {error}
          </div>
        )}

        {/* Loading */}
        {loading && (
          <div className="text-center py-20 text-slate-500 text-sm">Loading customers…</div>
        )}

        {/* Empty */}
        {!loading && customers.length === 0 && !error && (
          <div className="rounded-xl border border-slate-800 bg-slate-900 p-12 text-center">
            <p className="text-slate-400 text-sm">No customers yet.</p>
            <button onClick={openNew} className="mt-4 text-blue-400 hover:text-blue-300 text-sm underline">
              Add your first customer
            </button>
          </div>
        )}

        {/* No search results */}
        {!loading && customers.length > 0 && filtered.length === 0 && (
          <div className="rounded-xl border border-slate-800 bg-slate-900 p-8 text-center text-sm text-slate-500">
            No customers match &ldquo;{search}&rdquo;
          </div>
        )}

        {/* List */}
        {!loading && filtered.length > 0 && (
          <div className="space-y-3">
            {filtered.map((c) => (
              <div
                key={c.id}
                className="rounded-xl border border-slate-700 bg-slate-900 px-6 py-4 flex items-start justify-between gap-4"
              >
                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-slate-100">{c.customer_company}</div>
                  <div className="text-sm text-slate-400 mt-0.5">{c.contact_name}</div>
                  <div className="flex flex-wrap gap-3 mt-1.5 text-xs text-slate-500">
                    {c.email && <span>✉ {c.email}</span>}
                    {c.phone && <span>📞 {c.phone}</span>}
                    {c.address && <span>📍 {c.address}</span>}
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <button
                    onClick={() => openEdit(c)}
                    className="rounded px-3 py-1.5 text-xs border border-blue-800 text-blue-400 hover:bg-blue-900/30 transition-colors"
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => handleDelete(c.id)}
                    disabled={deleting === c.id}
                    className="rounded px-3 py-1.5 text-xs border border-red-900 text-red-400 hover:bg-red-900/20 transition-colors disabled:opacity-50"
                  >
                    {deleting === c.id ? "…" : "Delete"}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* CTA to create job */}
        {!loading && customers.length > 0 && (
          <div className="mt-8 rounded-xl border border-slate-800 bg-slate-900/50 px-6 py-5 flex items-center justify-between">
            <div>
              <p className="text-sm text-slate-300 font-medium">Ready to create a job?</p>
              <p className="text-xs text-slate-500 mt-0.5">Upload documents and we&apos;ll extract the job details automatically.</p>
            </div>
            <Link
              href="/provider/create-from-documents"
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold hover:bg-blue-500 transition-colors"
            >
              Create Job from Docs →
            </Link>
          </div>
        )}
      </div>

      {/* Modal */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4">
          <div className="w-full max-w-md rounded-2xl border border-slate-700 bg-slate-900 p-8 shadow-2xl">
            <h2 className="mb-6 text-lg font-bold text-slate-100">
              {editId ? "Edit Customer" : "Add Customer"}
            </h2>
            <div className="space-y-4">
              {([
                { label: "Customer Company *", key: "customer_company", placeholder: "e.g. ABC Trading Sdn Bhd" },
                { label: "Contact Name *", key: "contact_name", placeholder: "e.g. Ahmad bin Ali" },
                { label: "Email", key: "email", placeholder: "contact@company.com" },
                { label: "Phone", key: "phone", placeholder: "+60 12-345 6789" },
              ] as { label: string; key: keyof typeof EMPTY_FORM; placeholder: string }[]).map(({ label, key, placeholder }) => (
                <div key={key}>
                  <label className="mb-1 block text-xs text-slate-400">{label}</label>
                  <input
                    value={form[key]}
                    onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
                    placeholder={placeholder}
                    className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 placeholder-slate-600 focus:border-blue-600 focus:outline-none"
                  />
                </div>
              ))}
              <div>
                <label className="mb-1 block text-xs text-slate-400">Address</label>
                <textarea
                  value={form.address}
                  onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))}
                  rows={3}
                  placeholder="Full company address"
                  className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 placeholder-slate-600 focus:border-blue-600 focus:outline-none"
                />
              </div>
            </div>
            <div className="mt-8 flex justify-end gap-3">
              <button
                onClick={() => { setShowForm(false); setEditId(null); }}
                className="rounded-lg border border-slate-700 px-4 py-2 text-sm text-slate-400 hover:text-slate-200 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="rounded-lg bg-blue-600 px-5 py-2 text-sm font-semibold hover:bg-blue-500 transition-colors disabled:opacity-50"
              >
                {saving ? "Saving…" : editId ? "Save Changes" : "Add Customer"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function CustomersPage() {
  return (
    <AuthGuard requiredRole="service_provider">
      <CustomersContent />
    </AuthGuard>
  );
}
