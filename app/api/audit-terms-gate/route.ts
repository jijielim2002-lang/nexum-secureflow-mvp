// ─── POST /api/audit-terms-gate ───────────────────────────────────────────────
// Internal: log when a terms gate is triggered for a user.
// Called silently by TermsGate component.

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { TERMS_AUDIT_ACTIONS } from "@/lib/termsAcceptance";

const svc = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

export async function POST(req: NextRequest) {
  const token = req.headers.get("Authorization")?.replace("Bearer ", "");
  if (!token) return NextResponse.json({ ok: false }, { status: 401 });

  const { data: { user } } = await svc.auth.getUser(token);
  if (!user) return NextResponse.json({ ok: false }, { status: 401 });

  let body: { source?: string; missingTerms?: string[] } = {};
  try { body = await req.json(); } catch { /* ok */ }

  const { data: profile } = await svc
    .from("profiles")
    .select("role, full_name")
    .eq("id", user.id)
    .single();

  const now = new Date().toISOString();
  try {
    await svc.from("audit_logs").insert({
      actor_role:  profile?.role ?? "unknown",
      actor_name:  profile?.full_name ?? user.email ?? "User",
      action:      TERMS_AUDIT_ACTIONS.gate_triggered,
      description: `Terms gate triggered at "${body.source ?? "unknown"}". Missing: ${(body.missingTerms ?? []).join(", ")}.`,
      created_at:  now,
    });
  } catch { /* silent */ }

  return NextResponse.json({ ok: true });
}
