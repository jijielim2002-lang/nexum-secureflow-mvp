import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

// ─── Service-role client ──────────────────────────────────────────────────────

function getSvc() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Missing Supabase env vars");
  return createClient(url, key);
}

// ─── Auth ─────────────────────────────────────────────────────────────────────

async function resolveAdmin(req: NextRequest) {
  const token = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
  if (!token) return null;
  const svc = getSvc();
  const { data: { user }, error } = await svc.auth.getUser(token);
  if (error || !user) return null;
  const { data: profile } = await svc.from("profiles").select("role").eq("id", user.id).single();
  if (!profile || profile.role !== "admin") return null;
  return { userId: user.id };
}

// ─── Reference generator ──────────────────────────────────────────────────────

function genRef(env: string, type: string): string {
  const envCode  = env.slice(0, 3).toUpperCase();
  const typeCode = type.replace(/[^A-Z]/g, "").slice(0, 3) || "CHK";
  const ts       = Date.now().toString(36).toUpperCase();
  return `DCL-${envCode}-${typeCode}-${ts}`;
}

// ─── DEFAULT ITEMS ────────────────────────────────────────────────────────────
// Seeded into deployment_cutover_items when a checklist is created via POST.

type ItemDef = { category: string; name: string; description?: string; required?: boolean };

