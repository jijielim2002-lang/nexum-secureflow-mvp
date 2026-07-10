"use client";
import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { useAuth } from "@/contexts/AuthContext";
import { LogoutButton } from "@/components/LogoutButton";
import { NotificationBell } from "@/components/NotificationBell";
import { AuthGuard } from "@/components/AuthGuard";

// ─── Types ────────────────────────────────────────────────────────────────────

interface CompanyOption { id: string; name: string; company_type: string; }

type Role = "admin" | "service_provider" | "customer";

const ROLE_LABELS: Record<Role, string> = {
  admin:            "Admin",
  service_provider: "Service Provider",
  customer:         "Customer",
};

// ─── Page ─────────────────────────────────────────────────────────────────────

function NewUserPage() {
  const router   = useRouter();
  const { profile } = useAuth();

  const [email,      setEmail]      = useState("");
  const [password,   setPassword]   = useState("");
  const [fullName,   setFullName]   = useState("");
  const [role,       setRole]       = useState<Role>("customer");
  const [companyId,  setCompanyId]  = useState("");
  const [sendInvite, setSendInvite] = useState(true);
  const [companies,  setCompanies]  = useState<CompanyOption[]>([]);
  const [saving,     setSaving]     = useState(false);
  const [result,     setResult]     = useState<{ ok: boolean; msg: string } | null>(null);

  // Load companies for dropdown
  useEffect(() => {
    supabase
      .from("companies")
      .select("id, name, company_type")
      .eq("is_active", true)
      .order("name")
      .then(({ data }) => setCompanies((data ?? []) as CompanyOption[]));
  }, []);

  // Filter companies by role
  const filteredCompanies = companies.filter((c) => {
    if (role === "service_provider") return c.company_type === "service_provider" || c.company_type === "both";
    if (role === "customer")         return c.company_type === "customer"         || c.company_type === "both";
    return true; // admin can be linked to any
  });

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setResult(null);

    const { data: { session } } = await supabase.auth.getSession();
    const token = session?.access_token;
    if (!token) { setResult({ ok: false, msg: "Not authenticated" }); setSaving(false); return; }

    const res = await fetch("/api/admin/create-user", {
      method:  "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body:    JSON.stringify({ email, password, fullName, role, companyId: companyId || undefined, sendInvite }),
    });

    const json = await res.json() as { success?: boolean; error?: string; userId?: string };
    if (json.success) {
      setResult({ ok: true, msg: `User created (${json.userId?.slice(0, 8)}…). Redirecting…` });
      setTimeout(() => router.push("/admin/users"), 1500);
    } else {
      setResult({ ok: false, msg: json.error ?? "Unknown error" });
      setSaving(false);
    }
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 font-sans">

      {/* Header */}
      <header className="border-b border-slate-800 bg-slate-950/80 sticky top-0 z-50">
        <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-6">
          <Link href="/" className="flex items-center gap-2 text-sm font-semibold">
            <span className="text-blue-400">&#9632;</span> Nexum SecureFlow
          </Link>
          <nav className="flex items-center gap-4 text-xs text-slate-400">
            <span className="rounded-full border border-blue-500/30 bg-blue-500/10 px-3 py-1 text-blue-400 font-medium">Admin</span>
            <Link href="/admin"        className="hover:text-slate-100 transition-colors">Dashboard</Link>
            <Link href="/admin/users"  className="hover:text-slate-100 transition-colors">Users</Link>
            <NotificationBell />
            <LogoutButton />
          </nav>
        </div>
      </header>

      {/* Pilot banner */}
      <div className="border-b border-amber-500/20 bg-amber-950/10">
        <div className="mx-auto max-w-5xl px-6 py-2.5 flex items-center gap-2">
          <span className="text-amber-400 text-xs">⚠</span>
          <p className="text-xs text-amber-300/80">
            <span className="font-semibold text-amber-300">Pilot Mode</span>
            {" — "}
            Creating real auth accounts. Passwords are set immediately; users can log in right away.
            Share credentials securely.
          </p>
        </div>
      </div>

      <main className="mx-auto max-w-xl px-6 py-10">
        <div className="mb-6">
          <Link href="/admin/users" className="text-xs text-slate-500 hover:text-slate-300 transition-colors">
            ← Back to Users
          </Link>
          <h1 className="mt-3 text-xl font-bold text-slate-100">Create Pilot User</h1>
          <p className="mt-1 text-xs text-slate-500">
            Creates a Supabase auth account and profile. The user can log in immediately.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-5 space-y-4">

            {/* Full name */}
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1.5">Full Name <span className="text-red-400">*</span></label>
              <input
                type="text"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                required
                placeholder="Jane Smith"
                className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 placeholder-slate-600 focus:outline-none focus:border-blue-500/60"
              />
            </div>

            {/* Email */}
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1.5">Email Address <span className="text-red-400">*</span></label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                placeholder="jane@example.com"
                className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 placeholder-slate-600 focus:outline-none focus:border-blue-500/60"
              />
            </div>

            {/* Password */}
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1.5">Initial Password <span className="text-red-400">*</span></label>
              <input
                type="text"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={8}
                placeholder="min. 8 characters"
                className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 placeholder-slate-600 font-mono focus:outline-none focus:border-blue-500/60"
              />
              <p className="mt-1 text-[10px] text-slate-600">Shown in plain text here for pilot setup. Share securely.</p>
            </div>

            {/* Role */}
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1.5">Role <span className="text-red-400">*</span></label>
              <div className="flex gap-2">
                {(["customer", "service_provider", "admin"] as Role[]).map((r) => (
                  <button
                    key={r}
                    type="button"
                    onClick={() => { setRole(r); setCompanyId(""); }}
                    className={`flex-1 rounded-lg border py-2 text-xs font-medium transition-colors ${
                      role === r
                        ? "border-blue-500/40 bg-blue-500/15 text-blue-300"
                        : "border-slate-700 bg-slate-800 text-slate-500 hover:text-slate-300"
                    }`}
                  >
                    {ROLE_LABELS[r]}
                  </button>
                ))}
              </div>
            </div>

            {/* Company */}
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1.5">Linked Company <span className="text-slate-600">(optional)</span></label>
              <select
                value={companyId}
                onChange={(e) => setCompanyId(e.target.value)}
                className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-300 focus:outline-none focus:border-blue-500/60"
              >
                <option value="">— No company —</option>
                {filteredCompanies.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
              {filteredCompanies.length === 0 && (
                <p className="mt-1 text-[10px] text-slate-600">
                  No companies of type matching "{role.replace("_", " ")}" yet.{" "}
                  <Link href="/admin/companies/new" className="text-blue-400 hover:text-blue-300">Create one →</Link>
                </p>
              )}
            </div>

            {/* Invite email */}
            <label className="flex items-center gap-3 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={sendInvite}
                onChange={(e) => setSendInvite(e.target.checked)}
                className="h-3.5 w-3.5 rounded border-slate-600 bg-slate-800 accent-blue-500"
              />
              <span className="text-xs text-slate-400">
                Send welcome email with credentials
                <span className="ml-1 text-slate-600">(requires RESEND_API_KEY)</span>
              </span>
            </label>
          </div>

          {/* Result banner */}
          {result && (
            <div className={`rounded-lg border px-4 py-3 text-xs font-medium ${
              result.ok
                ? "border-emerald-500/30 bg-emerald-950/20 text-emerald-300"
                : "border-red-500/30 bg-red-950/20 text-red-300"
            }`}>
              {result.ok ? "✓ " : "✕ "}{result.msg}
            </div>
          )}

          {/* Actions */}
          <div className="flex items-center justify-end gap-3">
            <Link
              href="/admin/users"
              className="rounded-lg border border-slate-700 bg-slate-800 px-4 py-2 text-xs text-slate-400 hover:text-slate-200 transition-colors"
            >
              Cancel
            </Link>
            <button
              type="submit"
              disabled={saving}
              className="rounded-lg border border-blue-500/40 bg-blue-500/15 px-6 py-2 text-xs font-semibold text-blue-300 hover:bg-blue-500/25 transition-colors disabled:opacity-50"
            >
              {saving ? "Creating…" : "Create User"}
            </button>
          </div>
        </form>
      </main>
    </div>
  );
}

export default function NewUserPageWrapper() {
  return (
    <AuthGuard requiredRole="admin">
      <NewUserPage />
    </AuthGuard>
  );
}
