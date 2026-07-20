import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getCaller } from "@/lib/api-auth";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

// ─── Auth check ───────────────────────────────────────────────────────────────
// Accepts either:
//   1. A valid Bearer <access_token> (user-initiated action)
//   2. x-internal-key header matching INTERNAL_API_KEY env var (server-to-server)
async function isAuthorized(req: NextRequest): Promise<boolean> {
  // Internal API key (server-to-server calls from other API routes)
  const internalKey = req.headers.get("x-internal-key");
  if (internalKey && internalKey === process.env.INTERNAL_API_KEY) return true;

  // User Bearer token
  const caller = await getCaller(req);
  return caller !== null;
}

export async function POST(req: NextRequest) {
  if (!(await isAuthorized(req))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await req.json() as {
      jobReference?:        string | null;
      recipientRole:        string;
      recipientCompanyId?:  string | null;
      recipientUserId?:     string | null;
      notificationType:     string;
      title:                string;
      message?:             string | null;
      priority?:            string;
      actionUrl?:           string | null;
      deliveryChannel?:     string;
      actorId?:             string;
      actorName?:           string;
      actorRole?:           string;
    };

    if (!body.recipientRole || !body.notificationType || !body.title) {
      return NextResponse.json({ error: "Missing required fields: recipientRole, notificationType, title" }, { status: 400 });
    }

    const { data, error } = await supabase
      .from("notifications")
      .insert({
        job_reference:        body.jobReference     ?? null,
        recipient_role:       body.recipientRole,
        recipient_company_id: body.recipientCompanyId ?? null,
        recipient_user_id:    body.recipientUserId    ?? null,
        notification_type:    body.notificationType,
        title:                body.title,
        message:              body.message            ?? null,
        priority:             body.priority           ?? "Medium",
        status:               "Unread",
        action_url:           body.actionUrl          ?? null,
        delivery_channel:     body.deliveryChannel    ?? "In-App",
        sent_at:              new Date().toISOString(),
      })
      .select("id")
      .single();

    if (error) {
      console.error("[notifications/create]", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Audit log
    await supabase.from("audit_logs").insert({
      job_reference: body.jobReference ?? null,
      actor_role:    body.actorRole  ?? "system",
      actor_name:    body.actorName  ?? "System",
      actor_id:      body.actorId    ?? null,
      action:        "notification_created",
      description:   `[${body.priority ?? "Medium"}] ${body.title} → ${body.recipientRole}`,
    });

    return NextResponse.json({ id: data?.id, success: true });
  } catch (err) {
    console.error("[notifications/create] unexpected error:", err);
    return NextResponse.json({ error: "Unexpected error" }, { status: 500 });
  }
}
