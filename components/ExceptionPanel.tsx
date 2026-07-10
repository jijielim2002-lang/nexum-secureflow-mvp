"use client";
import { useState, useEffect, useRef, useCallback } from "react";
import { supabase } from "@/lib/supabaseClient";
import { insertAuditLog } from "@/lib/auditLog";
import {
  EXCEPTION_TYPES,
  EXCEPTION_STATUSES,
  SEVERITIES,
  SEVERITY_BADGE,
  STATUS_BADGE,
  TYPE_ICON,
  autoSuggestExceptions,
  deriveExceptionTypeFromAction,
  severityFromRisk,
  appendNote,
  isOverdue,
  isActive,
  type ExceptionRow,
  type ExceptionJobContext,
  type TIPContext,
  type SuggestedExceptionDraft,
} from "@/lib/exceptions";

// ─── Props ────────────────────────────────────────────────────────────────────

interface Props {
  jobReference: string;
  userRole:     "admin" | "service_provider" | "customer";
  job:          ExceptionJobContext;
  actorId?:     string;
  actorName?:   string;
}

// ─── Form state ───────────────────────────────────────────────────────────────

interface CreateForm {
  exception_type:          string;
  severity:                string;
  description:             string;
  root_cause:              string;
  recommended_rescue_plan: string;
  assigned_to_role:        string;
  assigned_to_name:        string;
  due_date:                string;
}

const EMPTY_FORM: CreateForm = {
  exception_type: "", severity: "Medium", description: "", root_cause: "",
  recommended_rescue_plan: "", assigned_to_role: "provider", assigned_to_name: "", due_date: "",
};

// ─── Per-exception UI state ───────────────────────────────────────────────────

interface ItemState {
  expanded:    boolean;
  note:        string;
  noteState:   "idle" | "saving" | "done" | "error";
  statusState: "idle" | "saving";
  editMode:    boolean;
  editForm:    Partial<CreateForm>;
  editState:   "idle" | "saving" | "error";
}

