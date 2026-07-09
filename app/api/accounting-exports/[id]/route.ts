// ─── GET  /api/accounting-exports/[id] — fetch single export (with payload)
// ─── PATCH /api/accounting-exports/[id] — mark_exported | cancel | regenerate

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { insertAuditLogWithClient } from "@/lib/auditLog";
import {
  AE_AUDIT_ACTIONS,
  VALID_ACTIONS_BY_STATUS,
  type ExportStatus,
  type ExportAction,
} from "@/lib/accountingExport";
import { buildExportPayloadFromJob } from "@/lib/accountingExportEngine";

const svc = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

// ── Auth helper ───────────────────────────────────────────────────────────────

interface CallerInfo {
  userId:    string;
  role:      string;
  fullName:  string;
  companyId: string | null;
}

async function getCaller(req: NextRequest): Promise<CallerInfo | null> {
  const token = req.headers.get("Authorization")?.replace("Bearer ", "");
  if (!token) return null;
  const { data: { user } } = await svc.auth.getUser(token);
  if (!user) return null;
  const { data: p } = await svc
    .from("profiles")
    .select("role, full_name, company_id")
    .eq("id", user.id)
    .single();
  if (!p) return null;
  return { userId: user.id, role: p.role, fullName: p.full_name, companyId: p.company_id ?? null };
}

// ── GET ───────────────────────────────────────────────────────────────────────

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  const caller  = await getCaller(req);
  if (!caller) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data, error } = await svc
    .from("accounting_exports")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (error)  return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data)  return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Scope check for non-admins
  if (caller.role !== "admin" && caller.companyId) {
    if (data.company_id !== caller.companyId && data.counterparty_company_id !== caller.companyId) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  }

  return NextResponse.json({ data });
}

// ── PATCH ─────────────────────────────────────────────────────────────────────

export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const { id }  = await context.params;
  const caller  = await getCaller(req);
  if (!caller) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (caller.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body   = await req.json().catch(() => ({}));
  const { action } = body as { action?: ExportAction };

  if (!action) return NextResponse.json({ error: "action is required" }, { status: 400 });

  // Fetch current record
  const { data: current, error: fetchErr } = await svc
    .from("accounting_exports")
    .select("id, export_reference, export_status, export_type, job_reference")
    .eq("id", id)
    .maybeSingle();

  if (fetchErr) return NextResponse.json({ error: fetchErr.message }, { status: 500 });
  if (!current) return NextResponse.json({ error: "Export not found" }, { status: 404 });

  const currentStatus = current.export_status as ExportStatus;
  const validActions  = VALID_ACTIONS_BY_STATUS[currentStatus] ?? [];

  if (!validActions.includes(action)) {
    return NextResponse.json(
      { error: `Action "${action}" is not valid for status "${currentStatus}". Valid: [${validActions.join(", ")}]` },
      { status: 422 },
    );
  }

  const jobRef = current.job_reference ?? "unknown";

  // ── mark_exported ─────────────────────────────────────────────────────────

  if (action === "mark_exported") {
    const { data: updated, error: updateErr } = await svc
      .from("accounting_exports")
      .update({ export_status: "Exported", updated_at: new Date().toISOString() })
      .eq("id", id)
      .select()
      .single();

    if (updateErr) return NextResponse.json({ error: updateErr.message }, { status: 500 });

    insertAuditLogWithClient(svc, {
      job_reference: jobRef,
      actor_role:    caller.role,
      actor_name:    caller.fullName,
      action:        AE_AUDIT_ACTIONS.exported,
      description:   `Accounting export ${current.export_reference} marked as Exported by ${caller.fullName}.`,
    }).catch(() => {});

    return NextResponse.json({ data: updated });
  }

  // ── cancel ────────────────────────────────────────────────────────────────

  if (action === "cancel") {
    const { data: updated, error: updateErr } = await svc
      .from("accounting_exports")
      .update({ export_status: "Cancelled", updated_at: new Date().toISOString() })
      .eq("id", id)
      .select()
      .single();

    if (updateErr) return NextResponse.json({ error: updateErr.message }, { status: 500 });

    insertAuditLogWithClient(svc, {
      job_reference: jobRef,
      actor_role:    caller.role,
      actor_name:    caller.fullName,
      action:        AE_AUDIT_ACTIONS.cancelled,
      description:   `Accounting export ${current.export_reference} cancelled by ${caller.fullName}.`,
    }).catch(() => {});

    return NextResponse.json({ data: updated });
  }

  // ── regenerate ────────────────────────────────────────────────────────────

  if (action === "regenerate") {
    const newPayload = await buildExportPayloadFromJob(svc, jobRef);
    if (!newPayload) {
      return NextResponse.json({ error: "Job not found — cannot regenerate" }, { status: 404 });
    }

    const netAmount = newPayload.net_release_eligible ?? newPayload.total_verified ?? newPayload.job_value;

    const { data: updated, error: updateErr } = await svc
      .from("accounting_exports")
      .update({
        export_status:  "Generated",
        export_payload: newPayload,
        gross_amount:   newPayload.job_value,
        tax_amount:     0,
        net_amount:     netAmount,
        generated_at:   new Date().toISOString(),
        generated_by:   caller.userId,
        updated_at:     new Date().toISOString(),
      })
      .eq("id", id)
      .select()
      .single();

    if (updateErr) return NextResponse.json({ error: updateErr.message }, { status: 500 });

    insertAuditLogWithClient(svc, {
      job_reference: jobRef,
      actor_role:    caller.role,
      actor_name:    caller.fullName,
      action:        AE_AUDIT_ACTIONS.regenerated,
      description:   `Accounting export ${current.export_reference} regenerated by ${caller.fullName}. Net: ${newPayload.currency} ${netAmount.toLocaleString()}.`,
    }).catch(() => {});

    return NextResponse.json({ data: updated });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
