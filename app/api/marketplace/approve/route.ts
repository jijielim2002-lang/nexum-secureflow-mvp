// POST /api/marketplace/approve — admin approve/reject/suspend/expire/go-live a listing

import { NextRequest, NextResponse } from "next/server";
import { verifyAuth, adminClient, isAdmin } from "@/lib/apiAuth";

export async function POST(req: NextRequest) {
  const auth = await verifyAuth(req);
  if (!auth || !isAdmin(auth)) return NextResponse.json({ ok: false, error: "Admin only" }, { status: 403 });

  const body = await req.json() as {
    listing_reference: string;
    action: "approve" | "reject" | "go_live" | "suspend" | "expire";
    review_note?: string;
    commission_rate?: number;
  };

  if (!body.listing_reference || !body.action)
    return NextResponse.json({ ok: false, error: "listing_reference and action required" }, { status: 400 });

  const db = adminClient();
  const update: Record<string, unknown> = {
    reviewed_by: auth.userId,
    reviewed_at: new Date().toISOString(),
    review_note: body.review_note ?? null,
  };

  switch (body.action) {
    case "approve":
      update.admin_review_status = "Approved";
      update.status              = "Approved";
      break;
    case "go_live":
      update.status              = "Live";
      update.admin_review_status = "Approved";
      break;
    case "reject":
      update.admin_review_status = "Rejected";
      update.status              = "Rejected";
      break;
    case "suspend":
      update.status = "Suspended";
      break;
    case "expire":
      update.status = "Expired";
      break;
    default:
      return NextResponse.json({ ok: false, error: "Invalid action" }, { status: 400 });
  }

  const { error } = await db
    .from("service_listings")
    .update(update)
    .eq("listing_reference", body.listing_reference);

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, action: body.action });
}
