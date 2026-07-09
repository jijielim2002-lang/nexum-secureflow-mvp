// ─── POST /api/compliance-wording-scan ───────────────────────────────────────
// Run wording scan across specified source types (or all if none specified).
// Body: { sourceTypes?: string[], actorName?: string }
// Returns: { newFindings, totalScanned, bySource }

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { WORDING_AUDIT_ACTIONS } from "@/lib/complianceWording";

const svc = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

async function getAdminId(req: NextRequest): Promise<string | null> {
  const token = req.headers.get("Authorization")?.replace("Bearer ", "");
  if (!token) return null;
  const { data: { user } } = await svc.auth.getUser(token);
  if (!user) return null;
  const { data: p } = await svc.from("profiles").select("role").eq("id", user.id).single();
  return p?.role === "admin" ? user.id : null;
}

interface Rule { id: string; unsafe_wording: string; preferred_wording: string; severity: string }
interface Finding { source_type: string; source_id: string; detected_wording: string; suggested_wording: string; severity: string }

function scanText(text: string | null | undefined, rules: Rule[]): { detected_wording: string; suggested_wording: string; severity: string }[] {
  if (!text) return [];
  const lower = text.toLowerCase();
  return rules
    .filter((r) => lower.includes(r.unsafe_wording.toLowerCase()))
    .map((r) => ({ detected_wording: r.unsafe_wording, suggested_wording: r.preferred_wording, severity: r.severity }));
}

const ALL_SOURCE_TYPES = [
  "communication_log",
  "credit_pack",
  "financing_offer",
  "payment_partner_setup",
  "compliance_check",
];

