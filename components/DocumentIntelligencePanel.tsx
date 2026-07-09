"use client";
import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabaseClient";
import { insertAuditLog } from "@/lib/auditLog";
import {
  FIELD_DEFS,
  EXTRACTABLE_TYPES,
  detectShipmentStatusFromDates,
  calculateDelayDaysFromETA,
  extractTrackingKeys,
  type ExtractionRow,
  type ExtractionSource,
  type ExtractedTrackingResult,
} from "@/lib/documentExtraction";
import { generateAndSaveSuggestions, generateAndSaveSupplierSuggestion } from "@/lib/ontologySuggestions";

// ─── Props ────────────────────────────────────────────────────────────────────

interface Props {
  jobReference: string;
  userRole:     "admin" | "service_provider" | "customer";
  actorId?:     string;
  actorName?:   string;
}

// ─── Per-extraction UI state ──────────────────────────────────────────────────

interface ItemState {
  expanded:        boolean;
  runState:        "idle" | "running" | "error";
  verifyState:     "idle" | "saving" | "done" | "error";
  rejectState:     "idle" | "saving" | "done";
  editedFields:    Record<string, string>;
  sideEffects:     string[];
  trackingResult:  ExtractedTrackingResult | null;  // set after BL/AWB verification
  exceptionState:  "idle" | "creating" | "done" | "error";
}