function defaultItemState(ex: ExceptionRow): ItemState {
  return {
    expanded: false, note: "", noteState: "idle", statusState: "idle",
    editMode: false, editForm: {}, editState: "idle",
  };
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const INPUT  = "w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-600 focus:border-blue-500/60 focus:outline-none focus:ring-1 focus:ring-blue-500/20 transition-colors";
const SELECT = `${INPUT} cursor-pointer`;
const LABEL  = "block text-xs font-medium text-slate-400 mb-1.5";
const TA     = `${INPUT} resize-none`;

// ─── Component ────────────────────────────────────────────────────────────────

export function ExceptionPanel({ jobReference, userRole, job, actorId, actorName }: Props) {
  const [exceptions,   setExceptions]   = useState<ExceptionRow[]>([]);
  const [tip,          setTip]          = useState<TIPContext | null>(null);
  const [loading,      setLoading]      = useState(true);
  const [itemStates,   setItemStates]   = useState<Record<string, ItemState>>({});
  const [suggestions,  setSuggestions]  = useState<SuggestedExceptionDraft[]>([]);
  const [showForm,     setShowForm]     = useState(false);
  const [form,         setForm]         = useState<CreateForm>(EMPTY_FORM);
  const [createState,  setCreateState]  = useState<"idle" | "saving" | "error">("idle");
  const [createError,  setCreateError]  = useState("");
  const formRef = useRef<HTMLDivElement>(null);
  const actor   = actorName ?? (userRole === "admin" ? "Nexum Admin" : userRole === "service_provider" ? "Service Provider" : "Customer");
  const isAdmin    = userRole === "admin";
  const isProvider = userRole === "service_provider";

  // ── Load ──────────────────────────────────────────────────────────────────

  const load = useCallback(async () => {
    const [excRes, tipRes] = await Promise.all([
      supabase
        .from("job_exceptions")
        .select("*")
        .eq("job_reference", jobReference)
        .order("created_at", { ascending: false }),
      isAdmin
        ? supabase
            .from("trade_intelligence_profiles")
            .select("document_risk_level,route_risk_level,payment_risk_level,overall_trade_risk,inventory_urgency,estimated_margin,estimated_selling_price,rescue_plan,recommended_action")
            .eq("job_reference", jobReference)
            .maybeSingle()
        : Promise.resolve({ data: null }),
    ]);

    const rows = (excRes.data as ExceptionRow[]) ?? [];
    const tipData = tipRes.data as TIPContext | null;

    setExceptions(rows);
    setTip(tipData);
    setLoading(false);

    // Item states
    setItemStates((prev) => {
      const next = { ...prev };
      for (const e of rows) { if (!next[e.id]) next[e.id] = defaultItemState(e); }
      return next;
    });

    // Auto-suggest (admin only)
    if (isAdmin) {
      const existingTypes = new Set(rows.map((e) => e.exception_type));
      setSuggestions(autoSuggestExceptions(job, tipData, existingTypes));
    }
  }, [jobReference, isAdmin, job]); // eslint-disable-line

  useEffect(() => { load(); }, [load]);

  // ── Helpers ───────────────────────────────────────────────────────────────

  function patchItem(id: string, patch: Partial<ItemState>) {
    setItemStates((prev) => ({ ...prev, [id]: { ...prev[id], ...patch } }));
  }

  function patchRow(id: string, patch: Partial<ExceptionRow>) {
    setExceptions((prev) => prev.map((e) => (e.id === id ? { ...e, ...patch } : e)));
  }

  function setF(field: keyof CreateForm, value: string) {
    setForm((p) => ({ ...p, [field]: value }));
  }

  function prefillForm(draft: SuggestedExceptionDraft) {
    setForm({
      ...EMPTY_FORM,
      exception_type:          draft.exception_type,
      severity:                draft.severity,
      description:             draft.description,
      recommended_rescue_plan: draft.recommended_rescue_plan,
    });
    setShowForm(true);
    setTimeout(() => formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 80);
  }

  function prefillFromDecisionBrief() {
    if (!tip) return;
    const action   = tip.recommended_action ?? "";
    const exType   = deriveExceptionTypeFromAction(action);
    const severity = severityFromRisk(tip.overall_trade_risk ?? null);
    setForm({
      ...EMPTY_FORM,
      exception_type:          exType,
      severity,
      description:             action,
      recommended_rescue_plan: tip.rescue_plan ?? "",
    });
    setShowForm(true);
    setTimeout(() => formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 80);
  }

  // ── Create ────────────────────────────────────────────────────────────────

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!form.exception_type || !form.description.trim()) {
      setCreateError("Exception type and description are required.");
      return;
    }
    setCreateState("saving");
    setCreateError("");
    const now = new Date().toISOString();
    const payload = {
      job_reference:           jobReference,
      exception_type:          form.exception_type,
      severity:                form.severity,
      description:             form.description.trim(),
      root_cause:              form.root_cause.trim() || null,
      recommended_rescue_plan: form.recommended_rescue_plan.trim() || null,
      assigned_to_role:        form.assigned_to_role || null,
      assigned_to_name:        form.assigned_to_name.trim() || null,
      due_date:                form.due_date || null,
      status:                  "Open",
      created_by:              actorId ?? null,
      created_at:              now,
      updated_at:              now,
    };
    const { data, error } = await supabase.from("job_exceptions").insert(payload).select().single();
    if (error) { setCreateState("error"); setCreateError(error.message); return; }

    const newRow = data as ExceptionRow;
    setExceptions((prev) => [newRow, ...prev]);
    setItemStates((prev) => ({ ...prev, [newRow.id]: defaultItemState(newRow) }));
    setSuggestions((prev) => prev.filter((s) => s.exception_type !== newRow.exception_type));
    setForm(EMPTY_FORM);
    setShowForm(false);
    setCreateState("idle");

    insertAuditLog({
      job_reference: jobReference, actor_role: "admin", actor_name: actor,
      action: "exception_created",
      description: `Exception created: ${form.exception_type} (${form.severity}).`,
      metadata:    { exception_type: form.exception_type, severity: form.severity },
    }).catch(() => {});
  }

  // ── Status update (admin) ─────────────────────────────────────────────────

  async function handleStatusChange(ex: ExceptionRow, newStatus: string) {
    patchItem(ex.id, { statusState: "saving" });
    const now = new Date().toISOString();
    const patch: Record<string, unknown> = { status: newStatus, updated_at: now };
    if (newStatus === "Resolved")  patch.resolved_at = now;
    if (newStatus === "Closed")    patch.resolved_at  = patch.resolved_at ?? now;

    const { error } = await supabase.from("job_exceptions").update(patch).eq("id", ex.id);
    if (error) { patchItem(ex.id, { statusState: "idle" }); return; }
    patchRow(ex.id, patch as Partial<ExceptionRow>);
    patchItem(ex.id, { statusState: "idle" });

    insertAuditLog({
      job_reference: jobReference, actor_role: "admin", actor_name: actor,
      action: "exception_status_updated",
      description: `Exception "${ex.exception_type}" status changed to ${newStatus}.`,
    }).catch(() => {});
  }

  // ── Edit save (admin) ─────────────────────────────────────────────────────

  async function handleEditSave(ex: ExceptionRow) {
    const st = itemStates[ex.id];
    if (!st) return;
    patchItem(ex.id, { editState: "saving" });
    const now = new Date().toISOString();
    const ef = st.editForm;
    const update: Record<string, unknown> = { updated_at: now };
    if (ef.description             !== undefined) update.description             = ef.description.trim();
    if (ef.root_cause              !== undefined) update.root_cause              = ef.root_cause.trim() || null;
    if (ef.recommended_rescue_plan !== undefined) update.recommended_rescue_plan = ef.recommended_rescue_plan.trim() || null;
    if (ef.severity                !== undefined) update.severity                = ef.severity;
    if (ef.assigned_to_role        !== undefined) update.assigned_to_role        = ef.assigned_to_role || null;
    if (ef.assigned_to_name        !== undefined) update.assigned_to_name        = ef.assigned_to_name.trim() || null;
    if (ef.due_date                !== undefined) update.due_date                = ef.due_date || null;
    if (ef.recommended_rescue_plan !== undefined) {
      insertAuditLog({
        job_reference: jobReference, actor_role: "admin", actor_name: actor,
        action: "rescue_plan_updated",
        description: `Rescue plan updated for exception: ${ex.exception_type}.`,
      }).catch(() => {});
    }
    const { error } = await supabase.from("job_exceptions").update(update).eq("id", ex.id);
    if (error) { patchItem(ex.id, { editState: "error" }); return; }
    patchRow(ex.id, update as Partial<ExceptionRow>);
    patchItem(ex.id, { editMode: false, editState: "idle", editForm: {} });
  }

  // ── Add note (provider / customer / admin) ────────────────────────────────

  async function handleAddNote(ex: ExceptionRow, markComplete: boolean) {
    const st = itemStates[ex.id];
    if (!st?.note.trim()) return;
    patchItem(ex.id, { noteState: "saving" });
    const now = new Date().toISOString();
    const updatedNote = appendNote(ex.resolution_note, st.note, userRole, actor);
    const patch: Record<string, unknown> = { resolution_note: updatedNote, updated_at: now };
    if (markComplete && ex.status === "Rescue Plan Active") patch.status = "In Review";

    const { error } = await supabase.from("job_exceptions").update(patch).eq("id", ex.id);
    if (error) { patchItem(ex.id, { noteState: "error" }); return; }
    patchRow(ex.id, patch as Partial<ExceptionRow>);
    patchItem(ex.id, { note: "", noteState: "done" });
    setTimeout(() => patchItem(ex.id, { noteState: "idle" }), 2000);

    if (markComplete) {
      insertAuditLog({
        job_reference: jobReference, actor_role: userRole, actor_name: actor,
        action: "exception_status_updated",
        description: `Provider marked action complete on exception: ${ex.exception_type}.`,
      }).catch(() => {});
    }
  }

  // ── Badge counts ──────────────────────────────────────────────────────────

  const openCount     = exceptions.filter((e) => isActive(e)).length;
  const criticalCount = exceptions.filter((e) => e.severity === "Critical" && isActive(e)).length;
  const overdueCount  = exceptions.filter((e) => isOverdue(e)).length;

  // ── Render: admin exception card ──────────────────────────────────────────

  function renderAdminCard(ex: ExceptionRow) {
    const st = itemStates[ex.id] ?? defaultItemState(ex);
    const ef = st.editForm;
    const overdue = isOverdue(ex);

    return (
      <div key={ex.id} className={`rounded-lg border ${overdue ? "border-red-500/30" : "border-slate-700/60"} bg-slate-900/50`}>
        {/* Header */}
        <button
          type="button"
          className="flex w-full flex-wrap items-center gap-2 px-4 py-3 text-left"
          onClick={() => patchItem(ex.id, { expanded: !st.expanded })}
        >
          <span className="shrink-0 text-base">{TYPE_ICON[ex.exception_type] ?? "●"}</span>
          <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-semibold ${SEVERITY_BADGE[ex.severity]}`}>
            {ex.severity}
          </span>
          <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] ${STATUS_BADGE[ex.status]}`}>
            {ex.status}
          </span>
          <span className="text-xs font-medium text-slate-200">{ex.exception_type}</span>
          {overdue && <span className="text-[10px] text-red-400">⚠ Overdue</span>}
          {ex.due_date && !overdue && (
            <span className="text-[10px] text-slate-600">Due: {ex.due_date}</span>
          )}
          <span className="ml-auto text-xs text-slate-600">{st.expanded ? "▲" : "▾"}</span>
        </button>

        {/* Expanded body */}
        {st.expanded && (
          <div className="border-t border-slate-800/60 px-4 pb-4 pt-3 space-y-3">
            {!st.editMode ? (
              <>
                {ex.description && (
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-600 mb-1">Description</p>
                    <p className="text-xs text-slate-300 leading-relaxed">{ex.description}</p>
                  </div>
                )}
                {ex.root_cause && (
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-600 mb-1">Root Cause</p>
                    <p className="text-xs text-slate-400 leading-relaxed">{ex.root_cause}</p>
                  </div>
                )}
                {ex.recommended_rescue_plan && (
                  <div className="rounded-lg border border-orange-500/20 bg-orange-500/5 px-3 py-2.5">
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-orange-600 mb-1">Rescue Plan</p>
                    <p className="text-xs text-orange-300 leading-relaxed">{ex.recommended_rescue_plan}</p>
                  </div>
                )}
                {ex.resolution_note && (
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-600 mb-1">Activity Log</p>
                    <pre className="whitespace-pre-wrap text-[10px] text-slate-500 font-mono leading-relaxed">{ex.resolution_note}</pre>
                  </div>
                )}
                <div className="flex flex-wrap items-center gap-2 border-t border-slate-800/40 pt-3">
                  {/* Status change */}
                  <select
                    value={ex.status}
                    onChange={(e) => handleStatusChange(ex, e.target.value)}
                    disabled={st.statusState === "saving"}
                    className="rounded-md border border-slate-700 bg-slate-800 px-2 py-1 text-xs text-slate-300 focus:outline-none disabled:opacity-50"
                  >
                    {EXCEPTION_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
                  </select>
                  <button
                    type="button"
                    onClick={() => patchItem(ex.id, { editMode: true, editForm: {
                      description: ex.description ?? "",
                      root_cause: ex.root_cause ?? "",
                      recommended_rescue_plan: ex.recommended_rescue_plan ?? "",
                      severity: ex.severity,
                      assigned_to_role: ex.assigned_to_role ?? "",
                      assigned_to_name: ex.assigned_to_name ?? "",
                      due_date: ex.due_date ?? "",
                    }})}
                    className="rounded-md border border-slate-700 bg-slate-800 px-2.5 py-1 text-xs text-slate-400 hover:text-slate-200 transition-colors"
                  >
                    ✎ Edit
                  </button>
                  {ex.assigned_to_name && (
                    <span className="text-[10px] text-slate-600">
                      Assigned: {ex.assigned_to_name} ({ex.assigned_to_role})
                    </span>
                  )}
                </div>
              </>
            ) : (
              /* Edit form */
              <div className="space-y-3">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-600">Editing Exception</p>
                <div>
                  <label className={LABEL}>Description</label>
                  <textarea rows={3} className={TA} value={ef.description ?? ""}
                    onChange={(e) => patchItem(ex.id, { editForm: { ...ef, description: e.target.value } })} />
                </div>
                <div>
                  <label className={LABEL}>Root Cause</label>
                  <textarea rows={2} className={TA} value={ef.root_cause ?? ""}
                    onChange={(e) => patchItem(ex.id, { editForm: { ...ef, root_cause: e.target.value } })} />
                </div>
                <div>
                  <label className={LABEL}>Rescue Plan</label>
                  <textarea rows={3} className={TA} value={ef.recommended_rescue_plan ?? ""}
                    onChange={(e) => patchItem(ex.id, { editForm: { ...ef, recommended_rescue_plan: e.target.value } })} />
                </div>
                <div className="grid gap-3 sm:grid-cols-3">
                  <div>
                    <label className={LABEL}>Severity</label>
                    <select className={SELECT} value={ef.severity ?? ex.severity}
                      onChange={(e) => patchItem(ex.id, { editForm: { ...ef, severity: e.target.value } })}>
                      {SEVERITIES.map((s) => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className={LABEL}>Assigned Role</label>
                    <select className={SELECT} value={ef.assigned_to_role ?? ""}
                      onChange={(e) => patchItem(ex.id, { editForm: { ...ef, assigned_to_role: e.target.value } })}>
                      <option value="">Unassigned</option>
                      <option value="admin">Admin</option>
                      <option value="provider">Provider</option>
                      <option value="customer">Customer</option>
                    </select>
                  </div>
                  <div>
                    <label className={LABEL}>Due Date</label>
                    <input type="date" className={INPUT} value={ef.due_date ?? ""}
                      onChange={(e) => patchItem(ex.id, { editForm: { ...ef, due_date: e.target.value } })} />
                  </div>
                </div>
                <div>
                  <label className={LABEL}>Assigned To</label>
                  <input type="text" className={INPUT} value={ef.assigned_to_name ?? ""}
                    onChange={(e) => patchItem(ex.id, { editForm: { ...ef, assigned_to_name: e.target.value } })}
                    placeholder="Person or team name" />
                </div>
                <div className="flex gap-2">
                  <button type="button" onClick={() => handleEditSave(ex)} disabled={st.editState === "saving"}
                    className="rounded-md border border-emerald-500/40 bg-emerald-500/10 px-3 py-1.5 text-xs font-medium text-emerald-300 hover:bg-emerald-500/20 transition-colors disabled:opacity-50">
                    {st.editState === "saving" ? "Saving…" : "Save Changes"}
                  </button>
                  <button type="button" onClick={() => patchItem(ex.id, { editMode: false, editForm: {} })}
                    className="rounded-md border border-slate-700 bg-slate-800 px-3 py-1.5 text-xs text-slate-400 hover:text-slate-200 transition-colors">
                    Cancel
                  </button>
                  {st.editState === "error" && <span className="text-[10px] text-red-400">Save failed</span>}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    );
  }

  // ── Render: provider card ─────────────────────────────────────────────────

  function renderProviderCard(ex: ExceptionRow) {
    const st = itemStates[ex.id] ?? defaultItemState(ex);
    return (
      <div key={ex.id} className="rounded-lg border border-slate-700/60 bg-slate-900/50">
        <button type="button" className="flex w-full flex-wrap items-center gap-2 px-4 py-3 text-left"
          onClick={() => patchItem(ex.id, { expanded: !st.expanded })}>
          <span className="shrink-0 text-base">{TYPE_ICON[ex.exception_type] ?? "●"}</span>
          <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-semibold ${SEVERITY_BADGE[ex.severity]}`}>{ex.severity}</span>
          <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] ${STATUS_BADGE[ex.status]}`}>{ex.status}</span>
          <span className="text-xs font-medium text-slate-200">{ex.exception_type}</span>
          {ex.assigned_to_role === "provider" && (
            <span className="text-[10px] text-purple-400">→ Assigned to you</span>
          )}
          <span className="ml-auto text-xs text-slate-600">{st.expanded ? "▲" : "▾"}</span>
        </button>
        {st.expanded && (
          <div className="border-t border-slate-800/60 px-4 pb-4 pt-3 space-y-3">
            {ex.description && <p className="text-xs text-slate-300">{ex.description}</p>}
            {ex.recommended_rescue_plan && (
              <div className="rounded-lg border border-orange-500/20 bg-orange-500/5 px-3 py-2.5">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-orange-600 mb-1">Rescue Plan</p>
                <p className="text-xs text-orange-300 leading-relaxed">{ex.recommended_rescue_plan}</p>
              </div>
            )}
            {ex.resolution_note && (
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-600 mb-1">Activity Log</p>
                <pre className="whitespace-pre-wrap text-[10px] text-slate-500 font-mono">{ex.resolution_note}</pre>
              </div>
            )}
            {isActive(ex) && (
              <div className="border-t border-slate-800/40 pt-3 space-y-2">
                <label className={LABEL}>Add Operational Update</label>
                <textarea rows={2} className={TA} value={st.note}
                  onChange={(e) => patchItem(ex.id, { note: e.target.value })}
                  placeholder="Describe the action taken or current status update…" />
                <div className="flex flex-wrap gap-2">
                  <button type="button" onClick={() => handleAddNote(ex, false)}
                    disabled={!st.note.trim() || st.noteState === "saving"}
                    className="rounded-md border border-slate-700 bg-slate-800 px-2.5 py-1 text-xs text-slate-300 hover:bg-slate-700 transition-colors disabled:opacity-50">
                    {st.noteState === "saving" ? "Saving…" : "Add Update"}
                  </button>
                  {ex.status === "Rescue Plan Active" && (
                    <button type="button" onClick={() => handleAddNote(ex, true)}
                      disabled={!st.note.trim() || st.noteState === "saving"}
                      className="rounded-md border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1 text-xs text-emerald-300 hover:bg-emerald-500/20 transition-colors disabled:opacity-50">
                      ✓ Mark My Action Complete
                    </button>
                  )}
                  {st.noteState === "done" && <span className="text-[10px] text-emerald-400">Update saved.</span>}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    );
  }

  // ── Render: customer card ─────────────────────────────────────────────────

  function renderCustomerCard(ex: ExceptionRow) {
    const st = itemStates[ex.id] ?? defaultItemState(ex);
    const statusText: Record<string, string> = {
      "Open":               "Under review by Nexum",
      "In Review":          "Being investigated",
      "Rescue Plan Active": "Rescue plan in progress",
      "Resolved":           "Resolved",
      "Closed":             "Closed",
    };
    return (
      <div key={ex.id} className="rounded-lg border border-slate-700/60 bg-slate-900/50">
        <button type="button" className="flex w-full flex-wrap items-center gap-2 px-4 py-3 text-left"
          onClick={() => patchItem(ex.id, { expanded: !st.expanded })}>
          <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-semibold ${SEVERITY_BADGE[ex.severity]}`}>{ex.severity}</span>
          <span className="text-xs font-medium text-slate-200">{ex.exception_type}</span>
          <span className="text-xs text-slate-500">· {statusText[ex.status] ?? ex.status}</span>
          <span className="ml-auto text-xs text-slate-600">{st.expanded ? "▲" : "▾"}</span>
        </button>
        {st.expanded && (
          <div className="border-t border-slate-800/60 px-4 pb-4 pt-3 space-y-3">
            {ex.description && <p className="text-xs text-slate-400">{ex.description}</p>}
            {ex.recommended_rescue_plan && (
              <div className="rounded-lg border border-blue-500/20 bg-blue-500/5 px-3 py-2.5">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-blue-600 mb-1">What is being done</p>
                <p className="text-xs text-blue-300 leading-relaxed">{ex.recommended_rescue_plan}</p>
              </div>
            )}
            {isActive(ex) && (
              <div className="border-t border-slate-800/40 pt-3 space-y-2">
                <label className={LABEL}>Add a Note</label>
                <textarea rows={2} className={TA} value={st.note}
                  onChange={(e) => patchItem(ex.id, { note: e.target.value })}
                  placeholder="Any information that might help resolve this issue…" />
                <button type="button" onClick={() => handleAddNote(ex, false)}
                  disabled={!st.note.trim() || st.noteState === "saving"}
                  className="rounded-md border border-slate-700 bg-slate-800 px-2.5 py-1 text-xs text-slate-300 hover:bg-slate-700 transition-colors disabled:opacity-50">
                  {st.noteState === "saving" ? "Sending…" : "Send Note"}
                </button>
                {st.noteState === "done" && <span className="text-[10px] text-emerald-400">Note added.</span>}
              </div>
            )}
          </div>
        )}
      </div>
    );
  }

  // ── Main render ───────────────────────────────────────────────────────────

  return (
    <section className="rounded-xl border border-slate-800 bg-slate-900/60 p-5">
      {/* Header */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <h2 className="text-sm font-semibold text-slate-300">Exception & Rescue Plan</h2>
        {openCount > 0 && (
          <span className="rounded-full border border-blue-500/30 bg-blue-500/10 px-2 py-0.5 text-[10px] font-medium text-blue-400">
            {openCount} open
          </span>
        )}
        {criticalCount > 0 && (
          <span className="rounded-full border border-red-700/50 bg-red-800/20 px-2 py-0.5 text-[10px] font-bold text-red-300">
            ⛔ {criticalCount} critical
          </span>
        )}
        {overdueCount > 0 && (
          <span className="rounded-full border border-red-500/30 bg-red-500/10 px-2 py-0.5 text-[10px] font-medium text-red-400">
            ⚠ {overdueCount} overdue
          </span>
        )}
        {isAdmin && (
          <button
            type="button"
            onClick={() => { setShowForm((v) => !v); setForm(EMPTY_FORM); }}
            className="ml-auto rounded-md border border-slate-700 bg-slate-800 px-2.5 py-1 text-xs text-slate-400 hover:text-slate-100 transition-colors"
          >
            {showForm ? "✕ Cancel" : "+ New Exception"}
          </button>
        )}
      </div>

      {loading ? (
        <p className="flex items-center gap-2 text-xs text-slate-600 py-3">
          <span className="animate-pulse">◌</span> Loading exceptions…
        </p>
      ) : (
        <>
          {/* Decision Brief integration (admin only) */}
          {isAdmin && tip && (tip.recommended_action || tip.rescue_plan) && (
            <div className="mb-4 flex items-start gap-3 rounded-lg border border-indigo-500/20 bg-indigo-500/5 px-4 py-3">
              <span className="text-indigo-400 mt-0.5 shrink-0">✦</span>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold text-indigo-300">Decision Brief has active recommendations</p>
                <p className="mt-0.5 text-[10px] text-slate-500 truncate">{tip.recommended_action}</p>
              </div>
              <button
                type="button"
                onClick={prefillFromDecisionBrief}
                className="shrink-0 rounded-md border border-indigo-500/40 bg-indigo-500/15 px-2.5 py-1 text-[11px] font-medium text-indigo-300 hover:bg-indigo-500/25 transition-colors"
              >
                Create Exception from Brief
              </button>
            </div>
          )}

          {/* Auto-suggestions (admin only) */}
          {isAdmin && suggestions.length > 0 && (
            <div className="mb-4">
              <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-slate-600">
                Suggested Exceptions ({suggestions.length})
              </p>
              <div className="flex flex-col gap-1.5">
                {suggestions.map((s) => (
                  <div key={s.exception_type}
                    className="flex flex-wrap items-center gap-2 rounded-lg border border-amber-500/20 bg-amber-500/5 px-3 py-2.5">
                    <span className="text-sm shrink-0">{TYPE_ICON[s.exception_type] ?? "●"}</span>
                    <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-semibold ${SEVERITY_BADGE[s.severity]}`}>{s.severity}</span>
                    <span className="text-xs text-slate-300">{s.exception_type}</span>
                    <span className="flex-1 truncate text-[10px] text-slate-600">{s.description}</span>
                    <button
                      type="button"
                      onClick={() => prefillForm(s)}
                      className="shrink-0 rounded-md border border-amber-500/30 bg-amber-500/10 px-2.5 py-1 text-[11px] text-amber-300 hover:bg-amber-500/20 transition-colors"
                    >
                      Create →
                    </button>
                  </div>
                ))}
            </div>
          </div>
          )}

          {/* Create form (admin only) */}
          {isAdmin && showForm && (
            <div ref={formRef} className="mb-4 rounded-lg border border-slate-700/80 bg-slate-900/80 p-4">
              <p className="mb-4 text-xs font-semibold text-slate-300">New Exception</p>
              <form onSubmit={handleCreate} noValidate className="space-y-3">
                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <label className={LABEL}>Exception Type <span className="text-red-500">*</span></label>
                    <select className={SELECT} value={form.exception_type}
                      onChange={(e) => setF("exception_type", e.target.value)} required>
                      <option value="">Select type</option>
                      {EXCEPTION_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className={LABEL}>Severity</label>
                    <select className={SELECT} value={form.severity}
                      onChange={(e) => setF("severity", e.target.value)}>
                      {SEVERITIES.map((s) => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </div>
                </div>
                <div>
                  <label className={LABEL}>Description <span className="text-red-500">*</span></label>
                  <textarea rows={3} className={TA} value={form.description}
                    onChange={(e) => setF("description", e.target.value)}
                    placeholder="What is the exception? What impact does it have?" required />
                </div>
                <div>
                  <label className={LABEL}>Root Cause</label>
                  <textarea rows={2} className={TA} value={form.root_cause}
                    onChange={(e) => setF("root_cause", e.target.value)}
                    placeholder="Why did this happen?" />
                </div>
                <div>
                  <label className={LABEL}>Rescue Plan</label>
                  <textarea rows={3} className={TA} value={form.recommended_rescue_plan}
                    onChange={(e) => setF("recommended_rescue_plan", e.target.value)}
                    placeholder="Step-by-step rescue actions…" />
                </div>
                <div className="grid gap-3 sm:grid-cols-3">
                  <div>
                    <label className={LABEL}>Assign to Role</label>
                    <select className={SELECT} value={form.assigned_to_role}
                      onChange={(e) => setF("assigned_to_role", e.target.value)}>
                      <option value="">Unassigned</option>
                      <option value="admin">Admin</option>
                      <option value="provider">Provider</option>
                      <option value="customer">Customer</option>
                    </select>
                  </div>
                  <div>
                    <label className={LABEL}>Assigned To</label>
                    <input type="text" className={INPUT} value={form.assigned_to_name}
                      onChange={(e) => setF("assigned_to_name", e.target.value)}
                      placeholder="Name or team" />
                  </div>
                  <div>
                    <label className={LABEL}>Due Date</label>
                    <input type="date" className={INPUT} value={form.due_date}
                      onChange={(e) => setF("due_date", e.target.value)} />
                  </div>
                </div>
                {createError && <p className="text-xs text-red-400">{createError}</p>}
                <div className="flex gap-2 pt-1">
                  <button type="submit" disabled={createState === "saving"}
                    className="rounded-lg border border-blue-500/40 bg-blue-500/15 px-4 py-2 text-xs font-semibold text-blue-300 hover:bg-blue-500/25 transition-colors disabled:opacity-50">
                    {createState === "saving" ? "Creating…" : "Create Exception"}
                  </button>
                  <button type="button" onClick={() => setShowForm(false)}
                    className="rounded-lg border border-slate-700 bg-slate-900 px-4 py-2 text-xs text-slate-400 hover:text-slate-100 transition-colors">
                    Cancel
                  </button>
                </div>
              </form>
            </div>
          )}

          {/* Exception list */}
          {exceptions.length === 0 ? (
            <p className="text-xs text-slate-600 py-2">
              {isAdmin ? "No exceptions recorded for this job." : "No exceptions affecting your role at this time."}
            </p>
          ) : (
            <div className="flex flex-col gap-2">
              {exceptions.map((ex) =>
                isAdmin    ? renderAdminCard(ex)
                : isProvider ? renderProviderCard(ex)
                : renderCustomerCard(ex)
              )}
            </div>
          )}
        </>
      )}
    </section>
  );
}
