// Shared server-side auth helper for API routes
import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { NextRequest } from "next/server";

const SUPA_URL  = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPA_ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const SUPA_SVC  = process.env.SUPABASE_SERVICE_ROLE_KEY!;

export function adminClient(): SupabaseClient {
  return createClient(SUPA_URL, SUPA_SVC, { auth: { persistSession: false } });
}

export interface AuthProfile {
  userId:     string;
  id:         string;
  role:       string;
  company_id: string | null;
}

export async function verifyAuth(req: NextRequest): Promise<AuthProfile | null> {
  const token = req.headers.get("authorization")?.replace("Bearer ", "").trim() ?? "";
  if (!token) return null;
  const anon = createClient(SUPA_URL, SUPA_ANON, { auth: { persistSession: false } });
  const { data: { user }, error } = await anon.auth.getUser(token);
  if (error || !user) return null;
  const { data: profile } = await adminClient()
    .from("profiles")
    .select("id, role, company_id")
    .eq("id", user.id)
    .single();
  if (!profile) return null;
  return { ...profile as { id: string; role: string; company_id: string | null }, userId: user.id };
}

export function isAdmin(p: AuthProfile)    { return p.role === "admin"; }
export function isProvider(p: AuthProfile) { return p.role === "service_provider"; }
export function isCustomer(p: AuthProfile) { return p.role === "customer"; }