export async function POST(req: NextRequest) {
  const adminId = await getAdminId(req);
  if (!adminId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: { sourceTypes?: string[]; actorName?: string } = {};
  try { body = await req.json(); } catch { /* empty body ok */ }

  const targetSources = (body.sourceTypes && body.sourceTypes.length > 0)
    ? body.sourceTypes
    : ALL_SOURCE_TYPES;

  // Fetch active rules
  const { data: rulesData, error: rulesErr } = await svc
    .from("compliance_wording_rules")
    .select("id, unsafe_wording, preferred_wording, severity")
    .eq("is_active", true);
  if (rulesErr) return NextResponse.json({ error: rulesErr.message }, { status: 500 });
  const rules: Rule[] = (rulesData ?? []) as Rule[];
  if (rules.length === 0) return NextResponse.json({ newFindings: 0, totalScanned: 0, bySource: {} });

  // Fetch existing Open results to avoid duplicates: key = source_type|source_id|detected_wording
  const { data: existingData } = await svc
    .from("compliance_wording_scan_results")
    .select("source_type, source_id, detected_wording")
    .eq("status", "Open");
  const existingKeys = new Set(
    (existingData ?? []).map((r: { source_type: string; source_id: string; detected_wording: string }) =>
      `${r.source_type}|${r.source_id}|${r.detected_wording.toLowerCase()}`)
  );

  const findings: Finding[] = [];
  const bySource: Record<string, number> = {};

  for (const sourceType of targetSources) {
    let rows: Array<{ id: string; [key: string]: unknown }> = [];

    if (sourceType === "communication_log") {
      const { data } = await svc.from("communication_logs").select("id, subject, message").limit(500);
      rows = (data ?? []) as typeof rows;
      for (const row of rows) {
        const hits = [
          ...scanText(row.subject as string, rules),
          ...scanText(row.message as string, rules),
        ];
        for (const h of hits) {
          const key = `${sourceType}|${row.id}|${h.detected_wording.toLowerCase()}`;
          if (!existingKeys.has(key)) {
            existingKeys.add(key);
            findings.push({ source_type: sourceType, source_id: row.id, ...h });
          }
        }
      }
    }

    if (sourceType === "credit_pack") {
      const { data } = await svc.from("credit_packs").select("id, pack_title, executive_summary, recommended_conditions").limit(500);
      rows = (data ?? []) as typeof rows;
      for (const row of rows) {
        const hits = [
          ...scanText(row.pack_title as string, rules),
          ...scanText(row.executive_summary as string, rules),
          ...scanText(row.recommended_conditions as string, rules),
        ];
        for (const h of hits) {
          const key = `${sourceType}|${row.id}|${h.detected_wording.toLowerCase()}`;
          if (!existingKeys.has(key)) {
            existingKeys.add(key);
            findings.push({ source_type: sourceType, source_id: row.id, ...h });
          }
        }
      }
    }

    if (sourceType === "financing_offer") {
      const { data } = await svc.from("financing_offers").select("id, estimated_rate_note, required_conditions, risk_notes").limit(500);
      rows = (data ?? []) as typeof rows;
      for (const row of rows) {
        const hits = [
          ...scanText(row.estimated_rate_note as string, rules),
          ...scanText(row.required_conditions as string, rules),
          ...scanText(row.risk_notes as string, rules),
        ];
        for (const h of hits) {
          const key = `${sourceType}|${row.id}|${h.detected_wording.toLowerCase()}`;
          if (!existingKeys.has(key)) {
            existingKeys.add(key);
            findings.push({ source_type: sourceType, source_id: row.id, ...h });
          }
        }
      }
    }

    if (sourceType === "payment_partner_setup") {
      const { data } = await svc.from("payment_partner_setups").select("id, compliance_notes, allowed_wording, prohibited_wording, settlement_process_note").limit(200);
      rows = (data ?? []) as typeof rows;
      for (const row of rows) {
        const hits = [
          ...scanText(row.compliance_notes as string, rules),
          ...scanText(row.allowed_wording as string, rules),
          ...scanText(row.settlement_process_note as string, rules),
        ];
        for (const h of hits) {
          const key = `${sourceType}|${row.id}|${h.detected_wording.toLowerCase()}`;
          if (!existingKeys.has(key)) {
            existingKeys.add(key);
            findings.push({ source_type: sourceType, source_id: row.id, ...h });
          }
        }
      }
    }

    if (sourceType === "compliance_check") {
      const { data } = await svc.from("payment_compliance_checks").select("id, compliance_note").not("compliance_note", "is", null).limit(500);
      rows = (data ?? []) as typeof rows;
      for (const row of rows) {
        const hits = scanText(row.compliance_note as string, rules);
        for (const h of hits) {
          const key = `${sourceType}|${row.id}|${h.detected_wording.toLowerCase()}`;
          if (!existingKeys.has(key)) {
            existingKeys.add(key);
            findings.push({ source_type: sourceType, source_id: row.id, ...h });
          }
        }
      }
    }

    bySource[sourceType] = findings.filter((f) => f.source_type === sourceType).length;
  }

  const now = new Date().toISOString();
  let newFindings = 0;
  if (findings.length > 0) {
    const inserts = findings.map((f) => ({ ...f, status: "Open", created_at: now }));
    const { error: insErr } = await svc.from("compliance_wording_scan_results").insert(inserts);
    if (insErr) return NextResponse.json({ error: insErr.message }, { status: 500 });
    newFindings = findings.length;
  }

  const actor = body.actorName ?? "Nexum Admin";
  await svc.from("audit_logs").insert({
    actor_role:  "admin",
    actor_name:  actor,
    action:      WORDING_AUDIT_ACTIONS.scan_run,
    description: `Wording scan run across: ${targetSources.join(", ")}. New findings: ${newFindings}.`,
    created_at:  now,
  });

  if (newFindings > 0) {
    const criticalCount = findings.filter((f) => f.severity === "Critical").length;
    await svc.from("audit_logs").insert({
      actor_role:  "admin",
      actor_name:  "Nexum SecureFlow",
      action:      WORDING_AUDIT_ACTIONS.unsafe_detected,
      description: `${newFindings} unsafe wording instance${newFindings !== 1 ? "s" : ""} detected (${criticalCount} critical). Sources: ${[...new Set(findings.map((f) => f.source_type))].join(", ")}.`,
      created_at:  now,
    });
  }

  return NextResponse.json({ success: true, newFindings, bySource, totalScanned: targetSources.length });
}