const DEFAULT_ITEMS: Record<string, ItemDef[]> = {
  "Environment Setup": [
    { category: "Hosting",              name: "Production hosting selected",                                                description: "e.g. Vercel, Railway, Render, AWS" },
    { category: "Domain",               name: "Production domain configured" },
    { category: "Domain",               name: "SSL enabled",                                                               description: "HTTPS enforced, no mixed content" },
    { category: "Environment Vars",     name: "Environment variables configured",                                          description: "All .env.production values set in host dashboard" },
    { category: "Environment Vars",     name: "NEXT_PUBLIC_SUPABASE_URL points to production Supabase" },
    { category: "Environment Vars",     name: "NEXT_PUBLIC_SUPABASE_ANON_KEY configured" },
    { category: "Environment Vars",     name: "SUPABASE_SERVICE_ROLE_KEY configured server-side only",                    description: "Must NOT appear in NEXT_PUBLIC_ prefix" },
    { category: "Security",             name: "No service role key exposed to browser",                                    description: "Verify via browser devtools network tab — key must never appear in client bundle" },
    { category: "Environment",          name: "Local / Staging / Production environments separated",                       description: "Each environment has its own Supabase project" },
    { category: "Config",               name: "Admin email configured" },
    { category: "Config",               name: "System email sender configured",                                            required: false, description: "If using Supabase Auth email or third-party SMTP" },
    { category: "Build",                name: "App build passes",                                                          description: "npx next build exits 0" },
    { category: "Build",                name: "App deploy succeeds",                                                       description: "Production URL returns 200 on health check" },
  ],
  "Database Cutover": [
    { category: "Supabase",   name: "Production Supabase project created",                 description: "Separate project from staging — different anon key and service key" },
    { category: "Migration",  name: "Consolidated migration applied",                      description: "All 007 migration files run in order on production DB" },
    { category: "Migration",  name: "Required tables exist",                               description: "secured_jobs, profiles, companies, manual_payment_operations, legal_terms_templates, pilot_onboarding_checklists, deployment_cutover_checklists, system_settings" },
    { category: "Migration",  name: "Required columns exist",                              description: "pilot_status on secured_jobs; all Phase 3-6 columns present" },
    { category: "RLS",        name: "RLS enabled on all tables",                           description: "SELECT relrowsecurity FROM pg_class — all true" },
    { category: "RLS",        name: "RLS policies tested",                                 description: "Admin can read all; provider/customer limited to own company" },
    { category: "Performance",name: "Indexes created",                                     description: "All idx_* indexes from migrations are present" },
    { category: "Triggers",   name: "updated_at triggers created",                         description: "set_updated_at() function and triggers on all relevant tables" },
    { category: "Storage",    name: "Storage buckets created",                             description: "payment-proofs, pod-documents, evidence-packs, company-documents" },
    { category: "Data",       name: "Seed data loaded",                                   description: "SOP items, legal terms templates, go-live readiness items, system_settings defaults" },
    { category: "Access",     name: "Admin account created in production" },
    { category: "Access",     name: "Test accounts created for UAT only",                  required: false },
    { category: "Health",     name: "Schema health page passed",                           description: "/admin/schema-health shows all green on production URL" },
  ],
  "Security Review": [
    { category: "Access Control",    name: "Admin pages protected",                        description: "/admin/* redirects unauthenticated users" },
    { category: "RLS",               name: "Provider cannot access other provider data",   description: "Test with two provider accounts — each sees only own company rows" },
    { category: "RLS",               name: "Customer cannot access other customer data",   description: "Test with two customer accounts — cross-company query returns 0 rows" },
    { category: "Payment Security",  name: "Provider cannot verify payment",              description: "Provider API calls to verify_payment return 401" },
    { category: "Payment Security",  name: "Customer cannot verify payment",              description: "Customer API calls to verify_payment return 401" },
    { category: "Release Security",  name: "Provider cannot approve release",             description: "Provider calls to approve_release return 401" },
    { category: "Release Security",  name: "Customer cannot approve release",             description: "Customer calls to approve_release return 401" },
    { category: "Auth",              name: "Public unauthenticated access blocked",        description: "API routes return 401 without Bearer token" },
    { category: "Legal",             name: "Legal terms acceptance cannot be deleted by users", description: "RLS: no DELETE policy for non-admin on legal_terms_acceptances" },
    { category: "Payment Security",  name: "Payment operations admin-only",              description: "/api/payment-operations PATCH requires admin role" },
    { category: "Release Security",  name: "Release approval admin-only" },
    { category: "Payment Security",  name: "Payout recording admin-only" },
  ],
  "Storage Review": [
    { category: "Buckets",     name: "payment-proofs bucket exists" },
    { category: "Buckets",     name: "pod-documents bucket exists" },
    { category: "Buckets",     name: "evidence-packs bucket exists" },
    { category: "Buckets",     name: "company-documents bucket exists" },
    { category: "Security",    name: "Public access disabled on all buckets",              description: "Supabase dashboard: Public = OFF for all four buckets" },
    { category: "Security",    name: "Signed URL or role-based access working",            description: "Test file download via signed URL — works for admin, blocked for anon" },
    { category: "Validation",  name: "File type validation enabled",                      required: false, description: "If configured — MIME type check in upload route" },
    { category: "Validation",  name: "File size limit configured",                        required: false },
    { category: "Testing",     name: "Payment proof upload tested" },
    { category: "Testing",     name: "POD upload tested" },
    { category: "Testing",     name: "Evidence pack upload/export tested" },
  ],
  "Admin Access": [
    { category: "Accounts", name: "Super admin account created in production" },
    { category: "Accounts", name: "Backup admin account created" },
    { category: "Accounts", name: "Finance/admin user created" },
    { category: "Accounts", name: "Provider test account created" },
    { category: "Accounts", name: "Customer test account created" },
    { category: "Auth",     name: "Password reset flow tested",                          required: false },
    { category: "Access",   name: "Role assignment tested",                              description: "profiles.role correctly set for each test account" },
    { category: "Access",   name: "Company membership tested",                           description: "Provider and customer linked to correct companies" },
  ],
  "Test Data Cleanup": [
    { category: "Jobs",       name: "Local/staging dummy jobs identified and removed",   description: "No test jobs visible on production secured_jobs table" },
    { category: "Storage",    name: "Fake payment proofs removed from production storage" },
    { category: "Storage",    name: "Fake PODs removed from production storage" },
    { category: "Companies",  name: "Fake companies removed or clearly marked as Test",  description: "company_name prefixed with [TEST] or deleted" },
    { category: "Users",      name: "Test users marked clearly or removed" },
    { category: "Pilot Data", name: "Production pilot company created" },
    { category: "Pilot Data", name: "Production pilot provider created" },
    { category: "Pilot Data", name: "Production pilot customer created" },
    { category: "Pilot Data", name: "Production pilot job approved manually only",       description: "No automated job creation; first job entered by admin" },
  ],
  "Backup / Recovery": [
    { category: "Supabase",       name: "Supabase automatic backup confirmed",           description: "Supabase dashboard → Project Settings → Backups: daily backup enabled" },
    { category: "Export",         name: "Manual SQL export tested",                      description: "pg_dump or Supabase dashboard export completed without error" },
    { category: "Documentation",  name: "Storage export process documented" },
    { category: "Export",         name: "Evidence pack export tested" },
    { category: "Export",         name: "Admin can export payment operations CSV" },
    { category: "Export",         name: "Admin can export settlement/reconciliation CSV" },
    { category: "Ownership",      name: "Recovery owner assigned",                       description: "Named person responsible for DB restore if needed" },
    { category: "Documentation",  name: "Backup frequency documented",                  description: "e.g. daily automatic + manual export before any major release" },
  ],
  "Monitoring": [
    { category: "Logging",        name: "App error logging enabled",                     description: "console.error captured — or external logger configured (e.g. Sentry, Logtail)" },
    { category: "Supabase",       name: "Supabase logs accessible",                      description: "Supabase dashboard → Logs: Admin can view API/DB/auth logs" },
    { category: "Alerts",         name: "Failed payment verification errors visible",    description: "Errors from /api/payment-operations appear in logs" },
    { category: "Alerts",         name: "Failed upload errors visible" },
    { category: "Alerts",         name: "Failed release approval errors visible" },
    { category: "Admin",          name: "Admin diagnostic page available",               description: "/admin/schema-health accessible and returning results" },
    { category: "Ownership",      name: "Critical error contact person assigned",        description: "Named person who handles production incidents" },
    { category: "Documentation",  name: "Manual incident log created",                  description: "Simple log file or Notion doc for recording production issues" },
  ],
  "Go-Live Approval": [
    { category: "Readiness",   name: "Go-live readiness page all Critical items Passed or Waived",  description: "/admin/go-live-readiness" },
    { category: "Health",      name: "Schema health passed on production URL" },
    { category: "Security",    name: "Security tests passed (UAT security test page)" },
    { category: "Operations",  name: "Payment SOP approved",                            description: "/admin/payment-sop all steps reviewed" },
    { category: "Legal",       name: "All 5 pilot legal/terms templates Active",        description: "/admin/legal-terms required status bar: 5/5 green" },
    { category: "Onboarding",  name: "First provider onboarding approved",              description: "pilot_onboarding_checklists: Provider Onboarding = Approved" },
    { category: "Onboarding",  name: "First customer onboarding approved",              description: "pilot_onboarding_checklists: Customer Onboarding = Approved" },
    { category: "Job",         name: "First live job approval checklist passed",         description: "pilot_onboarding_checklists: Live Job Approval = Approved" },
    { category: "Approval",    name: "Management approval recorded",                    description: "Named manager has signed off — record name and date in review_note" },
    { category: "Record",      name: "Go-live date and time recorded in review_note" },
  ],
  "Post-Go-Live Review": [
    { category: "Transaction",     name: "First live payment verified by admin",         description: "payment-operations: verify_payment action completed on real job" },
    { category: "Transaction",     name: "First POD uploaded by provider" },
    { category: "Transaction",     name: "First customer confirmation recorded" },
    { category: "Transaction",     name: "First release approved by admin" },
    { category: "Transaction",     name: "First manual payout recorded" },
    { category: "Transaction",     name: "First settlement reconciled" },
    { category: "Evidence",        name: "Evidence pack generated for first transaction" },
    { category: "Confirmation",    name: "Pilot transaction within Phase 1 scope confirmed",  description: "MYR, logistics fee, local Malaysia, manual DuitNow — no cargo/FX/financing" },
    { category: "Incident",        name: "Any incident recorded",                        required: false },
    { category: "Review",          name: "Lessons learned recorded",                    required: false },
  ],
};

