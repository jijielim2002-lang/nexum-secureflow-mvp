"use client";

// ─── Public Invite Page — /customer/quotation-invite/[ref]?token=xxx ──────────
// Works for non-authenticated users via invite token.
// Auto-marks quotation as Viewed when token is used on a Sent quotation.

import { useState, useEffect, useCallback } from "react";
import { useParams, useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
  fmtSQStatus,
  fmtSQDate,
  fmtSQAmount,
  isQuotationExpired,
  isQuotationActionable,
  type ServiceQuotationRow,
} from "@/lib/serviceQuotation";

export default function QuotationInvitePage() {
  const { quotation_reference } = useParams<{ quotation_reference: string }>();
  const searchParams = useSearchParams();
  const router       = useRouter();
  const token        = searchParams.get("token") ?? "";

  const [q, setQ]           = useState<ServiceQuotationRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState<string | null>(null);

  const [accepting, setAccepting]       = useState(false);
  const [showReject, setShowReject]     = useState(false);
  const [rejectReason, setRejectReason] = useState("");
  const [rejecting, setRejecting]       = useState(false);
  const [confirmAccept, setConfirmAccept] = useState(false);

  // After accept
  const [acceptedJobRef, setAcceptedJobRef] = useState<string | null>(null);
  const [rejected, setRejected]             = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    if (!token) {
      setError("No invite token provided. Please use the link sent to you.");
      setLoading(false);
      return;
    }
    const res = await fetch(
      `/api/service-quotations/${quotation_reference}?token=${encodeURIComponent(token)}`,
    );
    if (res.ok) {
      const { data } = (await res.json()) as { data: ServiceQuotationRow };
      setQ(data);
    } else {
      const { error: e } = (await res.json()) as { error: string };
      setError(e ?? "Could not load quotation. The link may be invalid or expired.");
    }
    setLoading(false);
  }, [quotation_reference, token]);

  useEffect(() => { void load(); }, [load]);

  async function handleAccept() {
    if (!q) return;
    setAccepting(true);
    const res = await fetch(`/api/service-quotations/${q.quotation_reference}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body:   JSON.stringify({ action: "accept", invite_token: token }),
    });
    setAccepting(false);
    if (res.ok) {
      const { job_reference } = (await res.json()) as { job_reference: string };
      setAcceptedJobRef(job_reference);
      setConfirmAccept(false);
    } else {
      const { error: e } = (await res.json()) as { error: string };
      alert(`Failed: ${e}`);
    }
  }

  async function handleReject() {
    if (!q) return;
    setRejecting(true);
    const res = await fetch(`/api/service-quotations/${q.quotation_reference}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body:   JSON.stringify({ action: "reject", rejection_reason: rejectReason, invite_token: token }),
    });
    setRejecting(false);
    if (res.ok) {
      setShowReject(false);
      setRejected(true);
      await load();
    } else {
      const { error: e } = (await res.json()) as { error: string };
      alert(`Failed: ${e}`);
    }
  }

  const canAct  = q ? isQuotationActionable(q) : false;
  const expired = q ? isQuotationExpired(q) : false;

  // ── Success state after accept ─────────────────────────────────────────────
  if (acceptedJobRef) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center p-6">
        <div className="max-w-md w-full text-center space-y-6">
          <div className="text-6xl">✅</div>
          <h1 className="text-2xl font-bold text-emerald-400">Quotation Accepted!</h1>
          <p className="text-slate-400 text-sm leading-relaxed">
            Your acceptance has been recorded. A secured job has been created and the service provider has been notified.
          </p>
          <div className="bg-slate-900 border border-emerald-700/40 rounded-xl px-5 py-4 text-sm">
            <p className="text-slate-400 mb-1">Secured Job Reference</p>
            <p className="text-emerald-400 font-bold font-mono text-lg">{acceptedJobRef}</p>
          </div>
          <p className="text-xs text-slate-500">
            To track your job and manage payments, please log in to your Nexum account.
          </p>
          <div className="flex gap-3 justify-center">
            <Link
              href={`/login?redirect=/customer/jobs/${acceptedJobRef}`}
              className="px-5 py-2.5 rounded-xl bg-purple-600 hover:bg-purple-500 text-white text-sm font-medium transition-colors"
            >
              Log in to View Job
            </Link>
          </div>
        </div>
      </div>
    );
  }

  // ── Rejected state ─────────────────────────────────────────────────────────
  if (rejected || q?.quotation_status === "Rejected") {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center p-6">
        <div className="max-w-md w-full text-center space-y-4">
          <div className="text-5xl">❌</div>
          <h1 className="text-xl font-bold text-red-400">Quotation Rejected</h1>
          <p className="text-slate-400 text-sm">You have rejected this quotation. The service provider has been notified.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-200">
      {/* ── Minimal nav ── */}
      <nav className="border-b border-slate-800 bg-slate-900/60 backdrop-blur px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="text-sm font-bold text-purple-400">Nexum SecureFlow</span>
          <span className="text-slate-700">|</span>
          <span className="text-xs text-slate-500">Commercial Quotation</span>
        </div>
        <Link href="/login" className="text-xs text-slate-400 hover:text-slate-200">Log in →</Link>
      </nav>

      <div className="max-w-4xl mx-auto px-6 py-8 space-y-6">
        {loading ? (
          <div className="text-center py-24 text-slate-500 text-sm">Loading quotation…</div>
        ) : error ? (
          <div className="max-w-md mx-auto text-center py-24 space-y-4">
            <p className="text-red-400 text-sm">{error}</p>
            <p className="text-slate-500 text-xs">Please contact the service provider for a new invite link.</p>
          </div>
        ) : !q ? null : (
          <>
            {/* ── Intro banner ── */}
            <div className="bg-blue-900/10 border border-blue-700/30 rounded-xl px-5 py-4">
              <p className="text-sm text-blue-300 font-medium">You have received a commercial quotation</p>
              <p className="text-xs text-blue-400/70 mt-0.5">
                Review the terms below and accept or reject. No account is required to respond.
              </p>
            </div>

            {/* ── Status ── */}
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <div className="flex items-center gap-3 flex-wrap">
                  <h1 className="text-xl font-bold text-slate-100 font-mono">{q.quotation_reference}</h1>
                  {expired && <span className="text-xs text-red-400 border border-red-500/30 bg-red-500/10 rounded-full px-2 py-0.5">Expired</span>}
                  {(() => { const st = fmtSQStatus(q.quotation_status); return (
                    <span className={`text-xs px-2.5 py-0.5 rounded-full border font-medium ${st.cls}`}>{st.label}</span>
                  ); })()}
                </div>
                <p className="text-sm text-slate-400 mt-1">
                  {q.service_type ?? "—"}{q.route ? ` · ${q.route}` : ""}
                </p>
                {q.validity_until && (
                  <p className={`text-xs mt-0.5 ${expired ? "text-red-400" : "text-slate-500"}`}>
                    {expired ? "Expired on" : "Valid until"} {fmtSQDate(q.validity_until)}
                  </p>
                )}
              </div>
              <div className="text-right">
                <p className="text-2xl font-bold text-emerald-400">{fmtSQAmount(q.quoted_amount, q.currency)}</p>
                <p className="text-xs text-slate-500 mt-0.5">Total quoted amount</p>
              </div>
            </div>

            {/* ── Converted job banner ── */}
            {q.converted_job_reference && (
              <div className="bg-emerald-900/20 border border-emerald-700/40 rounded-xl px-5 py-4 text-center">
                <p className="text-sm text-emerald-400 font-semibold">This quotation has been accepted</p>
                <p className="text-xs text-slate-400 mt-1">Secured Job: <span className="font-mono text-emerald-300">{q.converted_job_reference}</span></p>
                <Link href="/login" className="inline-block mt-3 text-xs text-purple-400 hover:text-purple-300 underline">Log in to track your job →</Link>
              </div>
            )}

            {/* ── Content grid ── */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <div className="lg:col-span-2 space-y-5">

                <Card title="Service Details">
                  <dl className="grid grid-cols-2 gap-3 text-sm">
                    <DT label="Service Type"      value={q.service_type} />
                    <DT label="Incoterm"          value={q.incoterm} />
                    <DT label="Route"             value={q.route} className="col-span-2" />
                    <DT label="Cargo Description" value={q.cargo_description} className="col-span-2" />
                  </dl>
                </Card>

                {(q.scope_of_service || q.exclusions || q.assumptions) && (
                  <Card title="Scope of Service">
                    <div className="space-y-4">
                      {q.scope_of_service  && <TextBlock label="Scope" value={q.scope_of_service} />}
                      {q.exclusions        && <TextBlock label="Exclusions" value={q.exclusions} />}
                      {q.assumptions       && <TextBlock label="Assumptions" value={q.assumptions} />}
                      {q.release_condition && <TextBlock label="Release Condition" value={q.release_condition} />}
                    </div>
                  </Card>
                )}

                {q.required_documents && q.required_documents.length > 0 && (
                  <Card title="Required Documents">
                    <ul className="space-y-1.5">
                      {q.required_documents.map((doc) => (
                        <li key={doc} className="flex items-center gap-2 text-sm text-slate-300">
                          <span className="text-emerald-500 text-xs">✓</span>
                          {doc}
                        </li>
                      ))}
                    </ul>
                  </Card>
                )}

                {q.remarks && (
                  <Card title="Remarks">
                    <p className="text-sm text-slate-300 whitespace-pre-wrap">{q.remarks}</p>
                  </Card>
                )}
              </div>

              {/* Right: payment + actions */}
              <div className="space-y-5">
                <div className="bg-slate-900 border border-slate-800 rounded-xl px-5 py-4 space-y-3">
                  <p className="text-xs text-slate-500 font-medium">Payment Structure</p>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-slate-400">Total Amount</span>
                      <span className="text-emerald-400 font-bold">{fmtSQAmount(q.quoted_amount, q.currency)}</span>
                    </div>
                    {q.required_deposit > 0 && (
                      <>
                        <div className="flex justify-between">
                          <span className="text-slate-400">Deposit Due Now</span>
                          <span className="text-amber-400 font-semibold">{fmtSQAmount(q.required_deposit, q.currency)}</span>
                        </div>
                        {q.balance_amount != null && (
                          <div className="flex justify-between text-xs border-t border-slate-800 pt-2">
                            <span className="text-slate-500">Balance on Delivery</span>
                            <span className="text-slate-300">{fmtSQAmount(q.balance_amount, q.currency)}</span>
                          </div>
                        )}
                      </>
                    )}
                    {q.payment_terms && (
                      <div className="border-t border-slate-800 pt-2">
                        <p className="text-xs text-slate-500">Terms</p>
                        <p className="text-xs text-slate-300 mt-0.5">{q.payment_terms}</p>
                      </div>
                    )}
                  </div>
                </div>

                <div className="bg-slate-900 border border-slate-800 rounded-xl px-5 py-4 space-y-2 text-xs">
                  <p className="text-slate-500 font-medium">Reference</p>
                  <div className="space-y-1.5">
                    <MetaRow label="Ref"         value={q.quotation_reference} mono />
                    <MetaRow label="Sent"        value={fmtSQDate(q.sent_at)} />
                    <MetaRow label="Valid Until" value={fmtSQDate(q.validity_until)} />
                    <MetaRow label="Confirmation Window" value={`${q.delivery_confirmation_window_hours}h`} />
                  </div>
                </div>

                {/* ── Action panel ── */}
                {canAct && !expired && (
                  <div className="bg-slate-900 border border-slate-800 rounded-xl px-5 py-4 space-y-3">
                    <p className="text-xs text-slate-500 font-medium">Your Response</p>
                    {!showReject ? (
                      <div className="space-y-2">
                        <button
                          onClick={() => setConfirmAccept(true)}
                          className="w-full px-4 py-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-semibold transition-colors"
                        >
                          Accept Quotation
                        </button>
                        <button
                          onClick={() => setShowReject(true)}
                          className="w-full px-4 py-2 rounded-xl border border-red-700/40 text-red-400 hover:text-red-300 text-sm transition-colors"
                        >
                          Reject
                        </button>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        <textarea
                          rows={3}
                          value={rejectReason}
                          onChange={(e) => setRejectReason(e.target.value)}
                          placeholder="Reason for rejection (optional)"
                          className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 placeholder-slate-600 focus:outline-none focus:border-red-500 resize-none"
                        />
                        <button
                          onClick={() => void handleReject()}
                          disabled={rejecting}
                          className="w-full px-4 py-2 rounded-xl bg-red-700 hover:bg-red-600 disabled:opacity-50 text-white text-sm font-medium transition-colors"
                        >
                          {rejecting ? "Submitting…" : "Confirm Reject"}
                        </button>
                        <button
                          onClick={() => { setShowReject(false); setRejectReason(""); }}
                          className="w-full px-4 py-2 rounded-xl border border-slate-700 text-slate-400 hover:text-slate-200 text-sm transition-colors"
                        >
                          Back
                        </button>
                      </div>
                    )}
                    <p className="text-[10px] text-slate-600 leading-relaxed mt-2">
                      By accepting, you confirm your intent to engage this provider under the stated terms. A secured job will be created.
                    </p>
                  </div>
                )}

                {expired && !q.converted_job_reference && (
                  <div className="bg-red-900/10 border border-red-700/30 rounded-xl px-5 py-4 text-xs text-red-400">
                    This quotation has expired and can no longer be accepted.
                  </div>
                )}

                <div className="text-xs text-slate-600 text-center leading-relaxed">
                  Already have an account?{" "}
                  <Link href="/login" className="text-purple-400 hover:text-purple-300 underline">Log in</Link>
                  {" "}to view full job details and manage payments.
                </div>
              </div>
            </div>
          </>
        )}
      </div>

      {/* ── Accept Confirmation Modal ── */}
      {confirmAccept && q && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl p-6 max-w-md w-full space-y-4 shadow-2xl">
            <h3 className="text-lg font-bold text-slate-100">Confirm Acceptance</h3>
            <p className="text-sm text-slate-400 leading-relaxed">
              You are accepting the quotation from your service provider. A secured job will be created and the deposit of{" "}
              <strong className="text-amber-300">{fmtSQAmount(q.required_deposit, q.currency)}</strong> will be due.
            </p>
            <div className="bg-slate-800 rounded-xl px-4 py-3 space-y-1 text-sm">
              <div className="flex justify-between">
                <span className="text-slate-400">Reference</span>
                <span className="text-slate-200 font-mono">{q.quotation_reference}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Service</span>
                <span className="text-slate-200">{q.service_type ?? "—"}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Total Amount</span>
                <span className="text-emerald-400 font-bold">{fmtSQAmount(q.quoted_amount, q.currency)}</span>
              </div>
            </div>
            <div className="flex gap-3 pt-2">
              <button
                onClick={() => void handleAccept()}
                disabled={accepting}
                className="flex-1 px-4 py-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-sm font-semibold transition-colors"
              >
                {accepting ? "Processing…" : "Yes, Accept"}
              </button>
              <button
                onClick={() => setConfirmAccept(false)}
                className="flex-1 px-4 py-3 rounded-xl border border-slate-700 text-slate-400 hover:text-slate-200 text-sm transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl px-5 py-4 space-y-3">
      <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide">{title}</p>
      {children}
    </div>
  );
}

function DT({ label, value, className = "" }: { label: string; value: string | null | undefined; className?: string }) {
  return (
    <div className={className}>
      <dt className="text-xs text-slate-500">{label}</dt>
      <dd className="text-sm text-slate-200 font-medium mt-0.5">{value ?? "—"}</dd>
    </div>
  );
}

function TextBlock({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs text-slate-500 mb-1">{label}</p>
      <p className="text-sm text-slate-300 whitespace-pre-wrap leading-relaxed">{value}</p>
    </div>
  );
}

function MetaRow({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex justify-between gap-2">
      <span className="text-slate-500">{label}</span>
      <span className={`text-slate-300 text-right ${mono ? "font-mono" : ""}`}>{value}</span>
    </div>
  );
}
