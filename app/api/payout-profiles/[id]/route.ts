// ─── PATCH /api/payout-profiles/[id] ─────────────────────────────────────────
// Actions on a provider payout profile.
//
// Provider actions (require own company match):
//   update_fields  — save profile details without changing status
//   submit         — submit profile for admin verification (Pending → Submitted)
//
// Admin actions:
//   verify         — approve profile (any → Verified)
//   reject         — reject profile with reason (any → Rejected)
//   suspend        — suspend profile (any → Suspended)
//   add_remarks    — add internal admin remarks without changing status
//
// SECURITY:
//   account_reference_masked must never be a full account number.
//   Caller is responsible for masking before sending.

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { PAYOUT_AUDIT_ACTIONS } from "@/lib/payoutProfile";

const svc = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

// ─── Auth helpers ─────────────────────────────────────────────────────────────

async function getCallerInfo(req: NextRequest): Promise<{
  userId: string | null;
  role:   string | null;
  companyId: string | null;
}> {
  const token = req.headers.get("Authorization")?.replace("Bearer ", "");
  if (!token) return { userId: null, role: null, companyId: null };
  const { data: { user } } = await svc.auth.getUser(token);
  if (!user) return { userId: null, role: null, companyId: null };
  const { data: p } = await svc
    .from("profiles")
    .select("role, company_id")
    .eq("id", user.id)
    .single();
  return { userId: user.id, role: p?.role ?? null, companyId: p?.company_id ?? null };
}

// ─── PATCH ────────────────────────────────────────────────────────────────────

type PatchAction = "update_fields" | "submit" | "verify" | "reject" | "suspend" | "add_remarks";

interface PatchBody {
  action:                   PatchAction;
  actorId?:                 string;
  actorRole?:               string;
  actorName?:               string;
  // field updates
  accountHolderName?:       string;
  bankName?:                string;
  bankCountry?:             string;
  currency?:                string;
  accountReferenceMasked?:  string;
  payoutMethod?:            string;
  verificationDocumentId?:  string;
  // admin only
  rejectionReason?:         string;
  remarks?:                 string;
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const caller = await getCallerInfo(req);
  if (!caller.userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const isAdmin    = caller.role === "admin";
  const isProvider = caller.role === "service_provider";

  let body: PatchBody;
  try { body = (await req.json()) as PatchBody; }
  catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  const { action, actorId, actorRole, actorName } = body;
  const now = new Date().toISOString();

  // Fetch profile
  const { data: profile, error: fetchErr } = await svc
    .from("provider_payout_profiles")
    .select("*")
    .eq("id", id)
    .single();

  if (fetchErr || !profile) {
    return NextResponse.json({ error: "Payout profile not found" }, { status: 404 });
  }

  // Provider can only act on own profile
  if (isProvider && profile.provider_company_id !== caller.companyId) {
    return NextResponse.json({ error: "Unauthorized — not your profile" }, { status: 403 });
  }

  // Admin-only actions
  if (["verify", "reject", "suspend", "add_remarks"].includes(action) && !isAdmin) {
    return NextResponse.json({ error: "Unauthorized — admin only" }, { status: 403 });
  }

  // ── update_fields ─────────────────────────────────────────────────────────
  if (action === "update_fields") {
    if (!isAdmin && !["Pending", "Rejected"].includes(profile.verification_status)) {
      return NextResponse.json({
        error: `Cannot edit profile with status: ${profile.verification_status}. Only Pending or Rejected profiles can be updated.`
      }, { status: 400 });
    }

    const update: Record<string, unknown> = { updated_at: now };
    if (body.accountHolderName      !== undefined) update["account_holder_name"]      = body.accountHolderName;
    if (body.bankName               !== undefined) update["bank_name"]               = body.bankName;
    if (body.bankCountry            !== undefined) update["bank_country"]            = body.bankCountry;
    if (body.currency               !== undefined) update["currency"]               = body.currency;
    if (body.accountReferenceMasked !== undefined) update["account_reference_masked"] = body.accountReferenceMasked;
    if (body.payoutMethod           !== undefined) update["payout_method"]           = body.payoutMethod;
    if (body.verificationDocumentId !== undefined) update["verification_document_id"] = body.verificationDocumentId;

    const { error } = await svc.from("provider_payout_profiles").update(update).eq("id", id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ success: true });
  }