// ─── GET /api/deployment-cutover ─────────────────────────────────────────────

export async function GET(req: NextRequest) {
  try {
    const actor = await resolveAdmin(req);
    if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const svc = getSvc();
    const env  = req.nextUrl.searchParams.get("environment") ?? undefined;
    const type = req.nextUrl.searchParams.get("checklist_type") ?? undefined;

    let q = svc
      .from("deployment_cutover_checklists")
      .select(`*, items:deployment_cutover_items(*)`)
      .order("created_at", { ascending: false });

    if (env)  q = q.eq("environment",    env);
    if (type) q = q.eq("checklist_type", type);

    const { data, error } = await q;
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    // Also return system_settings
    const { data: settings } = await svc.from("system_settings").select("key, value, description, updated_at");
    const settingsMap: Record<string, string> = {};
    for (const s of settings ?? []) settingsMap[s.key] = s.value;

    return NextResponse.json({ checklists: data ?? [], settings: settingsMap });
  } catch (err) {
    console.error("[deployment-cutover GET]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// ─── POST /api/deployment-cutover — create checklist + auto-seed items ───────

export async function POST(req: NextRequest) {
  try {
    const actor = await resolveAdmin(req);
    if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body: {
      checklist_type: string;
      environment?:   string;
      risk_level?:    string;
      owner_name?:    string;
    } = await req.json();

    if (!body.checklist_type) {
      return NextResponse.json({ error: "checklist_type is required" }, { status: 400 });
    }

    const env = body.environment ?? "Staging";
    const ref = genRef(env, body.checklist_type);
    const svc = getSvc();

    const { data: checklist, error: chkErr } = await svc
      .from("deployment_cutover_checklists")
      .insert({
        checklist_reference: ref,
        checklist_type:      body.checklist_type,
        environment:         env,
        risk_level:          body.risk_level  ?? "Medium",
        owner_name:          body.owner_name  ?? null,
        created_by:          actor.userId,
      })
      .select()
      .single();

    if (chkErr) return NextResponse.json({ error: chkErr.message }, { status: 500 });

    // Auto-seed items
    const itemDefs = DEFAULT_ITEMS[body.checklist_type] ?? [];
    if (itemDefs.length > 0) {
      const rows = itemDefs.map((d) => ({
        checklist_id:     checklist.id,
        item_category:    d.category,
        item_name:        d.name,
        item_description: d.description ?? null,
        required:         d.required ?? true,
      }));
      const { error: itemErr } = await svc.from("deployment_cutover_items").insert(rows);
      if (itemErr) console.error("[deployment-cutover POST] item seed error:", itemErr.message);
    }

    await svc.from("audit_logs").insert({
      event_type:  "deployment_checklist_created",
      actor_id:    actor.userId,
      details:     { checklist_reference: ref, checklist_type: body.checklist_type, environment: env },
      created_at:  new Date().toISOString(),
    });

    // Return with items
    const { data: full } = await svc
      .from("deployment_cutover_checklists")
      .select(`*, items:deployment_cutover_items(*)`)
      .eq("id", checklist.id)
      .single();

    return NextResponse.json({ checklist: full }, { status: 201 });
  } catch (err) {
    console.error("[deployment-cutover POST]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// ─── PATCH /api/deployment-cutover — checklist-level actions ─────────────────

export async function PATCH(req: NextRequest) {
  try {
    const actor = await resolveAdmin(req);
    if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body: {
      id:          string;
      action:      string;
      review_note?: string;
      owner_name?:  string;
      // system_settings toggle
      setting_key?:   string;
      setting_value?: string;
    } = await req.json();

    if (!body.action) return NextResponse.json({ error: "action is required" }, { status: 400 });

    const svc = getSvc();

    // ── System settings toggle ────────────────────────────────────────────────
    if (body.action === "update_setting") {
      if (!body.setting_key || body.setting_value === undefined) {
        return NextResponse.json({ error: "setting_key and setting_value required" }, { status: 400 });
      }
      const allowed = ["deployment_environment","live_customer_enabled","live_payment_enabled","live_release_enabled"];
      if (!allowed.includes(body.setting_key)) {
        return NextResponse.json({ error: "Unknown setting key" }, { status: 400 });
      }

      const { data: setting, error: sErr } = await svc
        .from("system_settings")
        .update({ value: body.setting_value, updated_by: actor.userId, updated_at: new Date().toISOString() })
        .eq("key", body.setting_key)
        .select()
        .single();

      if (sErr) return NextResponse.json({ error: sErr.message }, { status: 500 });

      await svc.from("audit_logs").insert({
        event_type: "deployment_environment_changed",
        actor_id:   actor.userId,
        details:    { setting_key: body.setting_key, new_value: body.setting_value },
        created_at: new Date().toISOString(),
      });

      return NextResponse.json({ setting });
    }

    // All other actions need a checklist id
    if (!body.id) return NextResponse.json({ error: "id is required" }, { status: 400 });

    const { data: cl, error: fetchErr } = await svc
      .from("deployment_cutover_checklists")
      .select(`*, items:deployment_cutover_items(*)`)
      .eq("id", body.id)
      .single();

    if (fetchErr || !cl) return NextResponse.json({ error: "Checklist not found" }, { status: 404 });

    // ── Pass (approve) ────────────────────────────────────────────────────────
    if (body.action === "pass") {
      const items  = (cl.items ?? []) as { required: boolean; status: string }[];
      const blockers = items.filter(
        (i) => i.required && !["Passed","Waived","Not Applicable"].includes(i.status)
      );
      if (blockers.length > 0 && !body.review_note) {
        return NextResponse.json({
          error:         `${blockers.length} required item(s) still pending or failed. Pass/waive them first, or add a review note to override.`,
          code:          "ITEMS_PENDING",
          pending_count: blockers.length,
        }, { status: 409 });
      }

      const { data: updated } = await svc
        .from("deployment_cutover_checklists")
        .update({
          status:      "Passed",
          reviewed_by: actor.userId,
          reviewed_at: new Date().toISOString(),
          review_note: body.review_note ?? null,
        })
        .eq("id", body.id)
        .select()
        .single();

      await svc.from("audit_logs").insert({
        event_type: "deployment_checklist_created",
        actor_id:   actor.userId,
        details:    { action: "pass", checklist_reference: cl.checklist_reference, review_note: body.review_note },
        created_at: new Date().toISOString(),
      });

      return NextResponse.json({ checklist: updated });
    }

    // ── Fail ──────────────────────────────────────────────────────────────────
    if (body.action === "fail") {
      const { data: updated } = await svc
        .from("deployment_cutover_checklists")
        .update({ status: "Failed", reviewed_by: actor.userId, reviewed_at: new Date().toISOString(), review_note: body.review_note ?? null })
        .eq("id", body.id)
        .select()
        .single();
      return NextResponse.json({ checklist: updated });
    }

    // ── Waive ─────────────────────────────────────────────────────────────────
    if (body.action === "waive") {
      const { data: updated } = await svc
        .from("deployment_cutover_checklists")
        .update({ status: "Waived", reviewed_by: actor.userId, reviewed_at: new Date().toISOString(), review_note: body.review_note ?? null })
        .eq("id", body.id)
        .select()
        .single();
      return NextResponse.json({ checklist: updated });
    }

    // ── Block ─────────────────────────────────────────────────────────────────
    if (body.action === "block") {
      const { data: updated } = await svc
        .from("deployment_cutover_checklists")
        .update({ status: "Blocked", review_note: body.review_note ?? null })
        .eq("id", body.id)
        .select()
        .single();
      return NextResponse.json({ checklist: updated });
    }

    // ── Reset to In Progress ──────────────────────────────────────────────────
    if (body.action === "reset") {
      const { data: updated } = await svc
        .from("deployment_cutover_checklists")
        .update({ status: "In Progress", review_note: body.review_note ?? null })
        .eq("id", body.id)
        .select()
        .single();
      return NextResponse.json({ checklist: updated });
    }

    return NextResponse.json({ error: `Unknown action: ${body.action}` }, { status: 400 });
  } catch (err) {
    console.error("[deployment-cutover PATCH]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
