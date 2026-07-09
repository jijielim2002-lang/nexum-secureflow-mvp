import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const svc = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

// ─── Admin guard ──────────────────────────────────────────────────────────────

async function validateAdmin(req: NextRequest): Promise<string | null> {
  const token = req.headers.get("Authorization")?.replace("Bearer ", "");
  if (!token) return null;
  const { data: { user } } = await svc.auth.getUser(token);
  if (!user) return null;
  const { data: p } = await svc.from("profiles").select("role").eq("id", user.id).single();
  return p?.role === "admin" ? user.id : null;
}

// ─── GET /api/admin/users — list all users ────────────────────────────────────

export async function GET(req: NextRequest) {
  const actorId = await validateAdmin(req);
  if (!actorId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Fetch profiles + companies in parallel
  const [profilesRes, companiesRes] = await Promise.all([
    svc.from("profiles").select("id, email, full_name, role, company_id, status, created_at").order("created_at", { ascending: false }),
    svc.from("companies").select("id, name"),
  ]);

  const profiles  = profilesRes.data ?? [];
  const companies = companiesRes.data ?? [];
  const companyMap = Object.fromEntries(companies.map((c: { id: string; name: string }) => [c.id, c.name]));

  // Fetch last sign-in from auth admin API
  const { data: authList } = await svc.auth.admin.listUsers({ perPage: 1000 });
  const lastSignInMap: Record<string, string | null> = {};
  for (const u of authList?.users ?? []) {
    lastSignInMap[u.id] = u.last_sign_in_at ?? null;
  }

  const users = profiles.map((p: {
    id: string; email: string | null; full_name: string | null;
    role: string | null; company_id: string | null; status: string | null; created_at: string;
  }) => ({
    id:           p.id,
    email:        p.email,
    full_name:    p.full_name,
    role:         p.role,
    company_id:   p.company_id,
    company_name: p.company_id ? (companyMap[p.company_id] ?? null) : null,
    status:       p.status ?? "active",
    created_at:   p.created_at,
    last_sign_in: lastSignInMap[p.id] ?? null,
  }));

  return NextResponse.json({ users });
}

// ─── PATCH /api/admin/users — update a profile ────────────────────────────────

interface PatchBody {
  userId:    string;
  fullName?: string;
  role?:     string;
  companyId?: string | null;
  status?:   string;
}

export async function PATCH(req: NextRequest) {
  const actorId = await validateAdmin(req);
  if (!actorId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: PatchBody;
  try {
    body = (await req.json()) as PatchBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { userId, fullName, role, companyId, status } = body;
  if (!userId) return NextResponse.json({ error: "userId required" }, { status: 400 });

  const update: Record<string, unknown> = {};
  if (fullName  !== undefined) update.full_name  = fullName;
  if (role      !== undefined) update.role        = role;
  if (companyId !== undefined) update.company_id  = companyId;
  if (status    !== undefined) update.status      = status;

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
  }

  const { error } = await svc.from("profiles").update(update).eq("id", userId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await svc.from("audit_logs").insert({
    actor_id:    actorId,
    actor_role:  "admin",
    action:      "pilot_user_updated",
    description: `Profile ${userId} updated: ${JSON.stringify(update)}`,
  });

  return NextResponse.json({ success: true });
}
