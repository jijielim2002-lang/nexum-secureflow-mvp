"use client";
import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useAuth } from "@/contexts/AuthContext";
import { LogoutButton } from "@/components/LogoutButton";
import { AuthGuard } from "@/components/AuthGuard";

// ─── Types ────────────────────────────────────────────────────────────────────

interface TeamMember {
  id:          string;
  user_id:     string | null;
  email:       string | null;
  role:        string;
  status:      string;
  invited_by:  string | null;
  approved_by: string | null;
  approved_at: string | null;
  created_at:  string;
  updated_at:  string;
}

// ─── Colour maps ──────────────────────────────────────────────────────────────

const statusColors: Record<string, string> = {
  Active:    "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
  Pending:   "bg-amber-500/15  text-amber-400  border-amber-500/30",
  Suspended: "bg-red-500/15    text-red-400    border-red-500/30",
  Removed:   "bg-slate-700     text-slate-500  border-slate-600",
};

const roleColors: Record<string, string> = {
  "Company Admin":   "text-purple-400",
  Finance:           "text-blue-400",
  Manager:           "text-sky-400",
  Operations:        "text-teal-400",
  "Document Clerk":  "text-slate-300",
  User:              "text-slate-400",
  Viewer:            "text-slate-500",
};

const ROLES = ["Company Admin", "Finance", "Manager", "Operations", "Document Clerk", "User", "Viewer"];
const STATUSES = ["Active", "Pending", "Suspended", "Removed"];

// ─── Permission matrix (display only) ────────────────────────────────────────

const PERMISSION_MATRIX: Record<string, string[]> = {
  "Company Admin":  ["Create jobs", "Edit jobs", "Approve payments", "Manage team", "View all", "Upload docs", "Extract docs"],
  Finance:          ["Approve payments", "View jobs", "View reports", "Upload payment slips"],
  Manager:          ["Create jobs", "Edit jobs", "View all", "Upload docs"],
  Operations:       ["Create jobs", "View jobs", "Upload docs", "Track milestones"],
  "Document Clerk": ["Upload docs", "Extract docs", "View jobs (own)"],
  User:             ["View jobs (own)", "Upload docs (own)"],
  Viewer:           ["View jobs (read-only)"],
};

// ─── Page ─────────────────────────────────────────────────────────────────────

