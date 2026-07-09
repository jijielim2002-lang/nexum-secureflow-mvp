import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

// ─── Service client ───────────────────────────────────────────────────────────

function getSvc() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Missing Supabase env vars");
  return createClient(url, key);
}

// ─── Auth helpers ─────────────────────────────────────────────────────────────

async function resolveUser(req: NextRequest) {
  const token = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
  if (!token) return null;
  const svc = getSvc();
  const { data: { user }, error } = await svc.auth.getUser(token);
  if (error || !user) return null;
  const { data: profile } = await svc
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();
  return { userId: user.id, role: profile?.role ?? "unknown" };
}

async function resolveAdmin(req: NextRequest) {
  const actor = await resolveUser(req);
  if (!actor || actor.role !== "admin") return null;
  return actor;
}

// ─── Audit log ────────────────────────────────────────────────────────────────

async function writeAudit(
  svc: ReturnType<typeof getSvc>,
  event_type: string,
  actor_id: string,
  details: Record<string, unknown>,
) {
  await svc.from("audit_logs").insert({
    event_type,
    actor_id,
    details,
    created_at: new Date().toISOString(),
  });
}

// ─── Reference generator ──────────────────────────────────────────────────────

function genRef(type: string): string {
  const code = type.split(" ").map((w) => w[0]).join("").toUpperCase().slice(0, 3);
  const ts   = Date.now().toString(36).toUpperCase();
  return `TMPL-${code}-${ts}`;
}

// ─── GET /api/legal-terms ─────────────────────────────────────────────────────
// Public (authenticated): returns Active templates only
// Admin: returns all templates + optional ?all=true

export async function GET(req: NextRequest) {
  try {
    const actor = await resolveUser(req);
    if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const svc = getSvc();
    const url = req.nextUrl;

    const showAll = url.searchParams.get("all") === "true" && actor.role === "admin";
    const typeFilter = url.searchParams.get("type") ?? undefined;

    let q = svc
      .from("legal_terms_templates")
      .select("id, template_reference, template_type, template_title, version_number, language, status, effective_date, created_at, updated_at" + (showAll ? ", content, created_by" : ", content"))
      .order("template_type", { ascending: true });

    if (!showAll) q = q.eq("status", "Active");
    if (typeFilter) q = q.eq("template_type", typeFilter);

    const { data, error } = await q;
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ templates: data ?? [] });
  } catch (err) {
    console.error("[legal-terms GET]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// ─── POST /api/legal-terms — admin: create template ──────────────────────────

export async function POST(req: NextRequest) {
  try {
    const actor = await resolveAdmin(req);
    if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body: {
      template_type:  string;
      template_title: string;
      version_number?: string;
      language?:       string;
      content:         string;
      effective_date?: string;
    } = await req.json();

    if (!body.template_type || !body.template_title || !body.content) {
      return NextResponse.json({ error: "template_type, template_title, and content are required" }, { status: 400 });
    }

    const svc = getSvc();
    const ref = genRef(body.template_type);

    const { data, error } = await svc
      .from("legal_terms_templates")
      .insert({
        template_reference: ref,
        template_type:      body.template_type,
        template_title:     body.template_title,
        version_number:     body.version_number ?? "1.0",
        language:           body.language ?? "English",
        content:            body.content,
        status:             "Draft",
        effective_date:     body.effective_date ?? null,
        created_by:         actor.userId,
      })
      .select()
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    await writeAudit(svc, "legal_template_created", actor.userId, {
      template_reference: ref,
      template_type:      body.template_type,
    });

    return NextResponse.json({ template: data }, { status: 201 });
  } catch (err) {
    console.error("[legal-terms POST]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// ─── PATCH /api/legal-terms — admin: edit or change status ───────────────────
// actions: activate, archive, edit (content/title/version)

export async function PATCH(req: NextRequest) {
  try {
    const actor = await resolveAdmin(req);
    if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body: {
      id:              string;
      action:          "activate" | "archive" | "edit";
      template_title?: string;
      version_number?: string;
      content?:        string;
      effective_date?: string;
    } = await req.json();

    if (!body.id || !body.action) {
      return NextResponse.json({ error: "id and action are required" }, { status: 400 });
    }

    const svc = getSvc();
    let patch: Record<string, unknown> = {};
    let auditEvent = "";

    switch (body.action) {
      case "activate":
        patch = { status: "Active", effective_date: body.effective_date ?? new Date().toISOString().slice(0, 10) };
        auditEvent = "legal_template_activated";
        break;
      case "archive":
        patch = { status: "Archived" };
        auditEvent = "legal_template_archived";
        break;
      case "edit":
        if (body.template_title) patch.template_title = body.template_title;
        if (body.version_number) patch.version_number = body.version_number;
        if (body.content)        patch.content        = body.content;
        if (body.effective_date) patch.effective_date = body.effective_date;
        auditEvent = "legal_template_edited";
        break;
      default:
        return NextResponse.json({ error: `Unknown action: ${body.action}` }, { status: 400 });
    }

    const { data, error } = await svc
      .from("legal_terms_templates")
      .update(patch)
      .eq("id", body.id)
      .select()
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    await writeAudit(svc, auditEvent, actor.userId, {
      template_id:        body.id,
      template_reference: (data as { template_reference: string }).template_reference,
      action:             body.action,
    });

    return NextResponse.json({ template: data });
  } catch (err) {
    console.error("[legal-terms PATCH]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
