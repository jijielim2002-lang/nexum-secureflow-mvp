import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

// ─── Two separate clients ──────────────────────────────────────────────────────
//
// authClient  — validates user JWTs only.  Never makes PostgREST calls.
//               Uses service key so it can call auth.getUser() reliably.
//
// svcClient   — ALL data operations.  Forces the service-role JWT on every
//               PostgREST request via explicit global headers, so RLS is
//               bypassed unconditionally regardless of any auth state.
// ──────────────────────────────────────────────────────────────────────────────

const SB_URL  = process.env.NEXT_PUBLIC_SUPABASE_URL    ?? "";
const SVC_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY   ?? "";

function authClient() {
  return createClient(SB_URL, SVC_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function svcClient() {
  if (!SB_URL || !SVC_KEY) {
    throw new Error(
      `Missing env vars — NEXT_PUBLIC_SUPABASE_URL=${!!SB_URL}, SUPABASE_SERVICE_ROLE_KEY=${!!SVC_KEY}`,
    );
  }
  return createClient(SB_URL, SVC_KEY, {
    auth: {
      persistSession:       false,
      autoRefreshToken:     false,
      detectSessionInUrl:   false,
    },
    // Pin the service-role JWT so PostgREST always receives it,
    // even if authClient interactions somehow affect global state.
    global: {
      headers: {
        apikey:        SVC_KEY,
        Authorization: `Bearer ${SVC_KEY}`,
      },
    },
  });
}

// ─── Error shape helper ────────────────────────────────────────────────────────

type DbErr = { code?: string; message?: string; details?: string; hint?: string };

function fmtErr(e: DbErr | null | undefined) {
  if (!e) return null;
  return {
    code:    e.code    ?? null,
    message: e.message ?? null,
    details: e.details ?? null,
    hint:    e.hint    ?? null,
  };
}

// ─── Row types ─────────────────────────────────────────────────────────────────

type JobRow = {
  id: string;
  service_provider: string | null;
  customer: string | null;
  service_provider_company_id: string | null;
  customer_company_id: string | null;
};

type CompanyRow = { id: string; name: string; type: string | null };

// ─── Handler ──────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  // ── 1. Auth — use authClient only for JWT verification ─────────────────────
  const token = req.headers.get("Authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  if (!token) {
    return NextResponse.json({ error: "Unauthorized — no token" }, { status: 401 });
  }

  const auth = authClient();
  const { data: { user }, error: authErr } = await auth.auth.getUser(token);
  if (authErr || !user) {
    return NextResponse.json({
      error:  "Unauthorized",
      detail: fmtErr(authErr),
    }, { status: 401 });
  }

  // ── 2. Admin check — use svcClient for data (bypasses RLS) ─────────────────
  let svc: ReturnType<typeof svcClient>;
  try {
    svc = svcClient();
  } catch (e) {
    return NextResponse.json({
      error: e instanceof Error ? e.message : "Service client init failed",
    }, { status: 500 });
  }

  const { data: profile, error: profileErr } = await svc
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (profileErr || profile?.role !== "admin") {
    return NextResponse.json({ error: "Forbidden — admin only" }, { status: 403 });
  }

  // ── 3. Load secured_jobs ───────────────────────────────────────────────────
  const { data: jobs, error: jobErr } = await svc
    .from("secured_jobs")
    .select("id, service_provider, customer, service_provider_company_id, customer_company_id");

  if (jobErr) {
    return NextResponse.json({
      error:  "Failed to load secured_jobs",
      detail: fmtErr(jobErr),
    }, { status: 500 });
  }

  const jobList = (jobs ?? []) as unknown as JobRow[];

  // ── 4. Load existing companies ─────────────────────────────────────────────
  const { data: existing, error: existErr } = await svc
    .from("companies")
    .select("id, name, type");

  if (existErr) {
    return NextResponse.json({
      error:  "Failed to load companies",
      detail: fmtErr(existErr),
    }, { status: 500 });
  }

  // Two maps — one per role — so the same name can exist as both types.
  // Accept legacy 'Provider' spelling alongside 'Service Provider'.
  const existProviderByName = new Map<string, string>(); // lower(trim(name)) → id
  const existCustomerByName = new Map<string, string>();

  for (const c of (existing ?? []) as unknown as CompanyRow[]) {
    const norm = c.name.trim().toLowerCase();
    if (c.type === "Service Provider" || c.type === "Provider") {
      existProviderByName.set(norm, c.id);
    } else if (c.type === "Customer") {
      existCustomerByName.set(norm, c.id);
    }
  }

  // ── 5. Collect unique display names to create ──────────────────────────────
  const toCreateProviders: string[] = [];
  const toCreateCustomers: string[] = [];
  const seenP = new Set<string>();
  const seenC = new Set<string>();

  for (const j of jobList) {
    if (!j.service_provider) continue;
    const norm = j.service_provider.trim().toLowerCase();
    if (!existProviderByName.has(norm) && !seenP.has(norm)) {
      seenP.add(norm);
      toCreateProviders.push(j.service_provider.trim());
    }
  }

  for (const j of jobList) {
    if (!j.customer) continue;
    const norm = j.customer.trim().toLowerCase();
    if (!existCustomerByName.has(norm) && !seenC.has(norm)) {
      seenC.add(norm);
      toCreateCustomers.push(j.customer.trim());
    }
  }

  // ── 6. Insert new companies ────────────────────────────────────────────────
  let providersCreated = 0;
  let customersCreated = 0;
  const newProviderByName = new Map<string, string>();
  const newCustomerByName = new Map<string, string>();
  const now = new Date().toISOString();

  if (toCreateProviders.length > 0) {
    const rows = toCreateProviders.map((name) => ({
      name,
      type:       "Service Provider",   // the CHECK-approved value in companies.type
      status:     "Active",
      created_at: now,
      updated_at: now,
    }));

    const { data: inserted, error: insertErr } = await svc
      .from("companies")
      .insert(rows)
      .select("id, name");

    if (insertErr) {
      return NextResponse.json({
        error:     "Failed to insert service provider companies",
        detail:    fmtErr(insertErr),
        attempted: toCreateProviders,
      }, { status: 500 });
    }

    for (const row of (inserted ?? []) as Array<{ id: string; name: string }>) {
      newProviderByName.set(row.name.trim().toLowerCase(), row.id);
      providersCreated++;
    }
  }

  if (toCreateCustomers.length > 0) {
    const rows = toCreateCustomers.map((name) => ({
      name,
      type:       "Customer",
      status:     "Active",
      created_at: now,
      updated_at: now,
    }));

    const { data: inserted, error: insertErr } = await svc
      .from("companies")
      .insert(rows)
      .select("id, name");

    if (insertErr) {
      return NextResponse.json({
        error:     "Failed to insert customer companies",
        detail:    fmtErr(insertErr),
        attempted: toCreateCustomers,
      }, { status: 500 });
    }

    for (const row of (inserted ?? []) as Array<{ id: string; name: string }>) {
      newCustomerByName.set(row.name.trim().toLowerCase(), row.id);
      customersCreated++;
    }
  }

  // ── 7. Build full name→id maps (existing + newly created) ─────────────────
  const allProviderByName = new Map([...existProviderByName, ...newProviderByName]);
  const allCustomerByName = new Map([...existCustomerByName, ...newCustomerByName]);

  // ── 8. Group unlinked job IDs by target company for batch update ───────────
  const providerLinkMap = new Map<string, string[]>(); // companyId → jobIds
  const customerLinkMap = new Map<string, string[]>();

  for (const j of jobList) {
    if (!j.service_provider_company_id && j.service_provider) {
      const cid = allProviderByName.get(j.service_provider.trim().toLowerCase());
      if (cid) {
        const ids = providerLinkMap.get(cid) ?? [];
        ids.push(j.id);
        providerLinkMap.set(cid, ids);
      }
    }
    if (!j.customer_company_id && j.customer) {
      const cid = allCustomerByName.get(j.customer.trim().toLowerCase());
      if (cid) {
        const ids = customerLinkMap.get(cid) ?? [];
        ids.push(j.id);
        customerLinkMap.set(cid, ids);
      }
    }
  }

  // ── 9. One UPDATE per company (not per job) ────────────────────────────────
  let providersLinked = 0;
  let customersLinked = 0;
  const linkErrors: string[] = [];

  for (const [cid, jobIds] of providerLinkMap) {
    const { error: updErr } = await svc
      .from("secured_jobs")
      .update({ service_provider_company_id: cid })
      .in("id", jobIds);
    if (updErr) {
      linkErrors.push(`provider(${cid}): ${updErr.code} — ${updErr.message}`);
    } else {
      providersLinked += jobIds.length;
    }
  }

  for (const [cid, jobIds] of customerLinkMap) {
    const { error: updErr } = await svc
      .from("secured_jobs")
      .update({ customer_company_id: cid })
      .in("id", jobIds);
    if (updErr) {
      linkErrors.push(`customer(${cid}): ${updErr.code} — ${updErr.message}`);
    } else {
      customersLinked += jobIds.length;
    }
  }

  // ── 10. Return result ──────────────────────────────────────────────────────
  return NextResponse.json({
    success:           true,
    providers_created: providersCreated,
    customers_created: customersCreated,
    providers_linked:  providersLinked,
    customers_linked:  customersLinked,
    link_errors:       linkErrors,
    message: [
      `Created ${providersCreated} service provider + ${customersCreated} customer companies.`,
      `Linked ${providersLinked} provider jobs and ${customersLinked} customer jobs.`,
      ...(linkErrors.length > 0 ? [`Errors: ${linkErrors.join("; ")}`] : []),
    ].join(" "),
  });
}
