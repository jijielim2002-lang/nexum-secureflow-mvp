import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

export async function POST(req: NextRequest) {
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
