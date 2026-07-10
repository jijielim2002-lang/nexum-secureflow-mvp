// ─── GET  /api/change-requests/[id] — fetch single change request
// ─── PATCH /api/change-requests/[id] — approve | reject | apply

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { insertAuditLogWithClient } from "@/lib/auditLog";
import {
  isFullyApproved,
  getApprovalParties,
  CHANGE_AUDIT_ACTIONS,
  TERMS_SNAPSHOT_TYPES,
  type ChangeRequestRow,
} from "@/lib/changeRequest";

const svc = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

interface CallerInfo {
  userId:    string;
  role:      string;
  fullName:  string;
  companyId: string | null;
}

async function getCaller(req: NextRequest): Promise<CallerInfo | null> {
  const token = req.headers.get("Authorization")?.replace("Bearer ", "");
  if (!token) return null;
  const { data: { user } } = await svc.auth.getUser(token);
  if (!user) return null;
  const { data: p } = await svc
    .from("profiles")
    .select("role, full_name, company_id")
    .eq("id", user.id)
    .single();
  if (!p) return null;
  return { userId: user.id, role: p.role, fullName: p.full_name, companyId: p.company_id ?? null };
}

// ── GET ───────────────────────────────────────────────────────────────────────

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  const caller = await getCaller(req);
  if (!caller) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data, error } = await svc
    .from("job_change_requests")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data)  return NextResponse.json({ error: "Not found" }, { status: 404 });

  return NextResponse.json({ data });
}

// ── PATCH ─────────────────────────────────────────────────────────────────────