  // ── add_remarks (admin only, no status change) ────────────────────────────
  if (action === "add_remarks") {
    const { error } = await svc
      .from("provider_payout_profiles")
      .update({ remarks: body.remarks ?? null, updated_at: now })
      .eq("id", id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ success: true });
  }

  // ── submit (provider: Pending/Rejected → Submitted) ───────────────────────
  if (action === "submit") {
    if (!["Pending", "Rejected"].includes(profile.verification_status)) {
      return NextResponse.json({
        error: `Cannot submit profile with status: ${profile.verification_status}.`
      }, { status: 400 });
    }

    if (!profile.account_holder_name || !profile.bank_name || !profile.account_reference_masked) {
      return NextResponse.json({
        error: "Please fill in Account Holder Name, Bank Name, and Account Reference before submitting."
      }, { status: 400 });
    }

    const { error } = await svc
      .from("provider_payout_profiles")
      .update({ verification_status: "Submitted", rejection_reason: null, updated_at: now })
      .eq("id", id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    const auditAction = PAYOUT_AUDIT_ACTIONS["Submitted"];
    await svc.from("audit_logs").insert({
      job_reference: null,
      actor_role:    actorRole ?? "service_provider",
      actor_name:    actorName ?? "Service Provider",
      action:        auditAction,
      description:   `Payout profile submitted for verification. Bank: ${profile.bank_name}. Method: ${profile.payout_method}. Account: ${profile.account_reference_masked}.`,
      created_at:    now,
    });

    // Notify admin
    await svc.from("notifications").insert({
      job_reference:     null,
      recipient_role:    "admin",
      notification_type: "Payout Profile Submitted",
      priority:          "Medium",
      title:             `Payout profile submitted — ${actorName ?? "Provider"} awaiting verification`,
      message:           `A service provider has submitted a payout profile for verification. Bank: ${profile.bank_name ?? "—"}, Method: ${profile.payout_method}. Please review and verify before release instructions can be processed.`,
      action_url:        `/admin/payout-profiles`,
      actor_id: actorId, actor_name: actorName, actor_role: actorRole, created_at: now,
    });

    return NextResponse.json({ success: true, newStatus: "Submitted" });
  }

  // ── verify (admin) ────────────────────────────────────────────────────────
  if (action === "verify") {
    const { error } = await svc
      .from("provider_payout_profiles")
      .update({
        verification_status: "Verified",
        verified_by:         caller.userId,
        verified_at:         now,
        rejection_reason:    null,
        remarks:             body.remarks ?? profile.remarks,
        updated_at:          now,
      })
      .eq("id", id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    await svc.from("audit_logs").insert({
      job_reference: null,
      actor_role:    actorRole ?? "admin",
      actor_name:    actorName ?? "Nexum Admin",
      action:        PAYOUT_AUDIT_ACTIONS["Verified"],
      description:   `Payout profile verified for company ${profile.provider_company_id}. Bank: ${profile.bank_name}. Release instructions may now be processed.`,
      created_at:    now,
    });

    // Notify provider
    await svc.from("notifications").insert({
      job_reference:     null,
      recipient_role:    "service_provider",
      notification_type: "Payout Profile Verified",
      priority:          "High",
      title:             "Your payout profile has been verified",
      message:           `Your payout profile (${profile.payout_method} — ${profile.bank_name ?? "—"}) has been verified by Nexum Admin. Release instructions for your jobs can now be processed.`,
      action_url:        `/provider/payout-profile`,
      actor_id: actorId, actor_name: actorName, actor_role: actorRole, created_at: now,
    });

    // Notification uses company-level targeting — also insert for the company's jobs
    const { data: companyJobs } = await svc
      .from("secured_jobs")
      .select("job_reference")
      .eq("service_provider_company_id", profile.provider_company_id)
      .in("job_status", ["Active", "Ready for Execution", "In Progress"])
      .limit(10);

    for (const job of (companyJobs ?? [])) {
      await svc.from("notifications").insert({
        job_reference:     job.job_reference,
        recipient_role:    "service_provider",
        notification_type: "Payout Profile Verified",
        priority:          "Medium",
        title:             `Payout profile verified — Job ${job.job_reference} release can proceed`,
        message:           `Your payout profile has been verified. Release instructions for job ${job.job_reference} can now be instructed.`,
        action_url:        `/provider/jobs/${job.job_reference}`,
        actor_id: actorId, actor_name: actorName, actor_role: actorRole, created_at: now,
      });
    }

    return NextResponse.json({ success: true, newStatus: "Verified" });
  }

  // ── reject (admin) ────────────────────────────────────────────────────────
  if (action === "reject") {
    if (!body.rejectionReason) {
      return NextResponse.json({ error: "rejectionReason is required for rejection." }, { status: 400 });
    }

    const { error } = await svc
      .from("provider_payout_profiles")
      .update({
        verification_status: "Rejected",
        rejection_reason:    body.rejectionReason,
        remarks:             body.remarks ?? profile.remarks,
        verified_by:         null,
        verified_at:         null,
        updated_at:          now,
      })
      .eq("id", id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    await svc.from("audit_logs").insert({
      job_reference: null,
      actor_role:    actorRole ?? "admin",
      actor_name:    actorName ?? "Nexum Admin",
      action:        PAYOUT_AUDIT_ACTIONS["Rejected"],
      description:   `Payout profile rejected for company ${profile.provider_company_id}. Reason: ${body.rejectionReason}.`,
      created_at:    now,
    });

    // Notify provider
    await svc.from("notifications").insert({
      job_reference:     null,
      recipient_role:    "service_provider",
      notification_type: "Payout Profile Rejected",
      priority:          "High",
      title:             "Your payout profile has been rejected",
      message:           `Your payout profile has been reviewed and rejected by Nexum Admin. Reason: ${body.rejectionReason}. Please update your details and re-submit.`,
      action_url:        `/provider/payout-profile`,
      actor_id: actorId, actor_name: actorName, actor_role: actorRole, created_at: now,
    });

    return NextResponse.json({ success: true, newStatus: "Rejected" });
  }

  // ── suspend (admin) ───────────────────────────────────────────────────────
  if (action === "suspend") {
    const { error } = await svc
      .from("provider_payout_profiles")
      .update({
        verification_status: "Suspended",
        remarks:             body.remarks ?? profile.remarks,
        updated_at:          now,
      })
      .eq("id", id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    await svc.from("audit_logs").insert({
      job_reference: null,
      actor_role:    actorRole ?? "admin",
      actor_name:    actorName ?? "Nexum Admin",
      action:        PAYOUT_AUDIT_ACTIONS["Suspended"],
      description:   `Payout profile suspended for company ${profile.provider_company_id}. All release instructions for this provider are blocked.${body.remarks ? ` Remarks: ${body.remarks}` : ""}`,
      created_at:    now,
    });

    // Notify provider
    await svc.from("notifications").insert({
      job_reference:     null,
      recipient_role:    "service_provider",
      notification_type: "Payout Profile Suspended",
      priority:          "Critical",
      title:             "Your payout profile has been suspended",
      message:           `Your payout profile has been suspended by Nexum Admin. All release instructions for your jobs are currently blocked. Please contact Nexum Admin to resolve this.`,
      action_url:        `/provider/payout-profile`,
      actor_id: actorId, actor_name: actorName, actor_role: actorRole, created_at: now,
    });

    return NextResponse.json({ success: true, newStatus: "Suspended" });
  }

  return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });
}
