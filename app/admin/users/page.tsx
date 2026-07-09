"use client";
import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";
import { useAuth } from "@/contexts/AuthContext";
import { LogoutButton } from "@/components/LogoutButton";
import { NotificationBell } from "@/components/NotificationBell";
import { AuthGuard } from "@/components/AuthGuard";

// ─── Types ────────────────────────────────────────────────────────────────────

interface UserRow {
  id:           string;
  email:        string | null;
  full_name:    string | null;
  role:         string | null;
  company_id:   string | null;
  company_name: string | null;
  status:       string;
  created_at:   string;
  last_sign_in: string | null;
}

interface EditState {
  open:      boolean;
  user:      UserRow | null;
  fullName:  string;
  role:      string;
  companyId: string;
  status:    string;
  saving:    boolean;
  error:     string;
}

interface CompanyOption { id: string; name: string; }

const ROLE_BADGE: Record<string, string> = {
  admin:            "border-blue-500/30 bg-blue-500/10 text-blue-400",
  service_provider: "border-purple-500/30 bg-purple-500/10 text-purple-400",
  customer:         "border-emerald-500/30 bg-emerald-500/10 text-emerald-400",
};

const STATUS_BADGE: Record<string, string> = {
  active:    "border-emerald-500/20 bg-emerald-500/10 text-emerald-400",
  inactive:  "border-slate-600 bg-slate-800 text-slate-500",
  suspended: "border-red-500/20 bg-red-500/10 text-red-400",
};