export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  const caller = await getCaller(req);
  if (!caller) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const isAdmin    = caller.role === "admin";
  const isProvider = caller.role === "service_provider";
  const isCustomer = caller.role === "customer";

  if (!isAdmin && !isProvider && !isCustomer) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { data: cr, error: fetchErr } = await svc
    .from("job_change_requests")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (fetchErr) return NextResponse.json({ error: fetchErr.message }, { status: 500 });
  if (!cr)      return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body     = await req.json() as { action: string; rejection_reason?: string };
  const { action } = body;
  const now = new Date().toISOString();

  // ── approve ───────────────────────────────────────────────────────────────
  if (action === "approve") {
    if (!["Pending Approval", "Submitted"].includes(cr.status)) {
      return NextResponse.json({ error: "Change request is not pending approval" }, { status: 400 });
    }

    const parties = getApprovalParties(cr.approval_required_from);

    // Check caller can approve
    const callerParty = isAdmin ? "admin" : isProvider ? "provider" : "customer";
    if (!parties.includes(callerParty)) {
      return NextResponse.json({ error: "Your role is not required to approve this request" }, { status: 403 });
    }

    // Build the update
    const update: Record<string, unknown> = { updated_at: now };
    if (callerParty === "admin"    && !cr.admin_approved_at)    { update.admin_approved_by    = caller.userId; update.admin_approved_at    = now; }
    if (callerParty === "customer" && !cr.customer_approved_at) { update.customer_approved_by = caller.userId; update.customer_approved_at = now; }
    if (callerParty === "provider" && !cr.provider_approved_at) { update.provider_approved_by = caller.userId; update.provider_approved_at = now; }

    // Check if now fully approved
    const updatedRow = { ...cr, ...update } as ChangeRequestRow;
    if (isFullyApproved(updatedRow)) {
      update.status = "Approved";
    } else {
      update.status = "Pending Approval";
    }

    const { data: updated, error: updateErr } = await svc
      .from("job_change_requests")
      .update(update)
      .eq("id", id)
      .select()
      .single();

    if (updateErr) return NextResponse.json({ error: updateErr.message }, { status: 500 });

    await insertAuditLogWithClient(svc, {
      job_reference: cr.job_reference,
      actor_role:    caller.role,
      actor_name:    caller.fullName,
      action:        CHANGE_AUDIT_ACTIONS.approved,
      description:   `${caller.fullName} (${caller.role}) approved change request: ${cr.change_type}${update.status === "Approved" ? " — all approvals complete" : " — waiting for other parties"}.`,
    }).catch(() => { /* silent */ });

    // Notify admin when a non-admin approves
    if (!isAdmin) {
      try {
        await svc.from("notifications").insert({
          job_reference:     cr.job_reference,
          recipient_role:    "admin",
          notification_type: update.status === "Approved" ? "Action Required" : "Other",
          title:             update.status === "Approved"
            ? `Change Request Fully Approved — ${cr.job_reference}`
            : `Partial Approval — ${cr.change_type} (${cr.job_reference})`,
          message:           update.status === "Approved"
            ? `All parties have approved the ${cr.change_type} change request for job ${cr.job_reference}. You can now apply the change.`
            : `${caller.fullName} (${caller.role}) approved the ${cr.change_type} request for job ${cr.job_reference}. Awaiting remaining approvals.`,
          priority:          update.status === "Approved" ? "High" : "Low",
          delivery_channel:  "In-App",
          status:            "Unread",
          action_url:        `/admin/jobs/${cr.job_reference}`,
          created_at:        now,
        });
      } catch { /* silent */ }
    }

    return NextResponse.json({ success: true, data: updated });
  }

  // ── reject ────────────────────────────────────────────────────────────────
  if (action === "reject") {
    if (!["Pending Approval", "Submitted", "Approved"].includes(cr.status)) {
      return NextResponse.json({ error: "Cannot reject a request with status: " + cr.status }, { status: 400 });
    }

    const rejectionReason = body.rejection_reason ?? "No reason provided";

    const { data: updated, error: updateErr } = await svc
      .from("job_change_requests")
      .update({ status: "Rejected", rejection_reason: rejectionReason, updated_at: now })
      .eq("id", id)
      .select()
      .single();

    if (updateErr) return NextResponse.json({ error: updateErr.message }, { status: 500 });

    await insertAuditLogWithClient(svc, {
      job_reference: cr.job_reference,
      actor_role:    caller.role,
      actor_name:    caller.fullName,
      action:        CHANGE_AUDIT_ACTIONS.rejected,
      description:   `${caller.fullName} (${caller.role}) rejected change request: ${cr.change_type}. Reason: ${rejectionReason}`,
    }).catch(() => { /* silent */ });

    // Notify requester
    if (cr.requested_by_role) {
      try {
        await svc.from("notifications").insert({
          job_reference:     cr.job_reference,
          recipient_role:    cr.requested_by_role,
          notification_type: "Other",
          title:             `Change Request Rejected — ${cr.change_type} (${cr.job_reference})`,
          message:           `Your change request (${cr.change_type}) for job ${cr.job_reference} was rejected. Reason: ${rejectionReason}`,
          priority:          "Medium",
          delivery_channel:  "In-App",
          status:            "Unread",
          action_url:        `/admin/jobs/${cr.job_reference}`,
          created_at:        now,
        });
      } catch { /* silent */ }
    }

    return NextResponse.json({ success: true, data: updated });
  }

  // ── apply (admin only) ────────────────────────────────────────────────────
  if (action === "apply") {
    if (!isAdmin) {
      return NextResponse.json({ error: "Only admins can apply change requests" }, { status: 403 });
    }
    if (cr.status !== "Approved") {
      return NextResponse.json({ error: "Only Approved change requests can be applied" }, { status: 400 });
    }

    const pv = (cr.proposed_value ?? {}) as Record<string, unknown>;

    // ── Apply changes to relevant tables ──────────────────────────────────

    try {
      switch (cr.change_type) {

        // Route: update secured_jobs.route
        case "Route Change": {
          const route = pv.route as string | undefined;
          if (route) {
            await svc.from("secured_jobs").update({ route }).eq("job_reference", cr.job_reference);
          }
          break;
        }

        // ETA: update shipment_trackings.eta for this job
        case "ETA Change": {
          const eta = pv.eta as string | undefined;
          if (eta) {
            await svc
              .from("shipment_trackings")
              .update({ eta })
              .eq("job_reference", cr.job_reference);
          }
          break;
        }

        // Delivery Address: no dedicated field — recorded via audit log only
        case "Delivery Address Change": {
          break;
        }

        // Incoterm: update secured_jobs.incoterm + new terms snapshot
        case "Incoterm Change": {
          const incoterm = pv.incoterm as string | undefined;
          if (incoterm) {
            await svc.from("secured_jobs").update({ incoterm }).eq("job_reference", cr.job_reference);
          }
          await createAmendedSnapshot(cr, caller.userId, caller.fullName, now, pv);
          break;
        }

        // Payment Terms: update secured_jobs.payment_terms + new terms snapshot
        case "Payment Terms Change": {
          const paymentTerms = pv.payment_terms as string | undefined;
          if (paymentTerms) {
            await svc.from("secured_jobs").update({ payment_terms: paymentTerms }).eq("job_reference", cr.job_reference);
          }
          await createAmendedSnapshot(cr, caller.userId, caller.fullName, now, pv);
          break;
        }

        // Release Condition / Doc Requirement: new terms snapshot only
        case "Release Condition Change":
        case "Document Requirement Change": {
          await createAmendedSnapshot(cr, caller.userId, caller.fullName, now, pv);
          break;
        }

        // Financial charges: create payment_obligation
        case "Additional Charge":
        case "Storage / Demurrage":
        case "Customs / Permit Cost": {
          if (cr.financial_impact_amount) {
            const { error: obErr } = await svc.from("payment_obligations").insert({
              job_reference:   cr.job_reference,
              obligation_type: cr.change_type,
              amount:          cr.financial_impact_amount,
              currency:        cr.currency,
              status:          "Pending",
              remarks:         `Approved change request — ${cr.change_reason ?? cr.change_type}`,
              created_at:      now,
            });

            if (!obErr) {
              await insertAuditLogWithClient(svc, {
                job_reference: cr.job_reference,
                actor_role:    "admin",
                actor_name:    caller.fullName,
                action:        CHANGE_AUDIT_ACTIONS.charge_created,
                description:   `Additional charge of ${cr.currency} ${cr.financial_impact_amount} created from approved change request: ${cr.change_type}.`,
              }).catch(() => { /* silent */ });

              // Notify customer of new charge
              try {
                await svc.from("notifications").insert({
                  job_reference:     cr.job_reference,
                  recipient_role:    "customer",
                  notification_type: "Action Required",
                  title:             `New Charge — ${cr.change_type} (${cr.job_reference})`,
                  message:           `An additional charge of ${cr.currency} ${cr.financial_impact_amount} has been created for job ${cr.job_reference}: ${cr.change_reason ?? cr.change_type}. Please review.`,
                  priority:          "High",
                  delivery_channel:  "In-App",
                  status:            "Unread",
                  action_url:        `/customer/jobs/${cr.job_reference}`,
                  created_at:        now,
                });
              } catch { /* silent */ }
            }
          }
          break;
        }

        // Partial Delivery / Other: log only
        case "Partial Delivery":
        case "Other":
        default:
          break;
      }
    } catch (applyErr) {
      console.error("Apply change error:", applyErr);
      // Still mark as applied with a note — don't block the workflow
    }

    // Mark applied
    const { data: updated, error: updateErr } = await svc
      .from("job_change_requests")
      .update({ status: "Applied", applied_at: now, updated_at: now })
      .eq("id", id)
      .select()
      .single();

    if (updateErr) return NextResponse.json({ error: updateErr.message }, { status: 500 });

    await insertAuditLogWithClient(svc, {
      job_reference: cr.job_reference,
      actor_role:    "admin",
      actor_name:    caller.fullName,
      action:        CHANGE_AUDIT_ACTIONS.applied,
      description:   `${caller.fullName} applied change request: ${cr.change_type} for job ${cr.job_reference}.`,
    }).catch(() => { /* silent */ });

    // Notify all parties
    const allNotifs = [
      { role: "customer",         url: `/customer/jobs/${cr.job_reference}` },
      { role: "service_provider", url: `/provider/jobs/${cr.job_reference}` },
    ].map(({ role, url }) => ({
      job_reference:     cr.job_reference,
      recipient_role:    role,
      notification_type: "Other",
      title:             `Change Applied — ${cr.change_type} (${cr.job_reference})`,
      message:           `The approved change (${cr.change_type}) has been applied to job ${cr.job_reference}.`,
      priority:          "Low",
      delivery_channel:  "In-App",
      status:            "Unread",
      action_url:        url,
      created_at:        now,
    }));
    try { await svc.from("notifications").insert(allNotifs); } catch { /* silent */ }

    return NextResponse.json({ success: true, data: updated });
  }

  return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });
}

