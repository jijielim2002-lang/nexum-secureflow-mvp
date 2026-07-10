import { NextRequest, NextResponse } from "next/server";
import { createClient }              from "@supabase/supabase-js";

// ─── Supabase service-role client ─────────────────────────────────────────────

function getSvc() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Missing Supabase env vars");
  return createClient(url, key);
}

// ─── Auth helper — admin only ─────────────────────────────────────────────────

async function resolveAdmin(req: NextRequest) {
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
  if (!profile || profile.role !== "admin") return null;
  return { userId: user.id };
}

// ─── Types ────────────────────────────────────────────────────────────────────

export interface SchemaTableHealth {
  name:                  string;
  is_required:           boolean;
  rls_enabled:           boolean;
  policy_count:          number;
  has_updated_at_trigger: boolean;
}

export interface SchemaIndexHealth {
  index_name: string;
  exists:     boolean;
}

export interface StorageBucketHealth {
  bucket_id: string;
  public:    boolean;
  exists:    boolean;
}

export interface SchemaHelperFunctions {
  nexum_is_admin:              boolean;
  nexum_my_role:               boolean;
  nexum_my_company_id:         boolean;
  set_updated_at:              boolean;
  get_schema_health_diagnostic: boolean;
}

export interface SchemaHealthResult {
  tables:                  SchemaTableHealth[];
  missing_required_tables: string[];
  indexes:                 SchemaIndexHealth[];
  missing_indexes:         string[];
  storage_buckets:         StorageBucketHealth[];
  helper_functions:        SchemaHelperFunctions;
  checked_at:              string;
}

// ─── GET /api/schema-health ───────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  try {
    const actor = await resolveAdmin(req);
    if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const svc = getSvc();

    // Call the PostgreSQL diagnostic function
    const { data, error } = await svc.rpc("get_schema_health_diagnostic");

    if (error) {
      // If the function doesn't exist yet, return a helpful error
      if (error.code === "42883") {
        return NextResponse.json({
          error: "Schema health function not installed. Run supabase/003_schema_health_fn.sql in Supabase SQL Editor.",
          code:  "FUNCTION_NOT_FOUND",
        }, { status: 503 });
      }
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(data as SchemaHealthResult);
  } catch (err) {
    console.error("[schema-health GET]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
