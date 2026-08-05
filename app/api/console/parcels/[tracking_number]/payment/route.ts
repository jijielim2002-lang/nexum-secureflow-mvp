import { NextRequest, NextResponse } from "next/server";
import { adminClient, verifyAuth, isAdmin, isCustomer } from "@/lib/apiAuth";

// POST /api/console/parcels/[tracking_number]/payment
// Customer uploads payment proof URL; admin verifies.
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ tracking_number: string }> }
) {
  const { tracking_number } = await params;
  const auth = await verifyAuth(req);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const client = adminClient();

  const { data: parcel } = await client
    .from("console_parcels")
    .select("id, customer_company_id, payment_status, parcel_status")
    .eq("tracking_number", tracking_number)
    .single();

  if (!parcel) return NextResponse.json({ error: "Parcel not found." }, { status: 404 });

  if (isCustomer(auth)) {
    if (parcel.customer_company_id !== auth.company_id)
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    if (!body.payment_proof_url)
      return NextResponse.json({ error: "payment_proof_url required." }, { status: 400 });

    await client.from("console_parcels").update({
      payment_proof_url: body.payment_proof_url,
      payment_status:    "Payment Proof Uploaded",
      parcel_status:     "Payment Pending",
    }).eq("id", parcel.id);

    await client.from("console_parcel_events").insert({
      tracking_number,
      event_type:        "Payment Proof Uploaded",
      event_description: "Customer uploaded payment proof.",
      event_source:      "Customer",
    });

    return NextResponse.json({ ok: true, message: "Payment proof uploaded. Awaiting admin verification." });
  }

  if (isAdmin(auth)) {
    const action = body.action; // "verify" | "reject"
    if (!["verify","reject"].includes(action))
      return NextResponse.json({ error: "action must be verify or reject." }, { status: 400 });

    if (action === "verify") {
      await client.from("console_parcels").update({
        payment_status: "Verified",
        parcel_status:  "Payment Verified",
      }).eq("id", parcel.id);
      await client.from("console_parcel_events").insert({
        tracking_number, event_type: "Payment Verified",
        event_description: body.note ?? "Admin verified payment.",
        event_source: "Admin",
      });
    } else {
      await client.from("console_parcels").update({
        payment_status: "Pending",
        parcel_status:  "Payment Pending",
        payment_proof_url: null,
      }).eq("id", parcel.id);
      await client.from("console_parcel_events").insert({
        tracking_number, event_type: "Payment Proof Uploaded",
        event_description: `Admin rejected proof: ${body.note ?? ""}`,
        event_source: "Admin",
      });
    }
    return NextResponse.json({ ok: true, action });
  }

  return NextResponse.json({ error: "Forbidden" }, { status: 403 });
}