function defaultItemState(ex: ExtractionRow): ItemState {
  return {
    expanded:        false,
    runState:        "idle",
    verifyState:     "idle",
    rejectState:     "idle",
    editedFields:    ex.extracted_data ? { ...ex.extracted_data } : {},
    sideEffects:     [],
    trackingResult:  null,
    exceptionState:  "idle",
  };
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const STATUS_BADGE: Record<string, string> = {
  Pending:   "border-slate-700 bg-slate-800 text-slate-400",
  Extracted: "border-amber-500/30 bg-amber-500/10 text-amber-400",
  Verified:  "border-emerald-500/30 bg-emerald-500/10 text-emerald-400",
  Rejected:  "border-red-500/30 bg-red-500/10 text-red-400",
};

const STATUS_ICON: Record<string, string> = {
  Pending:   "◌",
  Extracted: "◎",
  Verified:  "✓",
  Rejected:  "✕",
};

const SOURCE_BADGE: Record<ExtractionSource, string> = {
  ai:        "border-indigo-500/30 bg-indigo-500/10 text-indigo-400",
  simulated: "border-slate-700 bg-slate-800/80 text-slate-500",
};

const SOURCE_LABEL: Record<ExtractionSource, string> = {
  ai:        "✦ AI extracted",
  simulated: "◎ Simulated",
};

const INPUT = "w-full rounded-md border border-slate-700 bg-slate-900 px-2.5 py-1.5 text-xs text-slate-100 placeholder:text-slate-600 focus:border-indigo-500/60 focus:outline-none focus:ring-1 focus:ring-indigo-500/20 transition-colors";

function confColor(c: number): string {
  if (c >= 0.9) return "text-emerald-400";
  if (c >= 0.75) return "text-amber-400";
  return "text-red-400";
}

// ─── Component ────────────────────────────────────────────────────────────────

export function DocumentIntelligencePanel({ jobReference, userRole, actorId, actorName }: Props) {
  const [extractions, setExtractions] = useState<ExtractionRow[]>([]);
  const [loading,     setLoading]     = useState(true);
  const [itemStates,  setItemStates]  = useState<Record<string, ItemState>>({});

  // ── Load ────────────────────────────────────────────────────────────────────

  async function loadExtractions() {
    const { data } = await supabase
      .from("document_extractions")
      .select("*, documents(file_name, file_path, mime_type, uploaded_by_name, uploaded_by_role)")
      .eq("job_reference", jobReference)
      .order("created_at", { ascending: false });

    const rows = (data as ExtractionRow[]) ?? [];
    setExtractions(rows);
    setLoading(false);

    setItemStates((prev) => {
      const next = { ...prev };
      for (const ex of rows) {
        if (!next[ex.id]) next[ex.id] = defaultItemState(ex);
      }
      return next;
    });
  }

  useEffect(() => { loadExtractions(); }, [jobReference]); // eslint-disable-line

  // ── State helpers ───────────────────────────────────────────────────────────

  function patchItem(id: string, patch: Partial<ItemState>) {
    setItemStates((prev) => ({ ...prev, [id]: { ...prev[id], ...patch } }));
  }

  function setField(id: string, key: string, value: string) {
    setItemStates((prev) => ({
      ...prev,
      [id]: { ...prev[id], editedFields: { ...prev[id].editedFields, [key]: value } },
    }));
  }

  function patchExtraction(id: string, patch: Partial<ExtractionRow>) {
    setExtractions((prev) => prev.map((e) => (e.id === id ? { ...e, ...patch } : e)));
  }

  // ── Run Extraction (calls API route) ────────────────────────────────────────

  async function handleRunExtraction(ex: ExtractionRow) {
    patchItem(ex.id, { runState: "running" });

    try {
      const res = await fetch("/api/document-extract", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({
          extraction_id: ex.id,
          job_reference: jobReference,
          document_type: ex.document_type,
        }),
      });

      const json = await res.json() as {
        success:    boolean;
        data?:      Record<string, string>;
        confidence?: number;
        source?:    ExtractionSource;
        error?:     string;
      };

      if (!json.success || !json.data) {
        console.error("[DocumentIntelligencePanel] extraction API error:", json.error);
        patchItem(ex.id, { runState: "error" });
        return;
      }

      patchExtraction(ex.id, {
        extracted_data:    json.data,
        confidence_score:  json.confidence ?? null,
        extraction_source: json.source ?? null,
        extraction_status: "Extracted",
      });
      patchItem(ex.id, {
        runState:     "idle",
        expanded:     true,
        editedFields: { ...json.data },
      });
    } catch (err) {
      console.error("[DocumentIntelligencePanel] fetch failed:", err);
      patchItem(ex.id, { runState: "error" });
    }
  }

  // ── Verify + post-verify side effects ───────────────────────────────────────

  async function handleVerify(ex: ExtractionRow) {
    const state = itemStates[ex.id];
    if (!state) return;
    patchItem(ex.id, { verifyState: "saving" });

    const verifiedData = state.editedFields;
    const now          = new Date().toISOString();

    // 1. Update extraction row → Verified
    const { error } = await supabase
      .from("document_extractions")
      .update({
        verified_data:     verifiedData,
        extraction_status: "Verified",
        verified_by:       actorId ?? null,
        verified_at:       now,
        updated_at:        now,
      })
      .eq("id", ex.id);

    if (error) { patchItem(ex.id, { verifyState: "error" }); return; }

    patchExtraction(ex.id, {
      verified_data:     verifiedData,
      extraction_status: "Verified",
      verified_at:       now,
    });

    // 2. Audit: verified
    await insertAuditLog({
      job_reference: jobReference,
      actor_role:    userRole,
      actor_name:    actorName ?? "Admin",
      action:        "document_extraction_verified",
      description:   `Verified extraction for ${ex.document_type}. Source: ${ex.extraction_source ?? "unknown"}.`,
      metadata:      { document_type: ex.document_type, extraction_id: ex.id },
    }).catch(() => {});

    // 3. Post-verify side effects (shipment creation, delay detection, TIP, payment)
    const { effects, tracking } = await applyVerificationSideEffects(
      ex.document_type, verifiedData, jobReference, actorName ?? "Admin", ex.confidence_score,
    );
    patchItem(ex.id, { verifyState: "done", sideEffects: effects, trackingResult: tracking });

    // 4. Ontology suggestions (TIP + secured_jobs fields)
    await generateAndSaveSuggestions(
      jobReference,
      ex.id,
      ex.document_type,
      verifiedData,
      ex.confidence_score ?? 0,
      actorName ?? "Admin",
    ).catch(() => {});

    // 5. Supplier suggestion — extract seller/shipper and create/link supplier profile
    await generateAndSaveSupplierSuggestion(
      jobReference,
      ex.id,
      ex.document_type,
      verifiedData,
      ex.confidence_score ?? 0,
      actorName ?? "Admin",
    ).catch(() => {});
  }

  // ── Reject ──────────────────────────────────────────────────────────────────

  async function handleReject(ex: ExtractionRow) {
    patchItem(ex.id, { rejectState: "saving" });
    const now = new Date().toISOString();
    const { error } = await supabase
      .from("document_extractions")
      .update({ extraction_status: "Rejected", updated_at: now })
      .eq("id", ex.id);

    if (error) { patchItem(ex.id, { rejectState: "idle" }); return; }
    patchExtraction(ex.id, { extraction_status: "Rejected" });
    patchItem(ex.id, { rejectState: "done" });
  }

  // ── Create Shipment Delay Exception ─────────────────────────────────────────

  async function handleCreateDelayException(ex: ExtractionRow, trackingResult: ExtractedTrackingResult) {
    patchItem(ex.id, { exceptionState: "creating" });

    const delayDays = trackingResult.delayDays;
    const severity  = delayDays > 5 ? "High" : "Medium";
    const now       = new Date().toISOString();

    const { error } = await supabase
      .from("job_exceptions")
      .insert({
        job_reference:           jobReference,
        exception_type:          "Shipment Delay",
        severity,
        status:                  "Open",
        description:             `Shipment is ${delayDays} day${delayDays === 1 ? "" : "s"} overdue. ETA was ${trackingResult.eta ?? "unknown"}. Detected via verified ${ex.document_type}.`,
        recommended_rescue_plan: "Contact carrier for revised ETA. Notify customer of delay. Assess impact on downstream operations and payment schedule.",
        created_by:              actorName ?? "Admin",
        created_at:              now,
        updated_at:              now,
      });

    if (error) {
      patchItem(ex.id, { exceptionState: "error" });
      return;
    }

    await insertAuditLog({
      job_reference: jobReference,
      actor_role:    userRole,
      actor_name:    actorName ?? "Admin",
      action:        "document_extraction_delay_exception_created",
      description:   `Shipment Delay exception (${severity}) created from verified ${ex.document_type}. ${delayDays} day${delayDays === 1 ? "" : "s"} overdue.`,
      metadata:      { document_type: ex.document_type, delay_days: delayDays, eta: trackingResult.eta },
    }).catch(() => {});

    patchItem(ex.id, { exceptionState: "done" });
  }

  // ── Render helpers ──────────────────────────────────────────────────────────

  function renderTrackingCard(ex: ExtractionRow, state: ItemState) {
    const { trackingResult, exceptionState } = state;
    if (!trackingResult) return null;

    const modeIcon = trackingResult.mode === "Sea Freight" ? "🚢" : "✈";
    const isDelayed = trackingResult.delayDays > 0;

    const statusBadge =
      isDelayed                           ? "border-red-500/30 bg-red-500/10 text-red-400" :
      trackingResult.status === "In Transit" ? "border-cyan-500/30 bg-cyan-500/10 text-cyan-400" :
      trackingResult.status === "Arrived"    ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-400" :
                                               "border-slate-700 bg-slate-800 text-slate-400";

    return (
      <div className="mt-3 rounded-lg border border-cyan-500/20 bg-cyan-950/20 p-3">
        {/* Header */}
        <div className="mb-2.5 flex items-center gap-2">
          <span className="text-base leading-none">{modeIcon}</span>
          <span className="text-[11px] font-semibold text-cyan-400">
            Shipment Tracking {trackingResult.action === "created" ? "Created" : "Updated"}
          </span>
          <span className={`ml-auto shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-semibold ${statusBadge}`}>
            {isDelayed ? "Delayed" : trackingResult.status}
          </span>
        </div>

        {/* Tracking keys grid */}
        {trackingResult.keys.length > 0 && (
          <div className="mb-2.5 grid grid-cols-2 gap-x-4 gap-y-1.5">
            {trackingResult.keys.map((k) => (
              <div key={k.label}>
                <p className="text-[10px] text-slate-600">{k.label}</p>
                <p className="text-[11px] font-mono text-slate-200 truncate">{k.value}</p>
              </div>
            ))}
          </div>
        )}

        {/* ETA / ETD */}
        {(trackingResult.etd || trackingResult.eta) && (
          <div className="mb-2.5 flex gap-5">
            {trackingResult.etd && (
              <div>
                <p className="text-[10px] text-slate-600">ETD</p>
                <p className="text-[11px] text-slate-300">{trackingResult.etd}</p>
              </div>
            )}
            {trackingResult.eta && (
              <div>
                <p className="text-[10px] text-slate-600">ETA</p>
                <p className={`text-[11px] ${isDelayed ? "text-red-400 font-semibold" : "text-slate-300"}`}>
                  {trackingResult.eta}
                </p>
              </div>
            )}
          </div>
        )}

        {/* Delay warning banner */}
        {isDelayed && (
          <div className="mb-2.5 rounded-md border border-red-500/30 bg-red-900/20 px-3 py-2">
            <p className="text-[11px] font-semibold text-red-400">
              ⚠ {trackingResult.delayDays} day{trackingResult.delayDays === 1 ? "" : "s"} overdue
            </p>
            <p className="mt-0.5 text-[10px] text-red-300/70">
              ETA passed on {trackingResult.eta}. A Shipment Delay exception is recommended.
            </p>
          </div>
        )}

        {/* Create delay exception button */}
        {isDelayed && exceptionState !== "done" && (
          <button
            onClick={() => handleCreateDelayException(ex, trackingResult)}
            disabled={exceptionState === "creating"}
            className="w-full rounded-md border border-red-500/30 bg-red-500/10 px-3 py-1.5 text-[11px] font-semibold text-red-400 hover:bg-red-500/20 transition-colors disabled:opacity-50"
          >
            {exceptionState === "creating" ? (
              <span className="flex items-center justify-center gap-1.5"><span className="animate-pulse">◌</span> Creating…</span>
            ) : exceptionState === "error" ? "⚠ Failed — retry" : "⚠ Create Shipment Delay Exception"}
          </button>
        )}
        {isDelayed && exceptionState === "done" && (
          <p className="text-[11px] text-emerald-400">✓ Shipment Delay exception created and logged</p>
        )}
      </div>
    );
  }

  function renderAdminItem(ex: ExtractionRow) {
    const state      = itemStates[ex.id] ?? defaultItemState(ex);
    const fieldDefs  = FIELD_DEFS[ex.document_type] ?? null;
    const canExtract = EXTRACTABLE_TYPES.has(ex.document_type);
    const fileName   = ex.documents?.file_name ?? ex.document_type;
    const src        = ex.extraction_source;

    return (
      <div key={ex.id} className="rounded-lg border border-slate-700/60 bg-slate-900/60">
        {/* Row header */}
        <div className="flex flex-wrap items-center gap-2 px-4 py-3">
          <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-semibold ${STATUS_BADGE[ex.extraction_status]}`}>
            {STATUS_ICON[ex.extraction_status]} {ex.extraction_status}
          </span>

          {/* AI / simulated badge */}
          {src && (
            <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] ${SOURCE_BADGE[src]}`}>
              {SOURCE_LABEL[src]}
            </span>
          )}

          <span className="text-xs font-medium text-slate-300">{ex.document_type}</span>
          <span className="text-xs text-slate-600 truncate flex-1">{fileName}</span>

          {ex.confidence_score !== null && (
            <span className={`text-xs font-mono ${confColor(ex.confidence_score)}`}>
              {Math.round(ex.confidence_score * 100)}% confidence
            </span>
          )}

          {/* Run extraction */}
          {ex.extraction_status === "Pending" && canExtract && (
            <button
              onClick={() => handleRunExtraction(ex)}
              disabled={state.runState === "running"}
              className="shrink-0 rounded-md border border-indigo-500/40 bg-indigo-500/10 px-2.5 py-1 text-[11px] font-medium text-indigo-300 hover:bg-indigo-500/20 transition-colors disabled:opacity-50"
            >
              {state.runState === "running" ? (
                <span className="flex items-center gap-1.5"><span className="animate-pulse">◌</span> Extracting…</span>
              ) : "▶ Run Extraction"}
            </button>
          )}
          {ex.extraction_status === "Pending" && !canExtract && (
            <span className="text-[10px] text-slate-600">Manual review only</span>
          )}
          {state.runState === "error" && (
            <span className="text-[10px] text-red-400">⚠ Extraction failed — retry</span>
          )}

          {/* Re-extract button for already-extracted rows */}
          {ex.extraction_status === "Extracted" && canExtract && (
            <button
              onClick={() => handleRunExtraction(ex)}
              disabled={state.runState === "running"}
              className="shrink-0 text-[10px] text-slate-600 hover:text-slate-400 transition-colors"
            >
              ↺ Re-extract
            </button>
          )}

          {/* Expand/collapse */}
          {(ex.extraction_status === "Extracted" || ex.extraction_status === "Verified") && fieldDefs && (
            <button
              onClick={() => patchItem(ex.id, { expanded: !state.expanded })}
              className="shrink-0 text-xs text-slate-500 hover:text-slate-300 transition-colors"
            >
              {state.expanded ? "▲ Collapse" : "▾ Review Fields"}
            </button>
          )}
        </div>

        {/* Expanded field editor — Extracted state */}
        {state.expanded && fieldDefs && ex.extraction_status === "Extracted" && (
          <div className="border-t border-slate-800/60 px-4 pb-4 pt-3">
            {src === "ai" ? (
              <p className="mb-3 text-[10px] font-semibold uppercase tracking-wider text-indigo-500/80">
                ✦ AI-extracted — review and correct before verifying
              </p>
            ) : (
              <p className="mb-3 text-[10px] font-semibold uppercase tracking-wider text-slate-600">
                Simulated extraction — edit all fields before verifying
              </p>
            )}

            <div className="grid gap-3 sm:grid-cols-2">
              {fieldDefs.map((fd) => (
                <div key={fd.key}>
                  <label className="mb-1 block text-[10px] font-medium text-slate-500">{fd.label}</label>
                  <input
                    type={fd.type === "number" ? "number" : fd.type === "date" ? "date" : "text"}
                    value={state.editedFields[fd.key] ?? ""}
                    onChange={(e) => setField(ex.id, fd.key, e.target.value)}
                    className={INPUT}
                    placeholder={fd.type === "date" ? "YYYY-MM-DD" : ""}
                  />
                </div>
              ))}
            </div>

            <div className="mt-4 flex flex-wrap items-center gap-2">
              <button
                onClick={() => handleVerify(ex)}
                disabled={state.verifyState === "saving"}
                className="rounded-md border border-emerald-500/40 bg-emerald-500/10 px-3 py-1.5 text-xs font-semibold text-emerald-300 hover:bg-emerald-500/20 transition-colors disabled:opacity-50"
              >
                {state.verifyState === "saving" ? "Saving…" : "✓ Verify & Apply"}
              </button>
              <button
                onClick={() => handleReject(ex)}
                disabled={state.rejectState === "saving"}
                className="rounded-md border border-red-500/30 bg-red-500/5 px-3 py-1.5 text-xs font-medium text-red-400 hover:bg-red-500/10 transition-colors disabled:opacity-50"
              >
                ✕ Reject
              </button>
              {state.verifyState === "error" && (
                <span className="text-[10px] text-red-400">Save failed. Retry.</span>
              )}
            </div>

            {/* Post-verify side effects toast */}
            {state.verifyState === "done" && state.sideEffects.length > 0 && (
              <div className="mt-3 rounded-lg border border-emerald-500/20 bg-emerald-950/20 p-3">
                <p className="mb-1.5 text-[10px] font-semibold text-emerald-400">✓ Applied to Nexum records:</p>
                <ul className="space-y-0.5">
                  {state.sideEffects.map((s, i) => (
                    <li key={i} className="flex items-center gap-1.5 text-[10px] text-emerald-300/80">
                      <span className="text-emerald-600">→</span> {s}
                    </li>
                  ))}
                </ul>
                {state.trackingResult && (
                  <p className="mt-2 text-[10px] text-cyan-400/80">
                    📦 Shipment tracking {state.trackingResult.action} — scroll down to the Shipment Tracking panel to view and sync.
                  </p>
                )}
              </div>
            )}
            {state.verifyState === "done" && state.sideEffects.length === 0 && (
              <p className="mt-2 text-[10px] text-emerald-500">✓ Verified. Ontology suggestions generated.</p>
            )}

            {/* Shipment tracking card (BL / AWB only) */}
            {state.verifyState === "done" && renderTrackingCard(ex, state)}
          </div>
        )}

        {/* Verified field display */}
        {state.expanded && fieldDefs && ex.extraction_status === "Verified" && ex.verified_data && (
          <div className="border-t border-slate-800/60 px-4 pb-4 pt-3">
            <p className="mb-3 text-[10px] font-semibold uppercase tracking-wider text-emerald-600">
              Verified data
              {ex.verified_at && (
                <span className="ml-2 font-normal text-slate-600 normal-case tracking-normal">
                  · {ex.verified_at.slice(0, 16).replace("T", " ")}
                </span>
              )}
            </p>

            {/* Side effects display for already-verified rows */}
            {state.sideEffects.length > 0 && (
              <div className="mb-3 rounded-lg border border-emerald-500/20 bg-emerald-950/20 p-3">
                <p className="mb-1 text-[10px] font-semibold text-emerald-400">Applied to Nexum records:</p>
                <ul className="space-y-0.5">
                  {state.sideEffects.map((s, i) => (
                    <li key={i} className="text-[10px] text-emerald-300/80">→ {s}</li>
                  ))}
                </ul>
              </div>
            )}

            {/* Shipment tracking card (BL / AWB — shown when re-expanded after verify) */}
            {renderTrackingCard(ex, state)}

            <div className="grid gap-2 sm:grid-cols-2">
              {fieldDefs.map((fd) => (
                <div key={fd.key} className="flex items-start gap-2">
                  <span className="shrink-0 mt-px text-[10px] text-emerald-600">✓</span>
                  <div className="min-w-0">
                    <p className="text-[10px] text-slate-600">{fd.label}</p>
                    <p className="text-xs text-slate-300 truncate">
                      {ex.verified_data?.[fd.key] || <span className="text-slate-700">—</span>}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  }

  function renderProviderItem(ex: ExtractionRow) {
    const fileName = ex.documents?.file_name ?? ex.document_type;
    return (
      <div key={ex.id} className="flex flex-wrap items-center gap-2 py-2.5 border-b border-slate-800/40 last:border-0">
        <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-semibold ${STATUS_BADGE[ex.extraction_status]}`}>
          {STATUS_ICON[ex.extraction_status]} {ex.extraction_status}
        </span>
        <span className="text-xs text-slate-300">{ex.document_type}</span>
        <span className="flex-1 truncate text-xs text-slate-600">{fileName}</span>
        {ex.confidence_score !== null && ex.extraction_status !== "Pending" && (
          <span className={`text-[10px] font-mono ${confColor(ex.confidence_score)}`}>
            {Math.round(ex.confidence_score * 100)}%
          </span>
        )}
        {ex.extraction_status === "Verified" && (
          <span className="text-[10px] text-emerald-500">Ontology updated</span>
        )}
      </div>
    );
  }

  function renderCustomerItem(ex: ExtractionRow) {
    const fileName  = ex.documents?.file_name ?? ex.document_type;
    const isVerified = ex.extraction_status === "Verified";
    return (
      <div key={ex.id} className="flex items-center gap-2 py-2 border-b border-slate-800/40 last:border-0">
        <span className={`shrink-0 text-[10px] ${isVerified ? "text-emerald-500" : "text-slate-600"}`}>
          {isVerified ? "✓" : "◌"}
        </span>
        <span className="text-xs text-slate-400">{ex.document_type}</span>
        <span className="flex-1 truncate text-xs text-slate-600">{fileName}</span>
        <span className={`text-[10px] ${isVerified ? "text-emerald-500" : "text-slate-600"}`}>
          {isVerified ? "Verified" : "Processing"}
        </span>
      </div>
    );
  }

  // ── Main render ─────────────────────────────────────────────────────────────

  const isAdmin    = userRole === "admin";
  const isProvider = userRole === "service_provider";

  const aiExtracted  = extractions.filter((e) => e.extraction_source === "ai").length;
  const verified     = extractions.filter((e) => e.extraction_status === "Verified").length;
  const extracted    = extractions.filter((e) => e.extraction_status === "Extracted").length;
  const pending      = extractions.filter((e) => e.extraction_status === "Pending").length;

  return (
    <section className="rounded-xl border border-slate-800 bg-slate-900/60 p-5">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-semibold text-slate-300">Document Intelligence</h2>
          {!loading && extractions.length > 0 && (
            <span className="rounded-full bg-slate-800 px-2 py-0.5 text-xs font-normal text-slate-500">
              {extractions.length}
            </span>
          )}
          {isAdmin && aiExtracted > 0 && (
            <span className="rounded-full border border-indigo-500/30 bg-indigo-500/10 px-2 py-0.5 text-[10px] text-indigo-400">
              ✦ {aiExtracted} AI
            </span>
          )}
        </div>
        {isAdmin && (
          <p className="text-[10px] text-slate-600">
            {OPENAI_API_KEY_HINT}
          </p>
        )}
        {isProvider && (
          <p className="text-[10px] text-slate-600">Read-only</p>
        )}
      </div>

      {loading ? (
        <div className="flex items-center gap-2 py-4 text-xs text-slate-600">
          <span className="animate-pulse">◌</span> Loading extractions…
        </div>
      ) : extractions.length === 0 ? (
        <div className="py-4">
          <p className="text-xs text-slate-600">No document extractions available.</p>
          {isAdmin && (
            <p className="mt-1 text-[10px] text-slate-700">
              Extractions are created automatically when documents are uploaded. Upload a trade document to begin.
            </p>
          )}
        </div>
      ) : isAdmin ? (
        <div className="flex flex-col gap-2">
          {extractions.map((ex) => renderAdminItem(ex))}
        </div>
      ) : isProvider ? (
        <div>{extractions.map((ex) => renderProviderItem(ex))}</div>
      ) : (
        <div>{extractions.map((ex) => renderCustomerItem(ex))}</div>
      )}

      {/* Summary footer */}
      {isAdmin && extractions.length > 0 && (
        <div className="mt-4 flex flex-wrap items-center gap-4 border-t border-slate-800/60 pt-3">
          {pending    > 0 && <span className="text-[10px] text-slate-600">{pending} pending</span>}
          {extracted  > 0 && <span className="text-[10px] text-amber-500">{extracted} ready to verify</span>}
          {verified   > 0 && <span className="text-[10px] text-emerald-500">{verified} verified</span>}
          {aiExtracted > 0 && <span className="text-[10px] text-indigo-400">✦ {aiExtracted} AI-extracted</span>}
        </div>
      )}
    </section>
  );
}

// ─── Hint text ────────────────────────────────────────────────────────────────
// NEXT_PUBLIC_AI_EXTRACTION_ENABLED is a public env var that tells the UI
// whether the server-side OPENAI_API_KEY is configured.
// Set it to "true" in .env.local alongside OPENAI_API_KEY.

const OPENAI_API_KEY_HINT =
  process.env.NEXT_PUBLIC_AI_EXTRACTION_ENABLED === "true"
    ? "✦ AI extraction enabled — GPT-4o"
    : "Admin · Run extraction · Verify · Apply to records";

// ─── Post-verification side effects ───────────────────────────────────────────
// Returns human-readable effect descriptions and a shipment tracking result
// (non-null only for Bill of Lading / Airway Bill with tracking keys present).

async function applyVerificationSideEffects(
  documentType:    string,
  data:            Record<string, string>,
  jobReference:    string,
  actorName:       string,
  confidenceScore: number | null,
): Promise<{ effects: string[]; tracking: ExtractedTrackingResult | null }> {
  const effects: string[] = [];
  let   tracking: ExtractedTrackingResult | null = null;
  const now = new Date().toISOString();

  // ── Bill of Lading → create / update shipment_trackings ──────────────────
  if (documentType === "Bill of Lading") {
    const patch: Record<string, string | null> = {};
    if (data.bl_number)          patch.bl_number          = data.bl_number;
    if (data.booking_number)     patch.booking_number      = data.booking_number;
    if (data.shipping_line)      patch.shipping_line       = data.shipping_line;
    if (data.vessel_name)        patch.vessel_name         = data.vessel_name;
    if (data.voyage_number)      patch.voyage_number       = data.voyage_number;
    if (data.port_of_loading)    patch.port_of_loading     = data.port_of_loading;
    if (data.port_of_discharge)  patch.port_of_discharge   = data.port_of_discharge;
    if (data.transshipment_port) patch.transshipment_port  = data.transshipment_port;
    if (data.container_number)   patch.container_number    = data.container_number;
    if (data.seal_number)        patch.seal_number         = data.seal_number;
    if (data.etd)                patch.etd                 = data.etd;
    if (data.eta)                patch.eta                 = data.eta;

    if (Object.keys(patch).length > 0) {
      const smartStatus = detectShipmentStatusFromDates(data.etd, data.eta);
      const delayDays   = calculateDelayDaysFromETA(data.eta);
      const statusPatch: Record<string, string | number> = { tracking_status: smartStatus };
      if (delayDays > 0) statusPatch.delay_days = delayDays;

      const latestLoc = data.port_of_loading || data.port_of_discharge || null;

      const { data: existing } = await supabase
        .from("shipment_trackings")
        .select("id")
        .eq("job_reference", jobReference)
        .maybeSingle();

      const action: "created" | "updated" = existing ? "updated" : "created";
      let trackingId: string | null = null;

      if (existing) {
        trackingId = (existing as { id: string }).id;
        await supabase
          .from("shipment_trackings")
          .update({
            ...patch, ...statusPatch,
            transport_mode:      "Sea Freight",
            data_source:         "Verified Document Extraction",
            confidence_score:    confidenceScore,
            latest_event:        "Tracking updated from verified Bill of Lading",
            latest_location:     latestLoc,
            next_expected_event: "Carrier tracking sync pending",
            updated_at:          now,
          })
          .eq("job_reference", jobReference);
        effects.push(`Shipment tracking updated with BL data (${Object.keys(patch).length} fields) — status: ${smartStatus}`);

        await insertAuditLog({
          job_reference: jobReference,
          actor_role:    "admin",
          actor_name:    actorName,
          action:        "shipment_tracking_updated_from_document",
          description:   `Sea Freight tracking updated from verified Bill of Lading. Status: ${smartStatus}.`,
          metadata:      { document_type: documentType, fields_applied: Object.keys(patch), status: smartStatus },
        }).catch(() => {});
      } else {
        const { data: inserted } = await supabase
          .from("shipment_trackings")
          .insert({
            job_reference:       jobReference,
            transport_mode:      "Sea Freight",
            data_source:         "Verified Document Extraction",
            confidence_score:    confidenceScore,
            latest_event:        "Tracking created from verified Bill of Lading",
            latest_location:     latestLoc,
            next_expected_event: "Carrier tracking sync pending",
            ...patch,
            ...statusPatch,
            created_at: now,
            updated_at: now,
          })
          .select("id")
          .maybeSingle();
        trackingId = (inserted as { id: string } | null)?.id ?? null;
        effects.push(`Shipment tracking created from Bill of Lading — status: ${smartStatus}`);

        await insertAuditLog({
          job_reference: jobReference,
          actor_role:    "admin",
          actor_name:    actorName,
          action:        "shipment_tracking_created_from_document",
          description:   `Sea Freight tracking created from verified Bill of Lading. Status: ${smartStatus}.`,
          metadata:      { document_type: documentType, fields_applied: Object.keys(patch), status: smartStatus, delay_days: delayDays },
        }).catch(() => {});
      }

      // Insert shipment event
      if (trackingId) {
        await supabase.from("shipment_events").insert({
          shipment_tracking_id: trackingId,
          job_reference:        jobReference,
          event_type:           "Document Verified",
          event_status:         action === "created" ? "Tracking Created" : "Tracking Updated",
          event_location:       latestLoc,
          event_time:           now,
          source:               "Document Extraction",
          description:          `Shipment tracking ${action === "created" ? "created from" : "updated via"} verified Bill of Lading.`,
          created_at:           now,
        });
      }

      if (delayDays > 0) {
        effects.push(`⚠ Shipment is ${delayDays} day${delayDays === 1 ? "" : "s"} overdue — ETA was ${data.eta}`);
      }

      const tkResult = extractTrackingKeys(documentType, data);
      if (tkResult) {
        tracking = { ...tkResult, action, delayDays, status: delayDays > 0 ? "Delayed" : smartStatus };
      }
    }
  }

  // ── Airway Bill → create / update shipment_trackings ─────────────────────
  if (documentType === "Airway Bill") {
    const patch: Record<string, string | null> = {};
    if (data.awb_number)          patch.awb_number          = data.awb_number;
    if (data.mawb_number)         patch.mawb_number         = data.mawb_number;
    if (data.hawb_number)         patch.hawb_number         = data.hawb_number;
    if (data.airline)             patch.airline             = data.airline;
    if (data.flight_number)       patch.flight_number       = data.flight_number;
    if (data.origin_airport)      patch.origin_airport      = data.origin_airport;
    if (data.destination_airport) patch.destination_airport = data.destination_airport;
    if (data.etd)                 patch.etd                 = data.etd;
    if (data.eta)                 patch.eta                 = data.eta;

    if (Object.keys(patch).length > 0) {
      const smartStatus = detectShipmentStatusFromDates(data.etd, data.eta);
      const delayDays   = calculateDelayDaysFromETA(data.eta);
      const statusPatch: Record<string, string | number> = { tracking_status: smartStatus };
      if (delayDays > 0) statusPatch.delay_days = delayDays;

      const latestLoc = data.origin_airport || data.destination_airport || null;

      const { data: existing } = await supabase
        .from("shipment_trackings")
        .select("id")
        .eq("job_reference", jobReference)
        .maybeSingle();

      const action: "created" | "updated" = existing ? "updated" : "created";
      let trackingId: string | null = null;

      if (existing) {
        trackingId = (existing as { id: string }).id;
        await supabase
          .from("shipment_trackings")
          .update({
            ...patch, ...statusPatch,
            transport_mode:      "Air Freight",
            data_source:         "Verified Document Extraction",
            confidence_score:    confidenceScore,
            latest_event:        "Tracking updated from verified Airway Bill",
            latest_location:     latestLoc,
            next_expected_event: "Airline tracking sync pending",
            updated_at:          now,
          })
          .eq("job_reference", jobReference);
        effects.push(`Shipment tracking updated with AWB data (${Object.keys(patch).length} fields) — status: ${smartStatus}`);

        await insertAuditLog({
          job_reference: jobReference,
          actor_role:    "admin",
          actor_name:    actorName,
          action:        "shipment_tracking_updated_from_document",
          description:   `Air Freight tracking updated from verified Airway Bill. Status: ${smartStatus}.`,
          metadata:      { document_type: documentType, fields_applied: Object.keys(patch), status: smartStatus },
        }).catch(() => {});
      } else {
        const { data: inserted } = await supabase
          .from("shipment_trackings")
          .insert({
            job_reference:       jobReference,
            transport_mode:      "Air Freight",
            data_source:         "Verified Document Extraction",
            confidence_score:    confidenceScore,
            latest_event:        "Tracking created from verified Airway Bill",
            latest_location:     latestLoc,
            next_expected_event: "Airline tracking sync pending",
            ...patch,
            ...statusPatch,
            created_at: now,
            updated_at: now,
          })
          .select("id")
          .maybeSingle();
        trackingId = (inserted as { id: string } | null)?.id ?? null;
        effects.push(`Shipment tracking created from Airway Bill — status: ${smartStatus}`);

        await insertAuditLog({
          job_reference: jobReference,
          actor_role:    "admin",
          actor_name:    actorName,
          action:        "shipment_tracking_created_from_document",
          description:   `Air Freight tracking created from verified Airway Bill. Status: ${smartStatus}.`,
          metadata:      { document_type: documentType, fields_applied: Object.keys(patch), status: smartStatus, delay_days: delayDays },
        }).catch(() => {});
      }

      // Insert shipment event
      if (trackingId) {
        await supabase.from("shipment_events").insert({
          shipment_tracking_id: trackingId,
          job_reference:        jobReference,
          event_type:           "Document Verified",
          event_status:         action === "created" ? "Tracking Created" : "Tracking Updated",
          event_location:       latestLoc,
          event_time:           now,
          source:               "Document Extraction",
          description:          `Shipment tracking ${action === "created" ? "created from" : "updated via"} verified Airway Bill.`,
          created_at:           now,
        });
      }

      if (delayDays > 0) {
        effects.push(`⚠ Shipment is ${delayDays} day${delayDays === 1 ? "" : "s"} overdue — ETA was ${data.eta}`);
      }

      const tkResult = extractTrackingKeys(documentType, data);
      if (tkResult) {
        tracking = { ...tkResult, action, delayDays, status: delayDays > 0 ? "Delayed" : smartStatus };
      }
    }
  }

  // ── Commercial Invoice → update trade_intelligence_profiles ───────────────
  if (documentType === "Commercial Invoice") {
    const tipPatch: Record<string, string | number> = {};
    if (data.commodity_description) tipPatch.commodity_name       = data.commodity_description;
    if (data.hs_code)               tipPatch.hs_code              = data.hs_code;
    if (data.origin_country)        tipPatch.origin_country       = data.origin_country;
    if (data.incoterm)              tipPatch.incoterm             = data.incoterm;
    if (data.invoice_value) {
      const v = parseFloat(data.invoice_value);
      if (!isNaN(v) && v > 0)      tipPatch.estimated_goods_value = v;
    }

    if (Object.keys(tipPatch).length > 0) {
      const { data: tipRow } = await supabase
        .from("trade_intelligence_profiles")
        .select("id")
        .eq("job_reference", jobReference)
        .maybeSingle();

      if (tipRow) {
        await supabase
          .from("trade_intelligence_profiles")
          .update({ ...tipPatch, updated_at: now })
          .eq("job_reference", jobReference);
        effects.push(`Trade Intelligence Profile updated (${Object.keys(tipPatch).length} fields from invoice)`);
      }
    }
  }

  // ── Payment Slip → flag payment status on secured_jobs ───────────────────
  if (documentType === "Payment Slip") {
    const amount   = parseFloat(data.amount ?? "");
    const currency = data.currency ?? "";

    if (!isNaN(amount) && amount > 0) {
      const { data: jobRow } = await supabase
        .from("secured_jobs")
        .select("payment_status, job_status, job_value, required_deposit")
        .eq("job_reference", jobReference)
        .maybeSingle();

      if (jobRow) {
        const ps = (jobRow as { payment_status: string; job_status: string; job_value: number; required_deposit: number | null }).payment_status;

        let newStatus: string | null = null;

        if (ps === "Payment Pending" || ps === "Awaiting Deposit") {
          newStatus = "Deposit Proof Uploaded";
          effects.push(`Payment status flagged as "${newStatus}" — slip detected (${currency} ${amount.toLocaleString()})`);
        } else if (ps === "Balance Pending") {
          newStatus = "Balance Proof Uploaded";
          effects.push(`Payment status flagged as "${newStatus}" — balance slip detected (${currency} ${amount.toLocaleString()})`);
        }

        if (newStatus) {
          await supabase
            .from("secured_jobs")
            .update({ payment_status: newStatus, updated_at: now })
            .eq("job_reference", jobReference);

          await insertAuditLog({
            job_reference: jobReference,
            actor_role:    "admin",
            actor_name:    actorName,
            action:        "payment_status_updated_from_document",
            description:   `Payment status updated to "${newStatus}" from verified Payment Slip. Amount: ${currency} ${amount.toLocaleString()}.`,
            metadata:      { document_type: documentType, amount, currency, previous_status: ps },
          }).catch(() => {});
        }
      }
    }
  }

  return { effects, tracking };
}