function timeAgo(iso: string | null): string {
  if (!iso) return "Never";
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (diff < 60)    return `${diff}s ago`;
  if (diff < 3600)  return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

// ─── Page ─────────────────────────────────────────────────────────────────────

function UsersPage() {
  const { profile } = useAuth();

  const [users,     setUsers]     = useState<UserRow[]>([]);
  const [companies, setCompanies] = useState<CompanyOption[]>([]);
  const [loading,   setLoading]   = useState(true);
  const [search,    setSearch]    = useState("");
  const [filterRole, setFilterRole] = useState("All");
  const [edit,      setEdit]      = useState<EditState>({
    open: false, user: null, fullName: "", role: "", companyId: "", status: "", saving: false, error: "",
  });

  const load = useCallback(async () => {
    setLoading(true);
    const { data: { session } } = await supabase.auth.getSession();
    const token = session?.access_token;
    if (!token) { setLoading(false); return; }

    const [usersRes, companiesRes] = await Promise.all([
      fetch("/api/admin/users", { headers: { Authorization: `Bearer ${token}` } })
        .then((r) => r.json() as Promise<{ users?: UserRow[] }>),
      supabase.from("companies").select("id, name").order("name"),
    ]);

    setUsers(usersRes.users ?? []);
    setCompanies((companiesRes.data ?? []) as CompanyOption[]);
    setLoading(false);
  }, []);

  useEffect(() => { void load(); }, [load]);

  // Filter
  const filtered = users
    .filter((u) => filterRole === "All" || u.role === filterRole)
    .filter((u) => {
      if (!search) return true;
      const q = search.toLowerCase();
      return (
        (u.email      ?? "").toLowerCase().includes(q) ||
        (u.full_name  ?? "").toLowerCase().includes(q) ||
        (u.company_name ?? "").toLowerCase().includes(q)
      );
    });

  // Counts
  const adminCount    = users.filter((u) => u.role === "admin").length;
  const providerCount = users.filter((u) => u.role === "service_provider").length;
  const customerCount = users.filter((u) => u.role === "customer").length;

  // Edit handlers
  function openEdit(u: UserRow) {
    setEdit({
      open: true, user: u,
      fullName:  u.full_name  ?? "",
      role:      u.role       ?? "customer",
      companyId: u.company_id ?? "",
      status:    u.status,
      saving: false, error: "",
    });
  }

  async function saveEdit() {
    if (!edit.user) return;
    setEdit((p) => ({ ...p, saving: true, error: "" }));

    const { data: { session } } = await supabase.auth.getSession();
    const token = session?.access_token;

    const res = await fetch("/api/admin/users", {
      method:  "PATCH",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token ?? ""}` },
      body:    JSON.stringify({
        userId:    edit.user.id,
        fullName:  edit.fullName,
        role:      edit.role,
        companyId: edit.companyId || null,
        status:    edit.status,
      }),
    });

    const json = await res.json() as { success?: boolean; error?: string };
    if (json.success) {
      setEdit((p) => ({ ...p, open: false }));
      void load();
    } else {
      setEdit((p) => ({ ...p, saving: false, error: json.error ?? "Save failed" }));
    }
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 font-sans">

      {/* Header */}
      <header className="border-b border-slate-800 bg-slate-950/80 sticky top-0 z-50">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-6">
          <Link href="/" className="flex items-center gap-2 text-sm font-semibold">
            <span className="text-blue-400">&#9632;</span> Nexum SecureFlow
          </Link>
          <nav className="flex items-center gap-4 text-xs text-slate-400">
            <span className="rounded-full border border-blue-500/30 bg-blue-500/10 px-3 py-1 text-blue-400 font-medium">Admin</span>
            <Link href="/admin"                className="hover:text-slate-100 transition-colors">Dashboard</Link>
            <Link href="/admin/jobs"           className="hover:text-slate-100 transition-colors">Jobs</Link>
            <Link href="/admin/companies/new"  className="hover:text-slate-100 transition-colors">+ Company</Link>
            <NotificationBell />
            <LogoutButton />
          </nav>
        </div>
      </header>

      {/* Pilot banner */}
      <div className="border-b border-amber-500/20 bg-amber-950/10">
        <div className="mx-auto max-w-6xl px-6 py-2 flex items-center gap-2">
          <span className="text-amber-400 text-xs">⚠</span>
          <p className="text-xs text-amber-300/70">
            <span className="font-semibold text-amber-300">Pilot Mode</span>
            {" — "}
            These are real accounts. Role changes take effect immediately on next login.
          </p>
        </div>
      </div>

      <main className="mx-auto max-w-6xl px-6 py-8">
        {/* Title */}
        <div className="mb-6 flex items-start justify-between">
          <div>
            <h1 className="text-xl font-bold text-slate-100">👥 Pilot Users</h1>
            <p className="mt-1 text-xs text-slate-500">Manage all user accounts for this pilot deployment</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={load}
              className="rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-xs text-slate-300 hover:bg-slate-700 transition-colors"
            >
              ↻ Refresh
            </button>
            <Link
              href="/admin/users/new"
              className="rounded-lg border border-blue-500/40 bg-blue-500/15 px-4 py-2 text-xs font-semibold text-blue-300 hover:bg-blue-500/25 transition-colors"
            >
              + New User
            </Link>
          </div>
        </div>

        {/* Metric cards */}
        <div className="mb-6 grid grid-cols-3 gap-3 sm:grid-cols-4">
          {[
            { label: "Total",    count: users.length,   color: "text-slate-300" },
            { label: "Admins",   count: adminCount,     color: "text-blue-400"  },
            { label: "Providers",count: providerCount,  color: "text-purple-400"},
            { label: "Customers",count: customerCount,  color: "text-emerald-400"},
          ].map(({ label, count, color }) => (
            <div key={label} className="rounded-xl border border-slate-800 bg-slate-900 p-4">
              <p className="mb-1 text-[10px] text-slate-500">{label}</p>
              <p className={`text-2xl font-bold ${color}`}>{count}</p>
            </div>
          ))}
        </div>

        {/* Filters */}
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-slate-600 uppercase tracking-wide">Role:</span>
            {["All", "admin", "service_provider", "customer"].map((r) => (
              <button
                key={r}
                onClick={() => setFilterRole(r)}
                className={`rounded-full border px-2.5 py-0.5 text-[10px] transition-colors ${
                  filterRole === r
                    ? "border-blue-500/40 bg-blue-500/15 text-blue-300"
                    : "border-slate-700 bg-slate-800/60 text-slate-500 hover:text-slate-300"
                }`}
              >
                {r === "All" ? "All" : r === "service_provider" ? "Provider" : r.charAt(0).toUpperCase() + r.slice(1)}
              </button>
            ))}
          </div>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search name, email, company…"
            className="rounded-lg border border-slate-700 bg-slate-800 px-3 py-1 text-[10px] text-slate-300 placeholder-slate-600 focus:outline-none"
          />
        </div>

        {/* Table */}
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <span className="text-sm text-slate-600 animate-pulse">Loading users…</span>
          </div>
        ) : (
          <div className="rounded-xl border border-slate-800 bg-slate-900/60 overflow-hidden">
            <div className="flex items-center justify-between border-b border-slate-800 bg-slate-900/80 px-4 py-2.5">
              <p className="text-[11px] font-semibold text-slate-500">
                {filtered.length} user{filtered.length !== 1 ? "s" : ""}
              </p>
            </div>
            {filtered.length === 0 ? (
              <div className="py-16 text-center">
                <p className="text-sm text-slate-500">No users match your filters.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-slate-800 bg-slate-900/80">
                      {["Name", "Email", "Role", "Company", "Status", "Last Login", "Created", "Action"].map((h) => (
                        <th key={h} className="px-4 py-2.5 text-left text-[10px] font-semibold text-slate-500">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60">
                    {filtered.map((u) => (
                      <tr key={u.id} className="hover:bg-slate-800/30 transition-colors">
                        <td className="px-4 py-3 font-medium text-slate-300 whitespace-nowrap">
                          {u.full_name ?? <span className="text-slate-600">—</span>}
                        </td>
                        <td className="px-4 py-3 text-slate-500 text-[10px] max-w-[180px]">
                          <span className="block truncate">{u.email ?? "—"}</span>
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          <span className={`rounded-full border px-2 py-0.5 text-[9px] font-semibold ${ROLE_BADGE[u.role ?? ""] ?? "border-slate-700 text-slate-500"}`}>
                            {u.role === "service_provider" ? "Provider" : (u.role ?? "—")}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-slate-500 text-[10px] max-w-[140px]">
                          <span className="block truncate">{u.company_name ?? <span className="text-slate-700">—</span>}</span>
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          <span className={`rounded-full border px-2 py-0.5 text-[9px] font-semibold ${STATUS_BADGE[u.status] ?? "border-slate-700 text-slate-500"}`}>
                            {u.status}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-slate-600 text-[10px] tabular-nums whitespace-nowrap">
                          {timeAgo(u.last_sign_in)}
                        </td>
                        <td className="px-4 py-3 text-slate-600 text-[10px] tabular-nums whitespace-nowrap">
                          {new Date(u.created_at).toLocaleDateString()}
                        </td>
                        <td className="px-4 py-3">
                          <button
                            onClick={() => openEdit(u)}
                            className="rounded border border-slate-700 bg-slate-800 px-2.5 py-1 text-[10px] text-slate-400 hover:text-slate-200 hover:bg-slate-700 transition-colors whitespace-nowrap"
                          >
                            ✎ Edit
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </main>

      {/* Edit modal */}
      {edit.open && edit.user && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4"
          onClick={(e) => { if (e.target === e.currentTarget) setEdit((p) => ({ ...p, open: false })); }}
        >
          <div className="w-full max-w-md rounded-2xl border border-slate-700 bg-slate-900 p-6 shadow-2xl">
            <div className="mb-5 flex items-center justify-between">
              <h2 className="text-sm font-bold text-slate-100">Edit User</h2>
              <button
                onClick={() => setEdit((p) => ({ ...p, open: false }))}
                className="text-slate-500 hover:text-slate-300 text-lg leading-none"
              >✕</button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-[10px] font-medium text-slate-500 mb-1">Full Name</label>
                <input
                  type="text"
                  value={edit.fullName}
                  onChange={(e) => setEdit((p) => ({ ...p, fullName: e.target.value }))}
                  className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-blue-500/60"
                />
              </div>

              <div>
                <label className="block text-[10px] font-medium text-slate-500 mb-1">Role</label>
                <select
                  value={edit.role}
                  onChange={(e) => setEdit((p) => ({ ...p, role: e.target.value }))}
                  className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-300 focus:outline-none"
                >
                  <option value="customer">Customer</option>
                  <option value="service_provider">Service Provider</option>
                  <option value="admin">Admin</option>
                </select>
              </div>

              <div>
                <label className="block text-[10px] font-medium text-slate-500 mb-1">Company</label>
                <select
                  value={edit.companyId}
                  onChange={(e) => setEdit((p) => ({ ...p, companyId: e.target.value }))}
                  className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-300 focus:outline-none"
                >
                  <option value="">— No company —</option>
                  {companies.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-[10px] font-medium text-slate-500 mb-1">Status</label>
                <select
                  value={edit.status}
                  onChange={(e) => setEdit((p) => ({ ...p, status: e.target.value }))}
                  className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-300 focus:outline-none"
                >
                  <option value="active">Active</option>
                  <option value="inactive">Inactive</option>
                  <option value="suspended">Suspended</option>
                </select>
              </div>

              {edit.error && (
                <p className="text-xs text-red-400 font-medium">✕ {edit.error}</p>
              )}
            </div>

            <div className="mt-5 flex justify-end gap-3">
              <button
                onClick={() => setEdit((p) => ({ ...p, open: false }))}
                className="rounded-lg border border-slate-700 px-4 py-2 text-xs text-slate-400 hover:text-slate-200 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={saveEdit}
                disabled={edit.saving}
                className="rounded-lg border border-blue-500/40 bg-blue-500/15 px-6 py-2 text-xs font-semibold text-blue-300 hover:bg-blue-500/25 transition-colors disabled:opacity-50"
              >
                {edit.saving ? "Saving…" : "Save Changes"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function UsersPageWrapper() {
  return (
    <AuthGuard requiredRole="admin">
      <UsersPage />
    </AuthGuard>
  );
}