function TeamPageInner() {
  const { profile } = useAuth();
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState<string | null>(null);

  // Invite modal
  const [showInvite,    setShowInvite]    = useState(false);
  const [inviteEmail,   setInviteEmail]   = useState("");
  const [inviteRole,    setInviteRole]    = useState("User");
  const [inviting,      setInviting]      = useState(false);
  const [inviteError,   setInviteError]   = useState<string | null>(null);

  // Edit modal
  const [editMember,    setEditMember]    = useState<TeamMember | null>(null);
  const [editRole,      setEditRole]      = useState("");
  const [editStatus,    setEditStatus]    = useState("");
  const [saving,        setSaving]        = useState(false);

  // Permission matrix modal
  const [showMatrix,    setShowMatrix]    = useState(false);

  function getToken() {
    try {
      const s = localStorage.getItem("supabase.auth.token");
      return s ? (JSON.parse(s) as { access_token?: string }).access_token ?? "" : "";
    } catch { return ""; }
  }

  const fetchMembers = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const token = getToken();
      const res  = await fetch("/api/company/users", {
        headers: { Authorization: "Bearer " + token },
      });
      const json = await res.json() as { ok?: boolean; users?: TeamMember[]; error?: string };
      if (!json.ok) throw new Error(json.error ?? "Failed to load team");
      setMembers(json.users ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void fetchMembers(); }, [fetchMembers]);

  async function handleInvite() {
    if (!inviteEmail.trim()) { setInviteError("Email is required"); return; }
    setInviting(true);
    setInviteError(null);
    try {
      const token = getToken();
      const res   = await fetch("/api/company/users", {
        method:  "POST",
        headers: { Authorization: "Bearer " + token, "Content-Type": "application/json" },
        body:    JSON.stringify({ email: inviteEmail.trim(), role: inviteRole }),
      });
      const json = await res.json() as { ok?: boolean; error?: string };
      if (!json.ok) throw new Error(json.error ?? "Invite failed");
      setShowInvite(false);
      setInviteEmail("");
      setInviteRole("User");
      await fetchMembers();
    } catch (e) {
      setInviteError(e instanceof Error ? e.message : String(e));
    } finally {
      setInviting(false);
    }
  }

  async function handleSaveEdit() {
    if (!editMember) return;
    setSaving(true);
    try {
      const token = getToken();
      const res   = await fetch("/api/company/users?id=" + editMember.id, {
        method:  "PATCH",
        headers: { Authorization: "Bearer " + token, "Content-Type": "application/json" },
        body:    JSON.stringify({ role: editRole, status: editStatus }),
      });
      const json = await res.json() as { ok?: boolean; error?: string };
      if (!json.ok) throw new Error(json.error ?? "Save failed");
      setEditMember(null);
      await fetchMembers();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("Remove this member from the team? This cannot be undone.")) return;
    try {
      const token = getToken();
      await fetch("/api/company/users?id=" + id, {
        method:  "DELETE",
        headers: { Authorization: "Bearer " + token },
      });
      await fetchMembers();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  const activeCount    = members.filter(m => m.status === "Active").length;
  const pendingCount   = members.filter(m => m.status === "Pending").length;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 font-sans">
      {/* Header */}
      <header className="border-b border-slate-800 bg-slate-950/80 sticky top-0 z-50">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-6">
          <Link href="/" className="flex items-center gap-2 text-sm font-semibold">
            <span className="text-blue-400">&#9632;</span> Nexum SecureFlow
          </Link>
          <nav className="flex items-center gap-4 text-xs text-slate-400">
            <span className="rounded-full border border-purple-500/30 bg-purple-500/10 px-3 py-1 text-purple-400 font-medium">Provider</span>
            <Link href="/provider"           className="hover:text-slate-100 transition-colors">Dashboard</Link>
            <Link href="/provider/jobs"      className="hover:text-slate-100 transition-colors">Jobs</Link>
            <Link href="/provider/customers" className="hover:text-slate-100 transition-colors">Customers</Link>
            <Link href="/provider/team"      className="text-slate-100 font-medium">Team</Link>
            <LogoutButton />
          </nav>
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl px-6 py-10">
        {/* Title + actions */}
        <div className="mb-8 flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-50">Team Management</h1>
            <p className="mt-1 text-sm text-slate-400">
              {profile?.company_name} · {activeCount} active · {pendingCount} pending
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowMatrix(true)}
              className="rounded-lg border border-slate-700 bg-slate-800 px-4 py-2 text-xs text-slate-300 hover:bg-slate-700 transition-colors"
            >
              Role permissions
            </button>
            <button
              onClick={() => { setShowInvite(true); setInviteError(null); }}
              className="rounded-lg border border-purple-500/40 bg-purple-500/15 px-4 py-2 text-sm font-semibold text-purple-300 hover:bg-purple-500/25 transition-colors"
            >
              + Invite member
            </button>
          </div>
        </div>

        {/* Error banner */}
        {error && (
          <div className="mb-6 rounded-xl border border-red-500/30 bg-red-500/5 px-5 py-3 text-sm text-red-300">
            {error}
          </div>
        )}

        {/* Loading */}
        {loading && (
          <div className="py-20 text-center">
            <div className="inline-block h-7 w-7 animate-spin rounded-full border-2 border-purple-500 border-t-transparent mb-4" />
            <p className="text-sm text-slate-400">Loading team…</p>
          </div>
        )}

        {/* Members table */}
        {!loading && (
          <div className="overflow-x-auto rounded-xl border border-slate-800">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-800 bg-slate-900 text-left text-xs text-slate-500">
                  <th className="px-4 py-3">Email</th>
                  <th className="px-4 py-3">Role</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Invited</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {members.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-4 py-12 text-center text-sm text-slate-600">
                      No team members yet. Invite someone to get started.
                    </td>
                  </tr>
                ) : (
                  members.map(m => (
                    <tr key={m.id} className="bg-slate-900/40 hover:bg-slate-900 transition-colors">
                      <td className="px-4 py-3 text-xs text-slate-200">{m.email ?? "—"}</td>
                      <td className={`px-4 py-3 text-xs font-medium ${roleColors[m.role] ?? "text-slate-400"}`}>
                        {m.role}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`rounded-full border px-2 py-0.5 text-xs font-medium ${statusColors[m.status] ?? "bg-slate-800 text-slate-400 border-slate-700"}`}>
                          {m.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-500">
                        {new Date(m.created_at).toLocaleDateString("en-MY", { day: "numeric", month: "short", year: "numeric" })}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => { setEditMember(m); setEditRole(m.role); setEditStatus(m.status); }}
                            className="rounded border border-slate-700 bg-slate-800 px-2 py-1 text-xs text-slate-300 hover:bg-slate-700 transition-colors"
                          >
                            Edit
                          </button>
                          <button
                            onClick={() => void handleDelete(m.id)}
                            className="rounded border border-red-500/30 bg-red-500/5 px-2 py-1 text-xs text-red-400 hover:bg-red-500/15 transition-colors"
                          >
                            Remove
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

      {/* Invite modal */}
      {showInvite && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4">
          <div className="w-full max-w-md rounded-2xl border border-slate-700 bg-slate-900 p-6">
            <h2 className="mb-5 text-base font-bold text-slate-100">Invite Team Member</h2>
            <div className="space-y-4">
              <div>
                <label className="mb-1.5 block text-xs text-slate-400">Email address</label>
                <input
                  type="email"
                  value={inviteEmail}
                  onChange={e => setInviteEmail(e.target.value)}
                  placeholder="colleague@company.com"
                  className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 placeholder-slate-600 focus:border-purple-500 focus:outline-none"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-xs text-slate-400">Role</label>
                <select
                  value={inviteRole}
                  onChange={e => setInviteRole(e.target.value)}
                  className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 focus:border-purple-500 focus:outline-none"
                >
                  {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
                </select>
                {inviteRole && (
                  <p className="mt-2 text-xs text-slate-500">
                    Permissions: {(PERMISSION_MATRIX[inviteRole] ?? []).join(", ")}
                  </p>
                )}
              </div>
              {inviteError && <p className="text-xs text-red-400">{inviteError}</p>}
              <div className="flex gap-3 pt-2">
                <button
                  onClick={() => setShowInvite(false)}
                  className="flex-1 rounded-lg border border-slate-700 bg-slate-800 py-2 text-sm text-slate-300 hover:bg-slate-700 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={() => void handleInvite()}
                  disabled={inviting}
                  className="flex-1 rounded-lg bg-purple-600 py-2 text-sm font-semibold text-white hover:bg-purple-500 disabled:opacity-50 transition-colors"
                >
                  {inviting ? "Inviting…" : "Send invite"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Edit modal */}
      {editMember && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4">
          <div className="w-full max-w-md rounded-2xl border border-slate-700 bg-slate-900 p-6">
            <h2 className="mb-1 text-base font-bold text-slate-100">Edit Member</h2>
            <p className="mb-5 text-xs text-slate-400">{editMember.email}</p>
            <div className="space-y-4">
              <div>
                <label className="mb-1.5 block text-xs text-slate-400">Role</label>
                <select
                  value={editRole}
                  onChange={e => setEditRole(e.target.value)}
                  className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 focus:border-purple-500 focus:outline-none"
                >
                  {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
                </select>
              </div>
              <div>
                <label className="mb-1.5 block text-xs text-slate-400">Status</label>
                <select
                  value={editStatus}
                  onChange={e => setEditStatus(e.target.value)}
                  className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 focus:border-purple-500 focus:outline-none"
                >
                  {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              <div className="flex gap-3 pt-2">
                <button
                  onClick={() => setEditMember(null)}
                  className="flex-1 rounded-lg border border-slate-700 bg-slate-800 py-2 text-sm text-slate-300 hover:bg-slate-700 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={() => void handleSaveEdit()}
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

      {/* Permission matrix modal */}
      {showMatrix && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4">
          <div className="w-full max-w-lg rounded-2xl border border-slate-700 bg-slate-900 p-6 max-h-[80vh] overflow-y-auto">
            <div className="mb-5 flex items-center justify-between">
              <h2 className="text-base font-bold text-slate-100">Role Permission Matrix</h2>
              <button onClick={() => setShowMatrix(false)} className="text-slate-500 hover:text-slate-300 text-lg">✕</button>
            </div>
            <div className="space-y-4">
              {ROLES.map(role => (
                <div key={role} className="rounded-lg border border-slate-800 bg-slate-800/40 p-4">
                  <p className={`mb-2 text-sm font-semibold ${roleColors[role] ?? "text-slate-300"}`}>{role}</p>
                  <div className="flex flex-wrap gap-1.5">
                    {(PERMISSION_MATRIX[role] ?? []).map(perm => (
                      <span key={perm} className="rounded-full bg-slate-700 px-2 py-0.5 text-xs text-slate-300">
                        {perm}
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function TeamPage() {
  return (
    <AuthGuard requiredRole="service_provider">
      <TeamPageInner />
    </AuthGuard>
  );
}
