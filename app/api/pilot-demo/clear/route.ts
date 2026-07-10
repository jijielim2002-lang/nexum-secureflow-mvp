import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const svc = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

const CLEARABLE_TABLES = {
  notifications:      "notifications",
  workflow_tasks:     "workflow_tasks",
  communication_logs: "communication_logs",
  tracking_sync_logs: "tracking_sync_logs",
  audit_logs:         "audit_logs",
} as const;

type ClearableTable = keyof typeof CLEARABLE_TABLES;

async function validateAdmin(req: NextRequest): Promise<boolean> {
  const token = req.headers.get("Authorization")?.replace("Bearer ", "");
  if (!token) return false;
  const { data: { user } } = await svc.auth.getUser(token);
  if (!user) return false;
  const { data: p } = await svc.from("profiles").select("role").eq("id", user.id).single();
  return p?.role === "admin";
}

export async function POST(req: NextRequest) {
  const isAdmin = await validateAdmin(req);
  if (!isAdmin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json() as { table: string; confirm?: string };
  const { table, confirm } = body;

  if (!table || !(table in CLEARABLE_TABLES)) {
    return NextResponse.json({ error: `Unknown table: ${table}` }, { status: 400 });
  }

  if (confirm !== "CONFIRM_CLEAR") {
    return NextResponse.json({ error: "Missing confirmation token" }, { status: 400 });
  }

  const dbTable = CLEARABLE_TABLES[table as ClearableTable];

  // Use a filter that matches all rows (neq on a timestamp that is always true)
  const { error, count } = await svc
    .from(dbTable)
    .delete({ count: "exact" })
    .gte("created_at", "2000-01-01T00:00:00Z");

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ cleared: count ?? 0, table: dbTable });
}
