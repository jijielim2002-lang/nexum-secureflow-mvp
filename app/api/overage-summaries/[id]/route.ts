// ─── GET   /api/overage-summaries/[id]
// ─── PATCH /api/overage-summaries/[id] — approve | waive | cancel | export

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { insertAuditLogWithClient } from "@/lib/auditLog";
import { USAGE_AUDIT_ACTIONS, VALID_SUMMARY_ACTIONS_BY_STATUS, type SummaryStatus, type SummaryAction } from "@/lib/usageMetering";

const svc = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

async function getCaller(req: NextRequest) {
  const token = req.headers.get("Authorization")?.replace("Bearer ", "");
  if (!token) return null;
  const { data: { user } } = await svc.auth.getUser(token);
  if (!user) return null;
  const { data: p } = await svc.from("profiles").select("role, full_name, company_id").eq("id", user.id).single();
  if (!p) return null;
  return { userId: user.id, role: p.role as string, fullName: p.full_name as string, companyId: p.company_id as string | null };
}

export async function GET(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const caller = await getCaller(req);
  if (!caller) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data, error } = await svc.from("overage_billing_summaries").select("*").eq("id", id).maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: "Not found" }, { status: 404 });

  if (caller.role !== "admin" && data.company_id !== caller.companyId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  return NextResponse.json({ data });
}

export async function PATCH(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const caller = await getCaller(req);
  if (!caller) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (caller.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const { action } = body as { action?: SummaryAction };

  if (!action) return NextResponse.json({ error: "action is required" }, { status: 400 });

  // Fetch current status
  const { data: current, error: fetchErr } = await svc
    .from("overage_billing_summaries")
    .select("id, summary_status, total_overage_amount, currency, company_id, plan_id")
    .eq("id", id)
    .maybeSingle();

  if (fetchErr) return NextResponse.json({ error: fetchErr.message }, { status: 500 });
  if (!current) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const validActions = VALID_SUMMARY_ACTIONS_BY_STATUS[current.summary_status as SummaryStatus] ?? [];
  if (!validActions.includes(action)) {
    return NextResponse.json({
      error: `Action "${action}" is not valid for status "${current.summary_status}". Valid: [${validActions.join(", ")}]`,
    }, { status: 422 });
  }

  const statusMap: Record<SummaryAction, string> = {
    approve: "Approved",
    waive:   "Waived",
    cancel:  "Cancelled",
    export:  "Exported",
  };

  const updatePayload: Record<string, unknown> = {
    summary_status: statusMap[action],
    updated_at: new Date().toISOString(),
  };

  if (action === "approve") {
    updatePayload.approved_by = caller.userId;
    updatePayload.approved_at = new Date().toISOString();
  }

  // If approving and overage > 0, create a service fee record
  let serviceFeeId: string | null = null;
  if (action === "approve" && Number(current.total_overage_amount) > 0) {
    const { data: fee } = await svc
      .from("nexum_service_fees")
      .insert({
        job_reference:   null,
        company_id:      current.company_id,
        fee_rule_id:     null,
        fee_type:        "Other",
        fee_description: `Overage billing — approved from summary ${id}. Currency: ${current.currency}.`,
        base_amount:     Number(current.total_overage_amount),
        fee_amount:      Number(current.total_overage_amount),
        currency:        current.currency,
        fee_status:      "Calculated",
      })
      .select("id")
      .single();

    if (fee) {
      serviceFeeId = fee.id;
      updatePayload.service_fee_id = serviceFeeId;
    }
  }

  const { data: updated, error: updateErr } = await svc
    .from("overage_billing_summaries")
    .update(updatePayload)
    .eq("id", id)
    .select()
    .single();

  if (updateErr) return NextResponse.json({ error: updateErr.message }, { status: 500 });

  const auditActionMap: Record<SummaryAction, string> = {
    approve: USAGE_AUDIT_ACTIONS.summary_approved,
    waive:   USAGE_AUDIT_ACTIONS.summary_waived,
    cancel:  USAGE_AUDIT_ACTIONS.recorded,
    export:  USAGE_AUDIT_ACTIONS.exported,
  };

  insertAuditLogWithClient(svc, {
    job_reference: "PLATFORM",
    actor_role: caller.role, actor_name: caller.fullName,
    action: auditActionMap[action],
    description: `Overage summary ${id} ${action} by ${caller.fullName}. Overage: ${current.currency} ${Number(current.total_overage_amount).toFixed(2)}.${serviceFeeId ? ` Service fee created: ${serviceFeeId}.` : ""}`,
  }).catch(() => {});

  return NextResponse.json({ data: updated, serviceFeeId });
}
