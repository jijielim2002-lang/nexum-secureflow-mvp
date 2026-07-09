import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

function getSvc() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Missing Supabase env vars");
  return createClient(url, key);
}

async function resolveUser(req: NextRequest) {
  const token = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
  if (!token) return null;
  const svc = getSvc();
  const { data: { user }, error } = await svc.auth.getUser(token);
  if (error || !user) return null;
  const { data: profile } = await svc
    .from("profiles")
    .select("role, company_id, full_name, email")
    .eq("id", user.id)
    .single();
  return {
    userId:    user.id,
    role:      profile?.role ?? "unknown",
    companyId: profile?.company_id ?? null,
    name:      profile?.full_name ?? null,
    email:     profile?.email ?? user.email ?? null,
  };
}

// ─── GET /api/legal-terms/acceptances ─────────────────────────────────────────
// Admin: all acceptances with filters
// User: own acceptances only (enforced by RLS)

export async function GET(req: NextRequest) {
  try {
    const actor = await resolveUser(req);
    if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const svc = getSvc();
    const url = req.nextUrl;

    const jobRef    = url.searchParams.get("jobReference") ?? undefined;
    const companyId = url.searchParams.get("companyId") ?? undefined;
    const tmplType  = url.searchParams.get("templateType") ?? undefined;
    const userId    = url.searchParams.get("userId") ?? undefined;

    // For non-admin, use anon client with user token so RLS filters to own records
    let q;
    if (actor.role === "admin") {
      q = svc.from("legal_terms_acceptances").select(`
        *,
        template:template_id(template_reference, template_title, version_number),
        company:company_id(company_name)
      `).order("created_at", { ascending: false }).limit(500);
    } else {
      // Will be filtered by RLS to user's own records
      q = svc.from("legal_terms_acceptances").select(`
        id, template_id, template_reference, template_type, version_number,
        job_reference, acceptance_status, accepted_at, acceptance_method, created_at
      `).eq("user_id", actor.userId).order("created_at", { ascending: false }).limit(200);
    }

    if (jobRef)    q = q.eq("job_reference", jobRef);
    if (companyId) q = q.eq("company_id", companyId);
    if (tmplType)  q = q.eq("template_type", tmplType);
    if (userId && actor.role === "admin") q = q.eq("user_id", userId);

    const { data, error } = await q;
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ acceptances: data ?? [] });
  } catch (err) {
    console.error("[legal-terms/acceptances GET]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// ─── POST /api/legal-terms/acceptances — record acceptance ───────────────────
// Any authenticated user can record their own acceptance.
// Records are immutable after creation (no user UPDATE/DELETE).

export async function POST(req: NextRequest) {
  try {
    const actor = await resolveUser(req);
    if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body: {
      template_id:       string;
      template_reference?: string;
      template_type?:    string;
      version_number?:   string;
      job_reference?:    string;
      acceptance_method?: string;
      acceptance_note?:  string;
      ip_address?:       string;
      user_agent?:       string;
    } = await req.json();

    if (!body.template_id) {
      return NextResponse.json({ error: "template_id is required" }, { status: 400 });
    }

    const svc = getSvc();

    // Verify template exists and is Active
    const { data: tmpl, error: tmplErr } = await svc
      .from("legal_terms_templates")
      .select("id, template_reference, template_type, version_number, status")
      .eq("id", body.template_id)
      .single();

    if (tmplErr || !tmpl) {
      return NextResponse.json({ error: "Template not found" }, { status: 404 });
    }
    if ((tmpl as { status: string }).status !== "Active") {
      return NextResponse.json({ error: "Template is not Active — cannot record acceptance" }, { status: 409 });
    }

    const t = tmpl as { id: string; template_reference: string; template_type: string; version_number: string; status: string };

    // Check if user already accepted this template version for this job (idempotent)
    const existingQ = svc
      .from("legal_terms_acceptances")
      .select("id, accepted_at")
      .eq("user_id", actor.userId)
      .eq("template_id", body.template_id)
      .eq("acceptance_status", "Accepted");

    if (body.job_reference) {
      existingQ.eq("job_reference", body.job_reference);
    } else {
      existingQ.is("job_reference", null);
    }

    const { data: existing } = await existingQ.limit(1);
    if (existing && existing.length > 0) {
      // Already accepted — return existing record (idempotent)
      return NextResponse.json({
        acceptance: existing[0],
        already_accepted: true,
      });
    }

    const { data, error } = await svc
      .from("legal_terms_acceptances")
      .insert({
        template_id:        body.template_id,
        template_reference: t.template_reference,
        template_type:      t.template_type,
        version_number:     t.version_number,
        company_id:         actor.companyId,
        user_id:            actor.userId,
        user_email:         actor.email,
        user_name:          actor.name,
        job_reference:      body.job_reference ?? null,
        acceptance_status:  "Accepted",
        accepted_at:        new Date().toISOString(),
        ip_address:         body.ip_address ?? req.headers.get("x-forwarded-for") ?? null,
        user_agent:         body.user_agent ?? req.headers.get("user-agent") ?? null,
        acceptance_method:  body.acceptance_method ?? "Checkbox",
        acceptance_note:    body.acceptance_note ?? null,
      })
      .select()
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    // Audit log
    const auditEventMap: Record<string, string> = {
      "Customer Pilot Terms":  "customer_terms_accepted",
      "Provider Pilot Terms":  "provider_terms_accepted",
      "Payment Holding Terms": "payment_terms_accepted",
      "Release Terms":         "release_terms_accepted",
      "Dispute Terms":         "dispute_terms_accepted",
    };
    const auditEvent = auditEventMap[t.template_type] ?? "legal_terms_accepted";

    await svc.from("audit_logs").insert({
      event_type:    auditEvent,
      actor_id:      actor.userId,
      job_reference: body.job_reference ?? null,
      details: {
        template_reference: t.template_reference,
        template_type:      t.template_type,
        version_number:     t.version_number,
        company_id:         actor.companyId,
        user_email:         actor.email,
      },
      created_at: new Date().toISOString(),
    });

    return NextResponse.json({ acceptance: data, already_accepted: false }, { status: 201 });
  } catch (err) {
    console.error("[legal-terms/acceptances POST]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
