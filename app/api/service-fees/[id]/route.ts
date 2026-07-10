// ─── GET   /api/service-fees/[id] — single fee
// ─── PATCH /api/service-fees/[id] — approve | waive | cancel | mark_exported | mark_collected

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { insertAuditLogWithClient } from "@/lib/auditLog";
import { FEE_AUDIT_ACTIONS, VALID_FEE_ACTIONS_BY_STATUS, type FeeStatus, type FeeAction } from "@/lib/nexumFee";

const svc = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

async function getCaller(req: NextRequest) {
  const token = req.headers.get("Authorization")?.replace("Bearer ", "");
  if (!token) return null;
  const { data: { user } } = await svc.auth.getUser(token);
  if (!user) return null;
  const { data: p } = await svc.from("profiles").select("role, full_name").eq("id", user.id).single();
  if (!p) return null;
  return { userId: user.id, role: p.role as string, fullName: p.full_name as string };
}

export async function GET(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const caller  = await getCaller(req);
  if (!caller) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (caller.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { data, error } = await svc.from("nexum_service_fees").select("*").eq("id", id).maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ data });
}

export async function PATCH(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id }  = await context.params;
  const caller  = await getCaller(req);
  if (!caller) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (caller.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const { action, waived_reason, fee_amount } = body as {
    action?: FeeAction;
    waived_reason?: string;
    fee_amount?: number;
  };

  if (!action) return NextResponse.json({ error: "action is required" }, { status: 400 });

  const { data: current, error: fetchErr } = await svc
    .from("nexum_service_fees")
    .select("id, fee_status, fee_type, fee_amount, currency, job_reference")
    .eq("id", id)
    .maybeSingle();

  if (fetchErr) return NextResponse.json({ error: fetchErr.message }, { status: 500 });
  if (!current) return NextResponse.json({ error: "Fee not found" }, { status: 404 });

  const currentStatus = current.fee_status as FeeStatus;
  const validActions  = VALID_FEE_ACTIONS_BY_STATUS[currentStatus] ?? [];

  if (!validActions.includes(action)) {
    return NextResponse.json(
      { error: `Action "${action}" is not valid for status "${currentStatus}". Valid: [${validActions.join(", ")}]` },
      { status: 422 },
    );
  }

  const jobRef = current.job_reference ?? "PLATFORM";

  const updateMap: Record<FeeAction, Record<string, unknown>> = {
    approve: {
      fee_status:  "Approved",
      approved_by: caller.userId,
      approved_at: new Date().toISOString(),
      ...(fee_amount != null ? { fee_amount } : {}),
    },
    waive: {
      fee_status:    "Waived",
      waived_reason: waived_reason ?? "Waived by admin",
    },
    cancel: {
      fee_status: "Cancelled",
    },
    mark_exported: {
      fee_status: "Exported",
    },
    mark_collected: {
      fee_status: "Collected",
    },
  };

  const auditActionMap: Record<FeeAction, string> = {
    approve:        FEE_AUDIT_ACTIONS.approved,
    waive:          FEE_AUDIT_ACTIONS.waived,
    cancel:         FEE_AUDIT_ACTIONS.cancelled,
    mark_exported:  FEE_AUDIT_ACTIONS.exported,
    mark_collected: FEE_AUDIT_ACTIONS.collected,
  };

  const { data: updated, error: updateErr } = await svc
    .from("nexum_service_fees")
    .update({ ...updateMap[action], updated_at: new Date().toISOString() })
    .eq("id", id)
    .select()
    .single();

  if (updateErr) return NextResponse.json({ error: updateErr.message }, { status: 500 });

  const fmtAmt = (n: number) => `${current.currency} ${Number(n).toFixed(2)}`;

  insertAuditLogWithClient(svc, {
    job_reference: jobRef,
    actor_role: caller.role, actor_name: caller.fullName,
    action: auditActionMap[action],
    description: `Service fee (${current.fee_type}, ${fmtAmt(current.fee_amount)}) ${action} by ${caller.fullName} for job ${jobRef}.${waived_reason ? ` Reason: ${waived_reason}` : ""}`,
  }).catch(() => {});

  return NextResponse.json({ data: updated });
}
