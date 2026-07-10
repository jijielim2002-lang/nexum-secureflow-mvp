import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const svc = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

// ─── Admin JWT guard ───────────────────────────────────────────────────────────

async function validateAdmin(req: NextRequest): Promise<string | null> {
  const token = req.headers.get("Authorization")?.replace("Bearer ", "");
  if (!token) return null;
  const { data: { user } } = await svc.auth.getUser(token);
  if (!user) return null;
  const { data: p } = await svc.from("profiles").select("role").eq("id", user.id).single();
  return p?.role === "admin" ? user.id : null;
}

// ─── Body ─────────────────────────────────────────────────────────────────────

interface CreateUserBody {
  email:       string;
  password:    string;
  fullName:    string;
  role:        "admin" | "service_provider" | "customer";
  companyId?:  string;
  sendInvite?: boolean;
}

// ─── POST /api/admin/create-user ──────────────────────────────────────────────

export async function POST(req: NextRequest) {
  // 1. Auth check
  const actorId = await validateAdmin(req);
  if (!actorId) {
    return NextResponse.json({ error: "Unauthorized — admin only" }, { status: 401 });
  }

  // 2. Parse body
  let body: CreateUserBody;
  try {
    body = (await req.json()) as CreateUserBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { email, password, fullName, role, companyId, sendInvite } = body;
  if (!email || !password || !fullName || !role) {
    return NextResponse.json({ error: "email, password, fullName, role are required" }, { status: 400 });
  }

  // 3. Create auth user (service role — bypasses email confirmation)
  const { data: authData, error: authErr } = await svc.auth.admin.createUser({
    email,
    password,
    email_confirm: true,          // mark as confirmed so they can log in immediately
    user_metadata: { full_name: fullName, role },
  });

  if (authErr || !authData.user) {
    return NextResponse.json({ error: authErr?.message ?? "Failed to create auth user" }, { status: 400 });
  }

  const userId = authData.user.id;

  // 4. Insert profile
  const { error: profileErr } = await svc.from("profiles").insert({
    id:        userId,
    email,
    full_name: fullName,
    role,
    company_id: companyId ?? null,
    status:    "active",
  });

  if (profileErr) {
    // Roll back: delete the auth user we just created
    await svc.auth.admin.deleteUser(userId);
    return NextResponse.json({ error: profileErr.message }, { status: 500 });
  }

  // 5. Audit log
  await svc.from("audit_logs").insert({
    actor_id:    actorId,
    actor_role:  "admin",
    action:      "pilot_user_created",
    description: `Pilot user created — ${fullName} (${role}) <${email}>`,
  });

  // 6. Optional: send invite email (if RESEND_API_KEY configured)
  if (sendInvite) {
    const resendKey = process.env.RESEND_API_KEY;
    if (resendKey) {
      const html = `
        <div style="font-family:sans-serif;background:#0f172a;color:#e2e8f0;padding:32px;border-radius:12px;max-width:520px">
          <h2 style="color:#60a5fa;margin:0 0 16px">Welcome to Nexum SecureFlow</h2>
          <p>Hi <strong>${fullName}</strong>,</p>
          <p>Your pilot account has been created. You can log in immediately using:</p>
          <div style="background:#1e293b;border-radius:8px;padding:16px;margin:16px 0">
            <p style="margin:4px 0"><strong>Email:</strong> ${email}</p>
            <p style="margin:4px 0"><strong>Password:</strong> ${password}</p>
          </div>
          <p style="color:#94a3b8;font-size:12px">Please change your password after your first login.</p>
        </div>`;
      await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${resendKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          from:    "Nexum SecureFlow <noreply@nexum.app>",
          to:      [email],
          subject: "Your Nexum SecureFlow Pilot Account",
          html,
        }),
      });
    }
  }

  return NextResponse.json({ success: true, userId, email, role });
}