// ── Helper: create amended terms snapshot ─────────────────────────────────────

async function createAmendedSnapshot(
  cr: ChangeRequestRow,
  adminUserId: string,
  adminName:   string,
  now:         string,
  pv:          Record<string, unknown>,
) {
  // Fetch current snapshot
  const { data: current } = await svc
    .from("job_terms_snapshots")
    .select("*")
    .eq("job_reference", cr.job_reference)
    .eq("is_current", true)
    .maybeSingle();

  const nextVersion = current ? ((current.version_number as number) + 1) : 1;

  // Build the new snapshot fields
  const newFields: Record<string, unknown> = {
    job_reference:    cr.job_reference,
    version_number:   nextVersion,
    is_current:       true,
    accepted_at:      current?.accepted_at ?? now,
    terms_version:    current?.terms_version ?? "v1.0",
    service_type:     current?.service_type ?? null,
    route:            current?.route ?? null,
    job_value:        current?.job_value ?? null,
    currency:         current?.currency ?? null,
    payment_terms:    current?.payment_terms ?? null,
    required_deposit: current?.required_deposit ?? null,
    balance_terms:    current?.balance_terms ?? null,
    delivery_confirmation_window_hours: current?.delivery_confirmation_window_hours ?? 48,
    release_condition: current?.release_condition ?? null,
    dispute_condition: current?.dispute_condition ?? null,
    required_documents: current?.required_documents ?? null,
    pilot_disclaimer:   current?.pilot_disclaimer ?? null,
    liability_note:     current?.liability_note ?? null,
    amendment_reason:   cr.change_reason ?? cr.change_type,
    amended_by:         adminUserId,
    amended_at:         now,
    customer_company_id: current?.customer_company_id ?? null,
    provider_company_id: current?.provider_company_id ?? null,
    accepted_by:         current?.accepted_by ?? null,
    created_at:          now,
  };

  // Apply the specific proposed change
  if (cr.change_type === "Payment Terms Change" && pv.payment_terms) {
    newFields.payment_terms = pv.payment_terms;
  }
  if (cr.change_type === "Incoterm Change" && pv.incoterm) {
    // Store incoterm in snapshot_data (not a dedicated column)
    newFields.snapshot_data = { ...(current?.snapshot_data ?? {}), incoterm: pv.incoterm };
  }
  if (cr.change_type === "Release Condition Change" && pv.release_condition) {
    newFields.release_condition = pv.release_condition;
  }
  if (cr.change_type === "Document Requirement Change" && Array.isArray(pv.required_documents)) {
    newFields.required_documents = pv.required_documents;
  }

  await svc.from("job_terms_snapshots").insert(newFields);
  // Trigger: trg_jts_mark_old_not_current will mark previous version as not current

  await insertAuditLogWithClient(svc, {
    job_reference: cr.job_reference,
    actor_role:    "admin",
    actor_name:    adminName,
    action:        CHANGE_AUDIT_ACTIONS.terms_amended,
    description:   `Amended terms snapshot v${nextVersion} created for job ${cr.job_reference}. Change: ${cr.change_type}. Reason: ${cr.change_reason ?? "N/A"}.`,
  }).catch(() => { /* silent */ });
}
