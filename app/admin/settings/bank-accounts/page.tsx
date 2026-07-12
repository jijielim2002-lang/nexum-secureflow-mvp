"use client";
import { useState, useEffect, useCallback } from "react";
import { AdminNav } from "@/components/AdminNav";
import { AuthGuard } from "@/components/AuthGuard";

// ─── Types ────────────────────────────────────────────────────────────────────

interface BankAccount {
  id: string;
  account_holder_name: string;
  bank_name: string;
  account_number: string;
  swift_code: string | null;
  currency: string;
  account_type: string;
  status: "Active" | "Inactive";
  is_default: boolean;
  payment_instruction_note: string | null;
  created_at: string;
  updated_at: string;
}

const EMPTY_FORM = {
  account_holder_name: "",
  bank_name: "",
  account_number: "",
  swift_code: "",
  currency: "MYR",
  account_type: "Current",
  status: "Active",
  is_default: false,
  payment_instruction_note: "",
};

// ─── Page ─────────────────────────────────────────────────────────────────────

function BankAccountsContent() {
  const [accounts, setAccounts] = useState<BankAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);

  // Read token from localStorage directly — avoids supabase.auth.getSession()
  // which makes a browser→Supabase HTTP call that hangs on this network.
  const authHeader = useCallback(() => {
    let token = "";
    try {
      const stored = localStorage.getItem("supabase.auth.token");
      if (stored) {
        const parsed = JSON.parse(stored) as { access_token?: string };
        token = parsed?.access_token ?? "";
      }
    } catch { /* ignore */ }
    return { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const headers = authHeader();
      const res = await fetch("/api/admin/bank-accounts", { headers });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error ?? "Failed to load");
      setAccounts(json.accounts ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }, [authHeader]);

  useEffect(() => { load(); }, [load]);

  function openNew() {
    setForm({ ...EMPTY_FORM });
    setEditId(null);
    setShowForm(true);
  }

  function openEdit(acc: BankAccount) {
    setForm({
      account_holder_name: acc.account_holder_name,
      bank_name: acc.bank_name,
      account_number: acc.account_number,
      swift_code: acc.swift_code ?? "",
      currency: acc.currency,
      account_type: acc.account_type,
      status: acc.status,
      is_default: acc.is_default,
      payment_instruction_note: acc.payment_instruction_note ?? "",
    });
    setEditId(acc.id);
    setShowForm(true);
  }

  async function handleSave() {
    if (!form.account_holder_name || !form.bank_name || !form.account_number) {
      alert("Account holder name, bank name, and account number are required.");
      return;
    }
    setSaving(true);
    try {
      const headers = authHeader();
      const payload = {
        ...form,
        swift_code: form.swift_code || null,
        payment_instruction_note: form.payment_instruction_note || null,
      };

      const url = editId ? `/api/admin/bank-accounts?id=${editId}` : "/api/admin/bank-accounts";
      const method = editId ? "PATCH" : "POST";
      const res = await fetch(url, { method, headers, body: JSON.stringify(payload) });
      const json = await res.json();
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
    if (!confirm("Delete this bank account? This cannot be undone.")) return;
    setDeleting(id);
    try {
      const headers = authHeader();
      const res = await fetch(`/api/admin/bank-accounts?id=${id}`, { method: "DELETE", headers });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error ?? "Delete failed");
      await load();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Delete failed");
    } finally {
      setDeleting(null);
    }
  }

  async function toggleStatus(acc: BankAccount) {
    const headers = authHeader();
    await fetch(`/api/admin/bank-accounts?id=${acc.id}`, {
      method: "PATCH",
      headers,
      body: JSON.stringify({ status: acc.status === "Active" ? "Inactive" : "Active" }),
    });
    await load();
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <AdminNav />
      <div className="mx-auto max-w-5xl px-6 py-10">

        {/* Header */}
        <div className="mb-8 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-slate-100">Official Bank Accounts</h1>
            <p className="mt-1 text-sm text-slate-400">
              Admin-managed. Shown to customers on payment instruction pages only after job acceptance.
            </p>
          </div>
          <button
            onClick={openNew}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold hover:bg-blue-500 transition-colors"
          >
            + Add Account
          </button>
        </div>

        {/* Error */}
        {error && (
          <div className="mb-6 rounded-lg border border-red-800 bg-red-950/40 px-4 py-3 text-sm text-red-400">
            {error}
          </div>
        )}

        {/* Loading */}
        {loading && (
          <div className="text-center py-20 text-slate-500 text-sm">Loading bank accounts…</div>
        )}

        {/* Empty */}
        {!loading && accounts.length === 0 && !error && (
          <div className="rounded-xl border border-slate-800 bg-slate-900 p-12 text-center">
            <p className="text-slate-400 text-sm">No bank accounts configured yet.</p>
            <button onClick={openNew} className="mt-4 text-blue-400 hover:text-blue-300 text-sm underline">
              Add the first account
            </button>
          </div>
        )}

        {/* Accounts list */}
        {!loading && accounts.length > 0 && (
          <div className="space-y-4">
            {accounts.map((acc) => (
              <div
                key={acc.id}
                className={`rounded-xl border p-6 ${
                  acc.status === "Active"
                    ? "border-slate-700 bg-slate-900"
                    : "border-slate-800 bg-slate-900/40 opacity-60"
                }`}
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-3 flex-wrap">
                      <span className="text-base font-semibold text-slate-100">{acc.bank_name}</span>
                      {acc.is_default && (
                        <span className="rounded-full bg-blue-900/60 px-2 py-0.5 text-xs text-blue-300 border border-blue-800">
                          Default
                        </span>
                      )}
                      <span className={`rounded-full px-2 py-0.5 text-xs border ${
                        acc.status === "Active"
                          ? "bg-green-900/40 text-green-400 border-green-800"
                          : "bg-slate-800 text-slate-500 border-slate-700"
                      }`}>
                        {acc.status}
                      </span>
                      <span className="rounded-full bg-slate-800 px-2 py-0.5 text-xs text-slate-400 border border-slate-700">
                        {acc.currency}
                      </span>
                    </div>
                    <p className="mt-1 text-sm text-slate-300">{acc.account_holder_name}</p>
                    <p className="mt-0.5 font-mono text-sm text-slate-400">{acc.account_number}</p>
                    {acc.swift_code && (
                      <p className="mt-0.5 text-xs text-slate-500">SWIFT: {acc.swift_code}</p>
                    )}
                    {acc.payment_instruction_note && (
                      <p className="mt-2 text-xs text-slate-500 italic border-l-2 border-slate-700 pl-3">
                        {acc.payment_instruction_note}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <button
                      onClick={() => toggleStatus(acc)}
                      className="rounded px-3 py-1.5 text-xs border border-slate-700 text-slate-400 hover:text-slate-200 hover:border-slate-500 transition-colors"
                    >
                      {acc.status === "Active" ? "Deactivate" : "Activate"}
                    </button>
                    <button
                      onClick={() => openEdit(acc)}
                      className="rounded px-3 py-1.5 text-xs border border-blue-800 text-blue-400 hover:bg-blue-900/30 transition-colors"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => handleDelete(acc.id)}
                      disabled={deleting === acc.id}
                      className="rounded px-3 py-1.5 text-xs border border-red-900 text-red-400 hover:bg-red-900/20 transition-colors disabled:opacity-50"
                    >
                      {deleting === acc.id ? "…" : "Delete"}
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Form modal */}
        {showForm && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4">
            <div className="w-full max-w-lg rounded-2xl border border-slate-700 bg-slate-900 p-8 shadow-2xl">
              <h2 className="mb-6 text-lg font-bold text-slate-100">
                {editId ? "Edit Bank Account" : "Add Bank Account"}
              </h2>

              <div className="space-y-4">
                {[
                  { label: "Account Holder Name *", key: "account_holder_name" },
                  { label: "Bank Name *", key: "bank_name" },
                  { label: "Account Number *", key: "account_number" },
                  { label: "SWIFT / BIC Code", key: "swift_code" },
                ].map(({ label, key }) => (
                  <div key={key}>
                    <label className="mb-1 block text-xs text-slate-400">{label}</label>
                    <input
                      value={(form as Record<string, string>)[key]}
                      onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
                      className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 placeholder-slate-600 focus:border-blue-600 focus:outline-none"
                    />
                  </div>
                ))}

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="mb-1 block text-xs text-slate-400">Currency</label>
                    <select
                      value={form.currency}
                      onChange={(e) => setForm((f) => ({ ...f, currency: e.target.value }))}
                      className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100"
                    >
                      {["MYR", "USD", "SGD", "EUR", "GBP"].map((c) => (
                        <option key={c} value={c}>{c}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="mb-1 block text-xs text-slate-400">Account Type</label>
                    <select
                      value={form.account_type}
                      onChange={(e) => setForm((f) => ({ ...f, account_type: e.target.value }))}
                      className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100"
                    >
                      {["Current", "Savings", "FD", "Other"].map((t) => (
                        <option key={t} value={t}>{t}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div>
                  <label className="mb-1 block text-xs text-slate-400">Payment Instruction Note</label>
                  <textarea
                    value={form.payment_instruction_note}
                    onChange={(e) => setForm((f) => ({ ...f, payment_instruction_note: e.target.value }))}
                    rows={2}
                    placeholder="e.g. Please include job reference in transfer description."
                    className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 placeholder-slate-600 focus:border-blue-600 focus:outline-none"
                  />
                </div>

                <div className="flex items-center gap-6">
                  <label className="flex items-center gap-2 text-sm text-slate-300 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={form.is_default}
                      onChange={(e) => setForm((f) => ({ ...f, is_default: e.target.checked }))}
                      className="accent-blue-500"
                    />
                    Set as default for {form.currency}
                  </label>
                  <label className="flex items-center gap-2 text-sm text-slate-300 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={form.status === "Active"}
                      onChange={(e) => setForm((f) => ({ ...f, status: e.target.checked ? "Active" : "Inactive" }))}
                      className="accent-blue-500"
                    />
                    Active
                  </label>
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
                  {saving ? "Saving…" : editId ? "Save Changes" : "Add Account"}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default function BankAccountsPage() {
  return (
    <AuthGuard requiredRole="admin">
      <BankAccountsContent />
    </AuthGuard>
  );
}
