"use client";
import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";
import {
  PAYOUT_STATUS_BADGE,
  PAYOUT_STATUS_ICON,
  canReceivePayout,
  isProfileEditable,
  type PayoutProfileRow,
  type VerificationStatus,
} from "@/lib/payoutProfile";

// ─── Props ────────────────────────────────────────────────────────────────────

interface Props {
  companyId:   string;
  role:        "admin" | "service_provider";
  actorId?:    string;
  actorRole?:  string;
  actorName?:  string;
  compact?:    boolean;  // condensed view for embedding in job pages
  onUpdate?:   () => void;
}

const PAYOUT_METHODS = ["Bank Transfer", "Payment Partner", "Manual Settlement", "Other"] as const;
const BANK_COUNTRIES  = ["Malaysia", "Singapore", "Indonesia", "Thailand", "Philippines", "Other"] as const;
const CURRENCIES      = ["RM", "SGD", "USD", "EUR", "IDR", "THB"] as const;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function Field({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
  return (
    <div>
      <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-slate-600">
        {label}
      </label>
      {children}
      {hint && <p className="mt-0.5 text-[9px] text-slate-700 italic">{hint}</p>}
    </div>
  );
}

function MetaItem({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="text-[9px] uppercase tracking-wide text-slate-600">{label}:</span>
      <span className={`text-[10px] text-slate-400 ${mono ? "font-mono" : ""}`}>{value}</span>
    </div>
  );
}

// ─── Component ────────────────────────────────────────────────────────────────

export function PayoutProfileCard({
  companyId, role, actorId, actorRole, actorName, compact = false, onUpdate,
}: Props) {
  const [profile,  setProfile]  = useState<PayoutProfileRow | null>(null);
  const [loading,  setLoading]  = useState(true);
  const [saving,   setSaving]   = useState(false);
  const [error,    setError]    = useState("");
  const [success,  setSuccess]  = useState("");
  const [editing,  setEditing]  = useState(false);
  const [confirmAction, setConfirmAction] = useState<string | null>(null);

  // Form state
  const [accountHolderName,      setAccountHolderName]      = useState("");
  const [bankName,               setBankName]               = useState("");
  const [bankCountry,            setBankCountry]            = useState("Malaysia");
  const [currency,               setCurrency]               = useState("RM");
  const [accountReferenceMasked, setAccountReferenceMasked] = useState("");
  const [payoutMethod,           setPayoutMethod]           = useState("Bank Transfer");
  const [rejectionReason,        setRejectionReason]        = useState("");
  const [remarks,                setRemarks]                = useState("");

  // ── Load ───────────────────────────────────────────────────────────────────

  const load = useCallback(async () => {
    setLoading(true);
    setError("");

    const res  = await fetch(`/api/payout-profiles?companyId=${encodeURIComponent(companyId)}`);
    const json = await res.json() as { data?: PayoutProfileRow[]; error?: string };

    // Pick the most recent non-superseded profile
    const all = json.data ?? [];
    const active = all.find((p) => !["Rejected", "Suspended"].includes(p.verification_status))
      ?? all[0]
      ?? null;

    setProfile(active);
    if (active) {
      setAccountHolderName(active.account_holder_name ?? "");
      setBankName(active.bank_name ?? "");
      setBankCountry(active.bank_country ?? "Malaysia");
      setCurrency(active.currency ?? "RM");
      setAccountReferenceMasked(active.account_reference_masked ?? "");
      setPayoutMethod(active.payout_method ?? "Bank Transfer");
      setRemarks(active.remarks ?? "");
    }

    setLoading(false);
  }, [companyId]);

  useEffect(() => { void load(); }, [load]);

  // ── Auth token ─────────────────────────────────────────────────────────────

  async function getToken(): Promise<string> {
    const { data: { session } } = await supabase.auth.getSession();
    return session?.access_token ?? "";
  }

  // ── Create profile ─────────────────────────────────────────────────────────

  async function createProfile() {
    setSaving(true);
    setError("");
    const token = await getToken();

    const res = await fetch("/api/payout-profiles", {
      method:  "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body:    JSON.stringify({ provider_company_id: companyId, actorRole, actorName }),
    });
    const json = await res.json() as { success?: boolean; error?: string; existingId?: string };

    if (json.success) {
      await load();
      setEditing(true);
    } else if (json.existingId) {
      // Profile already exists but wasn't loaded — reload
      await load();
    } else {
      setError(json.error ?? "Failed to create profile.");
    }
    setSaving(false);
  }

  // ── Save fields ────────────────────────────────────────────────────────────

  async function saveFields() {
    if (!profile) return;
    setSaving(true);
    setError("");
    setSuccess("");

    const token = await getToken();
    const res = await fetch(`/api/payout-profiles/${profile.id}`, {
      method:  "PATCH",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body:    JSON.stringify({
        action:            "update_fields",
        actorId, actorRole, actorName,
        accountHolderName:      accountHolderName || undefined,
        bankName:               bankName          || undefined,
        bankCountry:            bankCountry       || undefined,
        currency:               currency          || undefined,
        accountReferenceMasked: accountReferenceMasked || undefined,
        payoutMethod:           payoutMethod      || undefined,
      }),
    });
    const json = await res.json() as { success?: boolean; error?: string };
    if (json.success) {
      setSuccess("Details saved.");
      setEditing(false);
      await load();
    } else {
      setError(json.error ?? "Save failed.");
    }
    setSaving(false);
  }

  // ── Generic action ─────────────────────────────────────────────────────────

  async function applyAction(action: string, extra: Record<string, unknown> = {}) {
    if (!profile) return;
    setSaving(true);
    setError("");
    setSuccess("");
    setConfirmAction(null);

    const token = await getToken();
    const res = await fetch(`/api/payout-profiles/${profile.id}`, {
      method:  "PATCH",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body:    JSON.stringify({ action, actorId, actorRole, actorName, ...extra }),
    });
    const json = await res.json() as { success?: boolean; error?: string; newStatus?: string };

    if (json.success) {
      setSuccess(json.newStatus ? `Status updated to ${json.newStatus}.` : "Action applied.");
      setRejectionReason("");
      await load();
      onUpdate?.();
    } else {
      setError(json.error ?? "Action failed.");
    }
    setSaving(false);
  }

  // ── Render: compact mode (embedding in job pages) ──────────────────────────

  if (compact) {
    const canPayout = canReceivePayout(profile);
    return (
      <div className="rounded-lg border border-slate-800 bg-slate-900/60 px-4 py-3">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="text-xs">🏦</span>
            <div>
              <p className="text-[10px] font-semibold text-slate-400">Provider Payout Profile</p>
              {loading ? (
                <p className="text-[9px] text-slate-600 animate-pulse">Loading…</p>
              ) : profile ? (
                <div className="flex items-center gap-2 mt-0.5">
                  <span className={`rounded-full border px-2 py-0.5 text-[8px] font-semibold ${PAYOUT_STATUS_BADGE[profile.verification_status as VerificationStatus] ?? ""}`}>
                    {PAYOUT_STATUS_ICON[profile.verification_status as VerificationStatus]}{" "}
                    {profile.verification_status}
                  </span>
                  {profile.bank_name && (
                    <span className="text-[9px] text-slate-600">{profile.bank_name}</span>
                  )}
                  {profile.payout_method !== "Bank Transfer" && (
                    <span className="text-[9px] text-slate-600">{profile.payout_method}</span>
                  )}
                </div>
              ) : (
                <p className="text-[9px] text-red-400 mt-0.5">No payout profile — release will be blocked</p>
              )}
            </div>
          </div>

          {!canPayout && !loading && (
            <span className="rounded border border-red-500/30 bg-red-500/10 px-2 py-0.5 text-[9px] text-red-400 whitespace-nowrap">
              ⚠ Blocks release
            </span>
          )}
          {canPayout && (
            <span className="rounded border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[9px] text-emerald-400 whitespace-nowrap">
              ✓ Verified
            </span>
          )}

          {role === "admin" && (
            <Link
              href="/admin/payout-profiles"
              className="rounded border border-blue-600/40 bg-blue-600/15 px-2 py-1 text-[9px] text-blue-300 hover:bg-blue-600/25 transition-colors whitespace-nowrap"
            >
              Manage →
            </Link>
          )}
          {role === "service_provider" && (
            <Link
              href="/provider/payout-profile"
              className="rounded border border-slate-700 bg-slate-800 px-2 py-1 text-[9px] text-slate-400 hover:text-slate-200 transition-colors whitespace-nowrap"
            >
              View Profile →
            </Link>
          )}
        </div>
      </div>
    );
  }

  // ── Render: full card ──────────────────────────────────────────────────────

  const editable = isProfileEditable(profile);

  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/60">

      {/* ── Header ── */}
      <div className="flex items-center justify-between border-b border-slate-800 px-5 py-3">
        <div className="flex items-center gap-3">
          <span className="text-sm">🏦</span>
          <div>
            <p className="text-xs font-semibold text-slate-300">Provider Payout Profile</p>
            <p className="text-[10px] text-slate-600">
              Bank/payout details verified before release instructions are processed
            </p>
          </div>
        </div>
        <button
          onClick={load}
          className="rounded-lg border border-slate-700 bg-slate-800 px-2.5 py-1 text-[10px] text-slate-500 hover:text-slate-300 transition-colors"
        >↻</button>
      </div>

      {/* ── Security notice ── */}
      <div className="border-b border-slate-800 bg-slate-900/40 px-5 py-2.5">
        <p className="text-[10px] text-slate-600 leading-relaxed">
          <span className="font-semibold text-amber-600">Security Notice:</span>{" "}
          Do not enter full bank account numbers. Store only a masked reference (e.g. ****1234).
          Full payout details must be handled through secure payment/banking partner infrastructure in production.
        </p>
      </div>

      {/* ── Feedback ── */}
      {error && (
        <div className="border-b border-red-800/30 bg-red-950/20 px-5 py-2">
          <p className="text-xs text-red-400">✕ {error}</p>
        </div>
      )}
      {success && (
        <div className="border-b border-emerald-800/30 bg-emerald-950/20 px-5 py-2">
          <p className="text-xs text-emerald-400">✓ {success}</p>
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-10">
          <span className="animate-pulse text-xs text-slate-600">Loading payout profile…</span>
        </div>
      ) : !profile ? (
        /* ── No profile yet ── */
        <div className="px-5 py-8 text-center">
          <p className="text-xs text-slate-500 mb-1">No payout profile found.</p>
          <p className="text-[10px] text-slate-700 mb-4">
            {role === "service_provider"
              ? "Submit your payout details so Nexum Admin can verify them before processing releases."
              : "This provider has not created a payout profile yet."}
          </p>
          {role === "service_provider" && (
            <button
              onClick={() => void createProfile()}
              disabled={saving}
              className="rounded-lg border border-blue-600/60 bg-blue-600/20 px-4 py-2 text-xs font-semibold text-blue-300 hover:bg-blue-600/30 disabled:opacity-40"
            >
              {saving ? "Creating…" : "Create Payout Profile"}
            </button>
          )}
        </div>
      ) : (
        <div className="divide-y divide-slate-800/60">

          {/* ── Status summary ── */}
          <div className="px-5 py-4">
            <div className="flex flex-wrap items-center gap-3 mb-3">
              <span className={`rounded-full border px-2.5 py-1 text-[10px] font-semibold ${PAYOUT_STATUS_BADGE[profile.verification_status as VerificationStatus] ?? ""}`}>
                {PAYOUT_STATUS_ICON[profile.verification_status as VerificationStatus]}{" "}
                {profile.verification_status}
              </span>

              {canReceivePayout(profile) && (
                <span className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1 text-[10px] font-semibold text-emerald-400">
                  ✓ Ready to receive payout
                </span>
              )}
              {!canReceivePayout(profile) && profile.verification_status !== "Pending" && (
                <span className="rounded-full border border-red-500/30 bg-red-500/10 px-2.5 py-1 text-[10px] font-semibold text-red-400">
                  ⚠ Release instructions blocked
                </span>
              )}
            </div>

            {/* Rejection reason */}
            {profile.rejection_reason && (
              <div className="mb-3 rounded-lg border border-red-700/30 bg-red-950/20 px-3 py-2">
                <p className="text-[10px] font-semibold text-red-400">Rejection Reason:</p>
                <p className="text-xs text-red-300">{profile.rejection_reason}</p>
              </div>
            )}

            {/* Current details */}
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {profile.account_holder_name && (
                <InfoCell label="Account Holder" value={profile.account_holder_name} />
              )}
              {profile.bank_name && (
                <InfoCell label="Bank" value={profile.bank_name} />
              )}
              {profile.bank_country && (
                <InfoCell label="Country" value={profile.bank_country} />
              )}
              <InfoCell label="Currency" value={profile.currency} />
              <InfoCell label="Method" value={profile.payout_method} />
              {profile.account_reference_masked && (
                <InfoCell label="Account (Masked)" value={profile.account_reference_masked} mono />
              )}
            </div>

            {/* Admin remarks */}
            {profile.remarks && role === "admin" && (
              <div className="mt-3 flex flex-wrap gap-3">
                <MetaItem label="Admin Remarks" value={profile.remarks} />
              </div>
            )}

            {/* Timestamps */}
            <div className="mt-2 flex flex-wrap gap-4 text-[9px] text-slate-700">
              <span>Created {profile.created_at.slice(0, 10)}</span>
              {profile.verified_at && <span>Verified {profile.verified_at.slice(0, 10)}</span>}
            </div>
          </div>

          {/* ── Provider: edit form ── */}
          {role === "service_provider" && (
            <div className="px-5 py-4">
              {!editable && !editing ? (
                <div className="rounded-lg border border-slate-800 bg-slate-950/30 px-4 py-3 text-center">
                  <p className="text-[10px] text-slate-600">
                    {profile.verification_status === "Verified"
                      ? "Profile is verified. Contact Nexum Admin if details need to change."
                      : "Profile is submitted for review. Contact Nexum Admin if changes are needed."}
                  </p>
                </div>
              ) : (
                <>
                  {!editing && editable && (
                    <button
                      onClick={() => setEditing(true)}
                      className="rounded-lg border border-slate-700 bg-slate-800 px-4 py-2 text-xs text-slate-400 hover:text-slate-200 transition-colors"
                    >
                      Edit Payout Details
                    </button>
                  )}

                  {editing && (
                    <div>
                      <p className="mb-3 text-[10px] font-semibold uppercase tracking-wide text-slate-600">
                        Payout Details
                      </p>
                      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                        <Field label="Account Holder Name">
                          <input
                            type="text"
                            value={accountHolderName}
                            onChange={(e) => setAccountHolderName(e.target.value)}
                            placeholder="Name on bank account"
                            className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-200 placeholder-slate-600 focus:border-blue-500 focus:outline-none"
                          />
                        </Field>

                        <Field label="Bank Name">
                          <input
                            type="text"
                            value={bankName}
                            onChange={(e) => setBankName(e.target.value)}
                            placeholder="e.g. Maybank, CIMB, RHB"
                            className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-200 placeholder-slate-600 focus:border-blue-500 focus:outline-none"
                          />
                        </Field>

                        <Field
                          label="Account Reference (Masked)"
                          hint="IMPORTANT: Enter only a masked reference, e.g. ****1234. Never the full account number."
                        >
                          <input
                            type="text"
                            value={accountReferenceMasked}
                            onChange={(e) => setAccountReferenceMasked(e.target.value)}
                            placeholder="e.g. ****1234"
                            className="w-full rounded-lg border border-amber-700/40 bg-slate-950 px-3 py-2 text-sm text-slate-200 placeholder-slate-600 focus:border-amber-500 focus:outline-none"
                          />
                        </Field>

                        <Field label="Payout Method">
                          <select
                            value={payoutMethod}
                            onChange={(e) => setPayoutMethod(e.target.value)}
                            className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-200 focus:border-blue-500 focus:outline-none"
                          >
                            {PAYOUT_METHODS.map((m) => (
                              <option key={m} value={m}>{m}</option>
                            ))}
                          </select>
                        </Field>

                        <Field label="Bank Country">
                          <select
                            value={bankCountry}
                            onChange={(e) => setBankCountry(e.target.value)}
                            className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-200 focus:border-blue-500 focus:outline-none"
                          >
                            {BANK_COUNTRIES.map((c) => (
                              <option key={c} value={c}>{c}</option>
                            ))}
                          </select>
                        </Field>

                        <Field label="Currency">
                          <select
                            value={currency}
                            onChange={(e) => setCurrency(e.target.value)}
                            className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-200 focus:border-blue-500 focus:outline-none"
                          >
                            {CURRENCIES.map((c) => (
                              <option key={c} value={c}>{c}</option>
                            ))}
                          </select>
                        </Field>
                      </div>

                      <div className="mt-3 flex gap-2">
                        <button
                          onClick={() => void saveFields()}
                          disabled={saving}
                          className="rounded-lg border border-blue-600/60 bg-blue-600/20 px-4 py-2 text-xs font-semibold text-blue-300 hover:bg-blue-600/30 disabled:opacity-40"
                        >
                          {saving ? "Saving…" : "Save Details"}
                        </button>
                        <button
                          onClick={() => setEditing(false)}
                          className="rounded-lg border border-slate-700 bg-slate-800 px-4 py-2 text-xs text-slate-400 hover:text-slate-200"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {/* ── Provider: submit for verification ── */}
          {role === "service_provider" && editable && profile.verification_status !== "Submitted" && (
            <div className="px-5 py-4">
              {confirmAction !== "submit" ? (
                <button
                  onClick={() => setConfirmAction("submit")}
                  disabled={saving || !profile.account_holder_name || !profile.bank_name || !profile.account_reference_masked}
                  className="rounded-lg border border-emerald-600/60 bg-emerald-600/20 px-4 py-2 text-xs font-semibold text-emerald-300 hover:bg-emerald-600/30 disabled:opacity-40 transition-colors"
                >
                  Submit for Verification →
                </button>
              ) : (
                <div className="rounded-lg border border-slate-700 bg-slate-900/60 px-4 py-3">
                  <p className="mb-2 text-xs text-slate-300">
                    Confirm submission? Nexum Admin will review your payout details before releases can be processed.
                  </p>
                  <div className="flex gap-2">
                    <button
                      onClick={() => void applyAction("submit")}
                      disabled={saving}
                      className="rounded-lg border border-emerald-600/60 bg-emerald-600/20 px-3 py-1.5 text-xs font-semibold text-emerald-300 hover:bg-emerald-600/30 disabled:opacity-40"
                    >
                      {saving ? "Submitting…" : "Confirm Submit"}
                    </button>
                    <button
                      onClick={() => setConfirmAction(null)}
                      className="rounded-lg border border-slate-700 bg-slate-800 px-3 py-1.5 text-xs text-slate-400 hover:text-slate-200"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}
              {(!profile.account_holder_name || !profile.bank_name || !profile.account_reference_masked) && (
                <p className="mt-1.5 text-[9px] text-slate-700">
                  Fill in Account Holder Name, Bank Name, and Account Reference before submitting.
                </p>
              )}
            </div>
          )}

          {/* ── Admin: verify / reject / suspend ── */}
          {role === "admin" && (
            <div className="px-5 py-4">
              <p className="mb-3 text-[10px] font-semibold uppercase tracking-wide text-slate-600">
                Admin Actions
              </p>

              {/* Remarks field */}
              <div className="mb-3">
                <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-slate-600">
                  Admin Remarks (internal)
                </label>
                <input
                  type="text"
                  value={remarks}
                  onChange={(e) => setRemarks(e.target.value)}
                  placeholder="Internal notes (not shown to provider)"
                  className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-slate-200 placeholder-slate-600 focus:border-blue-500 focus:outline-none"
                />
                <button
                  onClick={() => void applyAction("add_remarks", { remarks })}
                  disabled={saving}
                  className="mt-1.5 rounded border border-slate-700 bg-slate-800 px-3 py-1 text-[10px] text-slate-400 hover:text-slate-200 disabled:opacity-40"
                >
                  Save Remarks
                </button>
              </div>

              <div className="flex flex-wrap gap-2">
                {/* Verify */}
                {profile.verification_status !== "Verified" && (
                  confirmAction === "verify" ? (
                    <ConfirmInline
                      label="Verify Profile"
                      onConfirm={() => void applyAction("verify", { remarks })}
                      onCancel={() => setConfirmAction(null)}
                      saving={saving}
                      confirmClass="border-emerald-600/60 bg-emerald-600/20 text-emerald-300 hover:bg-emerald-600/30"
                      message="Confirm verification? Provider will be notified and release instructions can proceed."
                    />
                  ) : (
                    <button
                      onClick={() => setConfirmAction("verify")}
                      className="rounded-lg border border-emerald-600/60 bg-emerald-600/20 px-3 py-1.5 text-xs font-semibold text-emerald-300 hover:bg-emerald-600/30"
                    >
                      ✓ Verify Profile
                    </button>
                  )
                )}

                {/* Reject */}
                {profile.verification_status !== "Rejected" && (
                  confirmAction === "reject" ? (
                    <div className="w-full rounded-lg border border-red-700/30 bg-red-950/20 px-4 py-3">
                      <p className="mb-2 text-xs text-red-300 font-semibold">Reject payout profile?</p>
                      <input
                        type="text"
                        value={rejectionReason}
                        onChange={(e) => setRejectionReason(e.target.value)}
                        placeholder="Rejection reason (required)"
                        className="mb-2 w-full rounded-lg border border-red-800/40 bg-slate-950 px-3 py-2 text-xs text-slate-200 placeholder-slate-600 focus:border-red-500 focus:outline-none"
                      />
                      <div className="flex gap-2">
                        <button
                          onClick={() => void applyAction("reject", { rejectionReason, remarks })}
                          disabled={saving || !rejectionReason.trim()}
                          className="rounded-lg border border-red-600/60 bg-red-600/20 px-3 py-1.5 text-xs font-semibold text-red-300 hover:bg-red-600/30 disabled:opacity-40"
                        >
                          {saving ? "Processing…" : "Confirm Reject"}
                        </button>
                        <button
                          onClick={() => { setConfirmAction(null); setRejectionReason(""); }}
                          className="rounded-lg border border-slate-700 bg-slate-800 px-3 py-1.5 text-xs text-slate-400 hover:text-slate-200"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button
                      onClick={() => setConfirmAction("reject")}
                      className="rounded-lg border border-red-600/60 bg-red-600/20 px-3 py-1.5 text-xs font-semibold text-red-300 hover:bg-red-600/30"
                    >
                      ✕ Reject
                    </button>
                  )
                )}

                {/* Suspend */}
                {profile.verification_status !== "Suspended" && (
                  confirmAction === "suspend" ? (
                    <ConfirmInline
                      label="Suspend Profile"
                      onConfirm={() => void applyAction("suspend", { remarks })}
                      onCancel={() => setConfirmAction(null)}
                      saving={saving}
                      confirmClass="border-red-800/60 bg-red-800/20 text-red-400 hover:bg-red-800/30"
                      message="Suspend? All release instructions for this provider will be blocked."
                    />
                  ) : (
                    <button
                      onClick={() => setConfirmAction("suspend")}
                      className="rounded-lg border border-red-800/40 bg-red-800/20 px-3 py-1.5 text-xs font-semibold text-red-400 hover:bg-red-800/30"
                    >
                      ⛔ Suspend
                    </button>
                  )
                )}
              </div>
            </div>
          )}

        </div>
      )}
    </div>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function InfoCell({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="rounded-lg border border-slate-800 bg-slate-950/40 px-3 py-2">
      <p className="text-[9px] uppercase tracking-wide text-slate-600 mb-0.5">{label}</p>
      <p className={`text-xs text-slate-300 ${mono ? "font-mono" : ""}`}>{value}</p>
    </div>
  );
}

function ConfirmInline({
  label, message, onConfirm, onCancel, saving, confirmClass,
}: {
  label:        string;
  message:      string;
  onConfirm:    () => void;
  onCancel:     () => void;
  saving:       boolean;
  confirmClass: string;
}) {
  return (
    <div className="w-full rounded-lg border border-slate-700 bg-slate-900/60 px-4 py-3">
      <p className="mb-2 text-xs text-slate-300">{message}</p>
      <div className="flex gap-2">
        <button
          onClick={onConfirm}
          disabled={saving}
          className={`rounded-lg border px-3 py-1.5 text-xs font-semibold disabled:opacity-40 ${confirmClass}`}
        >
          {saving ? "Processing…" : `Confirm ${label}`}
        </button>
        <button
          onClick={onCancel}
          className="rounded-lg border border-slate-700 bg-slate-800 px-3 py-1.5 text-xs text-slate-400 hover:text-slate-200"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
