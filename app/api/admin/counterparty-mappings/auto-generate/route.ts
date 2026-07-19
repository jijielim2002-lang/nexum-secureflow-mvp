/**
 * POST /api/admin/counterparty-mappings/auto-generate
 *
 * Scans all secured_jobs for unique company pairs, then creates a default
 * Masked mapping for every pair that doesn't already have one.
 *
 * Auto-assigns codes:
 *   - Service provider seen by customer  → SP-001, SP-002, …
 *   - Customer seen by service provider  → CU-001, CU-002, …
 *
 * Admin only.
 */
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

function svc() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? "",
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}

async function requireAdmin(req: NextRequest) {
  const token = (req.headers.get("authorization") ?? "").replace("Bearer ", "").trim();
  if (!token) return null;
  const db = svc();
  const { data: { user } } = await db.auth.getUser(token);
  if (!user) return null;
  const { data: profile } = await db
    .from("profiles").select("role").eq("id", user.id).maybeSingle();
  if (profile?.role !== "admin") return null;
  return { userId: user.id };
}

function pad(n: number) { return String(n).padStart(3, "0"); }

export async function POST(req: NextRequest) {
  const caller = await requireAdmin(req);
  if (!caller) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const db = svc();

  // 1. All jobs with both company IDs
  const { data: jobs, error: jobsErr } = await db
    .from("secured_jobs")
    .select("service_provider_company_id, customer_company_id")
    .not("service_provider_company_id", "is", null)
    .not("customer_company_id", "is", null);

  if (jobsErr) return NextResponse.json({ error: jobsErr.message }, { status: 500 });

  // 2. Unique pairs in both directions
  type Pair = { real: string; owner: string; kind: "SP" | "CU" };
  const pairMap = new Map<string, Pair>();

  for (const j of (jobs ?? [])) {
    const sp   = j.service_provider_company_id as string;
    const cust = j.customer_company_id as string;
    if (sp === cust) continue;
    const keyA = `${sp}__${cust}`;
    const keyB = `${cust}__${sp}`;
    if (!pairMap.has(keyA)) pairMap.set(keyA, { real: sp,   owner: cust, kind: "SP" });
    if (!pairMap.has(keyB)) pairMap.set(keyB, { real: cust, owner: sp,   kind: "CU" });
  }

  if (pairMap.size === 0) {
    return NextResponse.json({ ok: true, created: 0, message: "No company pairs found in jobs." });
  }

  // 3. Existing mappings to skip
  const { data: existing } = await db
    .from("counterparty_mappings")
    .select("real_company_id, owner_company_id, masked_code");

  const existingSet = new Set<string>(
    (existing ?? []).map((e: { real_company_id: string; owner_company_id: string }) =>
      `${e.real_company_id}__${e.owner_company_id}`
    )
  );

  // 4. Find highest existing sequence numbers
  let spSeq = 0;
  let cuSeq = 0;
  for (const m of (existing ?? [])) {
    const code = (m.masked_code as string) ?? "";
    const spMatch = code.match(/^SP-(\d+)$/);
    const cuMatch = code.match(/^CU-(\d+)$/);
    if (spMatch) spSeq = Math.max(spSeq, parseInt(spMatch[1]));
    if (cuMatch) cuSeq = Math.max(cuSeq, parseInt(cuMatch[1]));
  }

  // 5. Build inserts
  const inserts: Array<{
    real_company_id:   string;
    owner_company_id:  string;
    masked_code:       string;
    masked_name:       null;
    relationship_type: string;
    visibility_level:  string;
  }> = [];

  for (const [key, pair] of pairMap) {
    if (existingSet.has(key)) continue;
    const code = pair.kind === "SP"
      ? `SP-${pad(++spSeq)}`
      : `CU-${pad(++cuSeq)}`;
    inserts.push({
      real_company_id:   pair.real,
      owner_company_id:  pair.owner,
      masked_code:       code,
      masked_name:       null,
      relationship_type: pair.kind === "SP" ? "Service Provider" : "Customer",
      visibility_level:  "Masked",
    });
  }

  if (inserts.length === 0) {
    return NextResponse.json({ ok: true, created: 0, message: "All pairs already have mappings." });
  }

  // 6. Insert in batches of 50
  let created = 0;
  for (let i = 0; i < inserts.length; i += 50) {
    const { error: insertErr } = await db.from("counterparty_mappings").insert(inserts.slice(i, i + 50));
    if (insertErr) return NextResponse.json({ error: insertErr.message }, { status: 500 });
    created += inserts.slice(i, i + 50).length;
  }

  return NextResponse.json({
    ok: true,
    created,
    message: `Created ${created} mapping${created !== 1 ? "s" : ""}.`,
  });
}
