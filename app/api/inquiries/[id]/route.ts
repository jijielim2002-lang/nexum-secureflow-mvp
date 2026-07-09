// ─── GET  /api/inquiries/[id] — fetch single inquiry
// ─── PATCH /api/inquiries/[id] — assign-provider | cancel

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { insertAuditLogWithClient } from "@/lib/auditLog";
import { INQUIRY_AUDIT_ACTIONS } from "@/lib/quotation";

const svc = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

interface CallerInfo { userId: string; role: string; fullName: string; companyId: string | null; }

async function getCaller(req: NextRequest): Promise<CallerInfo | null> {
  const token = req.headers.get("Authorization")?.replace("Bearer ", "");
  if (!token) return null;
  const { data: { user } } = await svc.auth.getUser(token);
  if (!user) return null;
  const { data: p } = await svc.from("profiles").select("role, full_name, company_id").eq("id", user.id).single();
  if (!p) return null;
  return { userId: user.id, role: p.role, fullName: p.full_name, companyId: p.company_id ?? null };
}

export async function GET(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const caller = await getCaller(req);
  if (!caller) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data, error } = await svc.from("service_inquiries").select("*").eq("id", id).maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data)  return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ data });
}

export async function PATCH(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const caller = await getCaller(req);
  if (!caller) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: inquiry } = await svc.from("service_inquiries").select("*").eq("id", id).maybeSingle();
  if (!inquiry) return NextResponse.json({ error: "Inquiry not found" }, { status: 404 });

  const body = await req.json() as { action: string; provider_company_id?: string; admin_notes?: string };
  const now = new Date().toISOString();

  // ── assign-provider (admin only) ──────────────────────────────────────────
  if (body.action === "assign-provider") {
    if (caller.role !== "admin") return NextResponse.json({ error: "Admin only" }, { status: 403 });
    if (!body.provider_company_id) return NextResponse.json({ error: "provider_company_id required" }, { status: 400 });

    const { data: updated, error } = await svc
      .from("service_inquiries")
      .update({
        assigned_provider_company_id: body.provider_company_id,
        status:       "Assigned",
        admin_notes:  body.admin_notes ?? inquiry.admin_notes,
        updated_at:   now,
      })
      .eq("id", id)
      .select()
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    await insertAuditLogWithClient(svc, {
      job_reference: inquiry.inquiry_reference,
      actor_role:    "admin",
      actor_name:    caller.fullName,
      action:        INQUIRY_AUDIT_ACTIONS.provider_assigned,
      description:   `Admin assigned provider company ${body.provider_company_id} to inquiry ${inquiry.inquiry_reference}.`,
    }).catch(() => { /* silent */ });

    // Notify provider
    try {
      await svc.from("notifications").insert({
        job_reference:     inquiry.inquiry_reference,
        recipient_role:    "service_provider",
        notification_type: "Action Required",
        title:             `New Inquiry Assigned — ${inquiry.inquiry_reference}`,
        message:           `You have been assigned a service inquiry (${inquiry.service_type}, ${inquiry.route ?? "—"}). Please submit a quotation.`,
        priority:          "High",
        delivery_channel:  "In-App",
        status:            "Unread",
        action_url:        "/provider/quotations",
        created_at:        now,
      });
    } catch { /* silent */ }

    return NextResponse.json({ success: true, data: updated });
  }

  // ── cancel (customer or admin) ────────────────────────────────────────────
  if (body.action === "cancel") {
    const isAdmin    = caller.role === "admin";
    const isCustomer = caller.role === "customer" && inquiry.customer_company_id === caller.companyId;

    if (!isAdmin && !isCustomer) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    if (["Converted", "Cancelled"].includes(inquiry.status as string)) {
      return NextResponse.json({ error: "Cannot cancel a converted or already cancelled inquiry" }, { status: 400 });
    }

    const { data: updated, error } = await svc
      .from("service_inquiries")
      .update({ status: "Cancelled", updated_at: now })
      .eq("id", id)
      .select()
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    await insertAuditLogWithClient(svc, {
      job_reference: inquiry.inquiry_reference,
      actor_role:    caller.role,
      actor_name:    caller.fullName,
      action:        INQUIRY_AUDIT_ACTIONS.cancelled,
      description:   `Inquiry ${inquiry.inquiry_reference} cancelled by ${caller.fullName} (${caller.role}).`,
    }).catch(() => { /* silent */ });

    return NextResponse.json({ success: true, data: updated });
  }

  return NextResponse.json({ error: `Unknown action: ${body.action}` }, { status: 400 });
}
