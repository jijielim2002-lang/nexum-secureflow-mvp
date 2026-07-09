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

type CompanyType = "service_provider" | "customer" | "both";
type Status      = "active" | "pilot" | "suspended";

interface UnassignedUser {
  id:        string;
  full_name: string | null;
  email:     string | null;
  role:      string | null;
}

// ─── Page ─────────────────────────────────────────────────────────────────────

function NewCompanyPage() {
  const router = useRouter();

  // Basic info
  const [name,           setName]           = useState("");
  const [companyType,    setCompanyType]     = useState<CompanyType>("service_provider");
  const [email,          setEmail]           = useState("");
  const [phone,          setPhone]           = useState("");
  const [address,        setAddress]         = useState("");
  const [registrationNo, setRegistrationNo]  = useState("");
  const [country,        setCountry]         = useState("");
  const [status,         setStatus]          = useState<Status>("active");

  // Membership
  const [createMembership, setCreateMembership] = useState(false);
  const [membershipTier,   setMembershipTier]   = useState("Pilot");
  const [annualFee,        setAnnualFee]         = useState("0");
  const [jobQuota,         setJobQuota]          = useState("10");

  // Assign users
  const [unassigned,    setUnassigned]    = useState<UnassignedUser[]>([]);
  const [assignUserIds, setAssignUserIds] = useState<string[]>([]);

  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; msg: string } | null>(null);

  // Load unassigned users
  useEffect(() => {
    supabase
      .from("profiles")
      .select("id, full_name, email, role")
      .is("company_id", null)
      .order("full_name")
      .then(({ data }) => setUnassigned((data ?? []) as UnassignedUser[]));
  }, []);

  function toggleUser(id: string) {
    setAssignUserIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setResult(null);

    const { data: { session } } = await supabase.auth.getSession();
    const token = session?.access_token;
    if (!token) { setResult({ ok: false, msg: "Not authenticated" }); setSaving(false); return; }

    const res = await fetch("/api/admin/create-company", {
      method:  "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body:    JSON.stringify({
        name, companyType, email: email || undefined, phone: phone || undefined,
        address: address || undefined, registrationNo: registrationNo || undefined,
        country: country || undefined, status,
        createMembership,
        membershipTier:  createMembership ? membershipTier : undefined,
        annualFee:       createMembership ? Number(annualFee) : undefined,
        jobQuota:        createMembership ? Number(jobQuota) : undefined,
        assignUserIds,
      }),
    });

    const json = await res.json() as { success?: boolean; error?: string; companyId?: string };
    if (json.success) {
      setResult({ ok: true, msg: `Company created (${json.companyId?.slice(0, 8)}…). Redirecting…` });
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
            <Link href="/admin"       className="hover:text-slate-100 transition-colors">Dashboard</Link>
            <Link href="/admin/users" className="hover:text-slate-100 transition-colors">Users</Link>
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
            Company records are used to group users and jobs. They do not affect billing or legal status.
          </p>
        </div>
      </div>

      <main className="mx-auto max-w-xl px-6 py-10">
        <div className="mb-6">
          <Link href="/admin/users" className="text-xs text-slate-500 hover:text-slate-300 transition-colors">
            ← Back to Users
          </Link>
          <h1 className="mt-3 text-xl font-bold text-slate-100">Create Pilot Company</h1>
          <p className="mt-1 text-xs text-slate-500">
            Creates a company record and optionally a membership and assigns existing users.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">

          {/* ── Basic Info ── */}
          <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-5 space-y-4">
            <p className="text-xs font-semibold text-slate-400 border-b border-slate-800 pb-2">Company Details</p>

            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1.5">Company Name <span className="text-red-400">*</span></label>
              <input
                type="text" value={name} onChange={(e) => setName(e.target.value)} required
                placeholder="Acme Logistics Sdn Bhd"
                className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 placeholder-slate-600 focus:outline-none focus:border-blue-500/60"
              />
            </div>

            {/* Type */}
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1.5">Company Type <span className="text-red-400">*</span></label>
              <div className="flex gap-2">
                {([
                  ["service_provider", "Service Provider"],
                  ["customer",         "Customer"],
                  ["both",             "Both"],
                ] as [CompanyType, string][]).map(([val, label]) => (
                  <button
                    key={val} type="button" onClick={() => setCompanyType(val)}
                    className={`flex-1 rounded-lg border py-2 text-xs font-medium transition-colors ${
                      companyType === val
                        ? "border-blue-500/40 bg-blue-500/15 text-blue-300"
                        : "border-slate-700 bg-slate-800 text-slate-500 hover:text-slate-300"
                    }`}
                  >{label}</button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1.5">Email</label>
                <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="billing@company.com"
                  className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 placeholder-slate-600 focus:outline-none focus:border-blue-500/60" />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1.5">Phone</label>
                <input type="text" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+60 3 XXXX XXXX"
                  className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 placeholder-slate-600 focus:outline-none focus:border-blue-500/60" />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1.5">Registration No.</label>
                <input type="text" value={registrationNo} onChange={(e) => setRegistrationNo(e.target.value)} placeholder="202301012345"
                  className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 placeholder-slate-600 focus:outline-none focus:border-blue-500/60" />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1.5">Country</label>
                <input type="text" value={country} onChange={(e) => setCountry(e.target.value)} placeholder="Malaysia"
                  className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 placeholder-slate-600 focus:outline-none focus:border-blue-500/60" />
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1.5">Address</label>
              <input type="text" value={address} onChange={(e) => setAddress(e.target.value)} placeholder="Unit 5, Jalan PJU…"
                className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 placeholder-slate-600 focus:outline-none focus:border-blue-500/60" />
            </div>

            {/* Status */}
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1.5">Status</label>
              <div className="flex gap-2">
                {(["active", "pilot", "suspended"] as Status[]).map((s) => (
                  <button key={s} type="button" onClick={() => setStatus(s)}
                    className={`flex-1 rounded-lg border py-1.5 text-[10px] font-medium capitalize transition-colors ${
                      status === s
                        ? "border-blue-500/40 bg-blue-500/15 text-blue-300"
                        : "border-slate-700 bg-slate-800 text-slate-500 hover:text-slate-300"
                    }`}
                  >{s}</button>
                ))}
              </div>
            </div>
          </div>

          {/* ── Membership ── */}
          <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-5 space-y-4">
            <label className="flex items-center gap-3 cursor-pointer select-none">
              <input type="checkbox" checked={createMembership} onChange={(e) => setCreateMembership(e.target.checked)}
                className="h-3.5 w-3.5 rounded accent-blue-500" />
              <span className="text-xs font-semibold text-slate-400">Create Membership for this company</span>
            </label>

            {createMembership && (
              <div className="space-y-3 border-t border-slate-800 pt-4">
                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1.5">Tier</label>
                  <input type="text" value={membershipTier} onChange={(e) => setMembershipTier(e.target.value)}
                    placeholder="Pilot / Standard / Premium"
                    className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 placeholder-slate-600 focus:outline-none focus:border-blue-500/60" />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-slate-400 mb-1.5">Annual Fee (RM)</label>
                    <input type="number" value={annualFee} onChange={(e) => setAnnualFee(e.target.value)} min="0"
                      className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-blue-500/60" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-400 mb-1.5">Job Quota</label>
                    <input type="number" value={jobQuota} onChange={(e) => setJobQuota(e.target.value)} min="1"
                      className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-blue-500/60" />
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* ── Assign Users ── */}
          {unassigned.length > 0 && (
            <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-5 space-y-3">
              <p className="text-xs font-semibold text-slate-400 border-b border-slate-800 pb-2">
                Assign Unassigned Users <span className="font-normal text-slate-600">(optional)</span>
              </p>
              <div className="space-y-1.5 max-h-48 overflow-y-auto">
                {unassigned.map((u) => (
                  <label key={u.id} className="flex items-center gap-3 cursor-pointer select-none rounded-lg p-2 hover:bg-slate-800/40">
                    <input
                      type="checkbox"
                      checked={assignUserIds.includes(u.id)}
                      onChange={() => toggleUser(u.id)}
                      className="h-3.5 w-3.5 rounded accent-blue-500"
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs text-slate-300 truncate">{u.full_name ?? "(no name)"}</p>
                      <p className="text-[10px] text-slate-600 truncate">{u.email} · {u.role}</p>
                    </div>
                  </label>
                ))}
              </div>
            </div>
          )}

          {/* Result */}
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
              type="submit" disabled={saving}
              className="rounded-lg border border-blue-500/40 bg-blue-500/15 px-6 py-2 text-xs font-semibold text-blue-300 hover:bg-blue-500/25 transition-colors disabled:opacity-50"
            >
              {saving ? "Creating…" : "Create Company"}
            </button>
          </div>
        </form>
      </main>
    </div>
  );
}

export default function NewCompanyPageWrapper() {
  return (
    <AuthGuard requiredRole="admin">
      <NewCompanyPage />
    </AuthGuard>
  );
}
