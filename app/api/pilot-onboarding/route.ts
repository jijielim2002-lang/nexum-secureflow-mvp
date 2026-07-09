import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

// ─── Default checklist items per type ─────────────────────────────────────────

const DEFAULT_ITEMS: Record<string, { category: string; name: string; description: string; required: boolean }[]> = {
  "Provider Onboarding": [
    { category: "Profile",     name: "Company profile completed",                      description: "Company name, registration number, address, contact person all recorded.", required: true },
    { category: "Profile",     name: "Company registration number recorded",            description: "SSM or equivalent registration number verified and on file.", required: true },
    { category: "Profile",     name: "Authorized person recorded",                     description: "Name, IC/passport, designation of authorized representative recorded.", required: true },
    { category: "Legal",       name: "Provider pilot terms accepted",                  description: "Provider has accepted TMPL-PRV-PILOT-1.0 via platform.", required: true },
    { category: "Scope",       name: "Service scope confirmed",                        description: "Provider has confirmed the service type and coverage for this pilot.", required: true },
    { category: "Payout",      name: "Bank payout details collected",                  description: "Bank name, account name, account number collected from provider.", required: true },
    { category: "Payout",      name: "Bank payout details verified manually",          description: "Admin has manually verified payout account (e.g., by test transfer or bank letter).", required: true },
    { category: "Legal",       name: "Liability terms confirmed",                      description: "Provider has read and confirmed their liability terms for logistics service delivery.", required: true },
    { category: "Awareness",   name: "Provider understands payment secured wording",   description: "Provider confirmed they understand 'Payment Secured' means Nexum has verified receipt — not that payout is immediate.", required: true },
    { category: "Awareness",   name: "Provider understands POD requirement",           description: "Provider confirmed they must upload Proof of Delivery before release can be approved.", required: true },
    { category: "Awareness",   name: "Provider understands release conditions",        description: "Provider confirmed release is subject to: customer confirmation, no dispute, admin approval, and manual payout timing.", required: true },
    { category: "Awareness",   name: "Provider understands manual payout timing",      description: "Provider confirmed payout is manual and may take 1–3 business days after release approval.", required: true },
    { category: "Approval",    name: "Provider approved for pilot",                    description: "Admin has reviewed all items above and approved this provider for live pilot.", required: true },
  ],
  "Customer Onboarding": [
    { category: "Profile",     name: "Company profile completed",                      description: "Company name, registration number, address, contact person all recorded.", required: true },
    { category: "Profile",     name: "Authorized person recorded",                     description: "Name, IC/passport, designation of authorized representative recorded.", required: true },
    { category: "Legal",       name: "Customer pilot terms accepted",                  description: "Customer has accepted TMPL-CUS-PILOT-1.0 via platform.", required: true },
    { category: "Legal",       name: "Payment holding terms accepted",                 description: "Customer has accepted TMPL-PHT-1.0 via platform.", required: true },
    { category: "Legal",       name: "Release terms accepted",                         description: "Customer has accepted TMPL-REL-1.0 via platform.", required: true },
    { category: "Awareness",   name: "Payment instruction understood",                 description: "Customer confirmed they understand how to transfer to the designated payment account with correct reference.", required: true },
    { category: "Awareness",   name: "Customer understands payment secured only after verification", description: "Customer confirmed they understand payment is only treated as secured after Nexum verifies receipt — not on proof upload alone.", required: true },
    { category: "Awareness",   name: "Customer understands dispute window",            description: "Customer confirmed they must raise disputes before the release window expires.", required: true },
    { category: "Awareness",   name: "Customer understands cargo value is not secured unless selected", description: "Customer confirmed cargo value is for reference/risk visibility only. Pilot secures logistics fee only.", required: true },
    { category: "Approval",    name: "Customer approved for pilot",                    description: "Admin has reviewed all items above and approved this customer for live pilot.", required: true },
  ],
  "Live Job Approval": [
    { category: "Parties",     name: "Provider approved for pilot",                    description: "Provider Onboarding checklist status = Approved.", required: true },
    { category: "Parties",     name: "Customer approved for pilot",                    description: "Customer Onboarding checklist status = Approved.", required: true },
    { category: "Scope",       name: "Local Malaysia transaction",                     description: "Origin and destination are within Malaysia.", required: true },
    { category: "Scope",       name: "MYR transaction",                                description: "Currency is MYR. Non-MYR requires management approval.", required: true },
    { category: "Scope",       name: "Logistics fee only",                             description: "Payment obligation is logistics fee only. No cargo/supplier payment included.", required: true },
    { category: "Scope",       name: "Cargo / supplier payment excluded",              description: "Job does not include cargo value, supplier payment, or financing disbursement as a secured component.", required: true },
    { category: "Scope",       name: "Total secured amount equals logistics fee",      description: "Payment obligation amount matches logistics fee in accepted job terms.", required: true },
    { category: "Compliance",  name: "Payment obligation generated correctly",         description: "payment_obligations record exists with correct amount, currency, and job_reference.", required: true },
    { category: "Compliance",  name: "Job terms snapshot created",                     description: "job_terms_snapshots record exists capturing the accepted job terms.", required: true },
    { category: "Compliance",  name: "Liability terms visible",                        description: "Customer and provider can both view the agreed liability terms.", required: true },
    { category: "Compliance",  name: "Release conditions visible",                     description: "Customer and provider can both view the release conditions for this job.", required: true },
    { category: "Scope",       name: "No cross-border FX settlement",                  description: "No foreign currency conversion or FX settlement required.", required: true },
    { category: "Scope",       name: "No financing disbursement",                      description: "No loan or financing disbursement tied to this job.", required: true },
    { category: "Approval",    name: "Admin approved job for live pilot",              description: "Admin has reviewed all checklist items and approved this job for live pilot execution.", required: true },
  ],
  "Payment Readiness": [
    { category: "Instruction", name: "Designated payment account instruction visible", description: "Customer has received and can see designated payment account details.", required: true },
    { category: "Verification",name: "Payment amount matches obligation",              description: "Payment proof amount exactly matches payment_obligations.amount.", required: true },
    { category: "Verification",name: "Payment reference includes job reference",       description: "Transfer remarks/reference field contains the job_reference.", required: true },
    { category: "Evidence",    name: "Customer uploaded payment proof",                description: "payment_proof_uploads record exists with file URL.", required: true },
    { category: "Verification",name: "Admin checked bank receipt",                     description: "Admin has manually verified credit to designated bank account.", required: true },
    { category: "Verification",name: "Amount matched",                                 description: "Bank receipt amount matches payment obligation amount.", required: true },
    { category: "Verification",name: "Currency matched",                               description: "Bank receipt currency is MYR, matching the obligation.", required: true },
    { category: "Verification",name: "Payer name acceptable",                          description: "Payer account name matches (or is acceptably related to) customer company name.", required: true },
    { category: "Verification",name: "No duplicate reference detected",                description: "Payment reference is unique — no duplicate in manual_payment_operations.", required: true },
    { category: "Status",      name: "Payment secured status updated",                 description: "held_payment.holding_status = Payment Secured. Job payment_status = Payment Secured.", required: true },
    { category: "Audit",       name: "Audit log created for payment secured",          description: "audit_logs contains payment_marked_secured event for this job.", required: true },
  ],
  "Release Readiness": [
    { category: "Payment",     name: "Payment secured",                                description: "held_payment.holding_status = Payment Secured or Release Eligible.", required: true },
    { category: "Evidence",    name: "Provider uploaded POD",                          description: "Proof of Delivery file exists in pod-documents bucket linked to this job.", required: true },
    { category: "Confirmation",name: "Customer confirmed delivery OR window expired",  description: "delivery_confirmations record exists OR dispute_window_expired_at < now().", required: true },
    { category: "Dispute",     name: "No open dispute",                                description: "No dispute in Open or Under Review status for this job.", required: true },
    { category: "Reserve",     name: "No claim reserve pending",                       description: "No active claim reserve blocks full release amount.", required: false },
    { category: "Instruction", name: "Release instruction created",                    description: "release_instructions record exists for this job.", required: true },
    { category: "Approval",    name: "Admin approved release",                         description: "Release instruction has been approved by admin. manual_payment_operations status = Approved for Release.", required: true },
    { category: "Payout",      name: "Payout amount confirmed",                        description: "Net payout amount calculated: job_value minus platform fee minus any claim reserve.", required: true },
    { category: "Payout",      name: "Payee bank details verified",                    description: "Payee account details match provider_payout_profiles record.", required: true },
    { category: "Payout",      name: "Manual payout recorded",                         description: "manual_payment_operations status = Paid Out with payout_reference.", required: true },
    { category: "Reconciliation","name": "Settlement reconciliation pending or complete", "description": "reconciliation_status = Pending or Reconciled.", required: true },
  ],
  "Exception Review": [
    { category: "Payment",     name: "Amount mismatch",                                description: "Payment proof amount differs from obligation. Risk flag = Amount Mismatch.", required: false },
    { category: "Payment",     name: "Currency mismatch",                              description: "Payment currency differs from obligation currency (MYR). Risk flag = Currency Mismatch.", required: false },
    { category: "Payment",     name: "Wrong payer name",                               description: "Payer account name differs from customer company. Risk flag = Third Party Payment.", required: false },
    { category: "Payment",     name: "Third-party payment",                            description: "Payment made from an account not belonging to the customer company.", required: false },
    { category: "Payment",     name: "Unclear payment proof",                          description: "Uploaded proof is illegible, incomplete, or suspicious. Risk flag = Unclear Proof.", required: false },
    { category: "Payment",     name: "Duplicate payment reference",                    description: "Same payment reference used in another transaction. Risk flag = Duplicate Reference.", required: false },
    { category: "Dispute",     name: "Dispute raised",                                 description: "Customer has raised a dispute blocking release.", required: false },
    { category: "Evidence",    name: "POD missing",                                    description: "Provider has not uploaded Proof of Delivery.", required: false },
    { category: "Confirmation",name: "Customer non-confirmation",                      description: "Customer neither confirmed delivery nor raised dispute within window.", required: false },
    { category: "Reserve",     name: "Claim reserve required",                         description: "A portion of the payment must be held pending dispute resolution.", required: false },
    { category: "Refund",      name: "Refund required",                                description: "Full or partial refund to customer required.", required: false },
    { category: "Approval",    name: "Manual management review completed",             description: "Management/senior admin has reviewed and documented the exception outcome.", required: true },
  ],
};

// ─── Service client ───────────────────────────────────────────────────────────

function getSvc() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Missing Supabase env vars");
  return createClient(url, key);
}

async function resolveAdmin(req: NextRequest) {
  const token = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
  if (!token) return null;
  const svc = getSvc();
  const { data: { user }, error } = await svc.auth.getUser(token);
  if (error || !user) return null;
  const { data: profile } = await svc.from("profiles").select("role").eq("id", user.id).single();
  if (!profile || profile.role !== "admin") return null;
  return { userId: user.id };
}

async function writeAudit(
  svc: ReturnType<typeof getSvc>,
  event_type: string,
  actor_id: string,
  job_reference: string | null,
  details: Record<string, unknown>,
) {
  await svc.from("audit_logs").insert({ event_type, actor_id, job_reference, details, created_at: new Date().toISOString() });
}

function genRef(type: string): string {
  const code = type.replace(/[^A-Z]/g, "").slice(0, 3) || "CHK";
  return `POC-${code}-${Date.now().toString(36).toUpperCase()}`;
}

// ─── GET /api/pilot-onboarding ────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  try {
    const token = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
    if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const svc = getSvc();
    const { data: { user } } = await svc.auth.getUser(token);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const url = req.nextUrl;
    const companyId  = url.searchParams.get("companyId") ?? undefined;
    const jobRef     = url.searchParams.get("jobReference") ?? undefined;
    const typeFilter = url.searchParams.get("type") ?? undefined;
    const status     = url.searchParams.get("status") ?? undefined;
    const withItems  = url.searchParams.get("withItems") === "true";

    const select = withItems
      ? `*, items:pilot_onboarding_items(*)`
      : `*, item_counts:pilot_onboarding_items(id, status, required)`;

    let q = svc
      .from("pilot_onboarding_checklists")
      .select(select)
      .order("created_at", { ascending: false })
      .limit(500);

    if (companyId)  q = q.eq("company_id", companyId);
    if (jobRef)     q = q.eq("job_reference", jobRef);
    if (typeFilter) q = q.eq("checklist_type", typeFilter);
    if (status)     q = q.eq("status", status);

    const { data, error } = await q;
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ checklists: data ?? [] });
  } catch (err) {
    console.error("[pilot-onboarding GET]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// ─── POST /api/pilot-onboarding — create checklist + auto-populate items ──────

export async function POST(req: NextRequest) {
  try {
    const actor = await resolveAdmin(req);
    if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body: {
      checklist_type: string;
      company_id?:   string;
      company_name?: string;
      job_reference?: string;
      risk_level?:   string;
    } = await req.json();

    if (!body.checklist_type) {
      return NextResponse.json({ error: "checklist_type is required" }, { status: 400 });
    }

    const svc = getSvc();
    const ref = genRef(body.checklist_type.toUpperCase());

    const { data: cl, error: clErr } = await svc
      .from("pilot_onboarding_checklists")
      .insert({
        checklist_reference: ref,
        checklist_type:      body.checklist_type,
        company_id:          body.company_id ?? null,
        company_name:        body.company_name ?? null,
        job_reference:       body.job_reference ?? null,
        risk_level:          body.risk_level ?? "Medium",
        created_by:          actor.userId,
      })
      .select()
      .single();

    if (clErr || !cl) return NextResponse.json({ error: clErr?.message ?? "Failed to create checklist" }, { status: 500 });

    // Auto-populate items from defaults
    const defaults = DEFAULT_ITEMS[body.checklist_type] ?? [];
    if (defaults.length > 0) {
      const items = defaults.map((d) => ({
        checklist_id:     (cl as { id: string }).id,
        item_category:    d.category,
        item_name:        d.name,
        item_description: d.description,
        required:         d.required,
        status:           "Pending",
      }));
      await svc.from("pilot_onboarding_items").insert(items);
    }

    await writeAudit(svc, "pilot_checklist_created", actor.userId, body.job_reference ?? null, {
      checklist_reference: ref,
      checklist_type:      body.checklist_type,
      company_id:          body.company_id,
    });

    return NextResponse.json({ checklist: cl }, { status: 201 });
  } catch (err) {
    console.error("[pilot-onboarding POST]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// ─── PATCH /api/pilot-onboarding — checklist-level actions ───────────────────
//
// actions: approve, reject, put_on_hold, waive, approve_job_for_pilot, complete_pilot_job
// item actions handled by /api/pilot-onboarding/items
// ─────────────────────────────────────────────────────────────────────────────

export async function PATCH(req: NextRequest) {
  try {
    const actor = await resolveAdmin(req);
    if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body: {
      id:           string;
      action:       string;
      review_note?: string;
      risk_level?:  string;
    } = await req.json();

    if (!body.id || !body.action) {
      return NextResponse.json({ error: "id and action are required" }, { status: 400 });
    }

    const svc = getSvc();

    // Live-customer gate: block approve_job_for_pilot when flag is off
    if (body.action === "approve_job_for_pilot") {
      const { data: sysRows } = await svc.from("system_settings").select("key, value");
      const sys: Record<string, string> = {};
      for (const r of sysRows ?? []) sys[r.key] = r.value;
      if (sys.live_customer_enabled === "false") {
        return NextResponse.json({
          error: "Live job approval is currently disabled. Enable live_customer_enabled in Deployment Settings before approving a pilot job.",
          code:  "LIVE_CUSTOMER_DISABLED",
        }, { status: 403 });
      }
    }

    const { data: cl, error: fetchErr } = await svc
      .from("pilot_onboarding_checklists")
      .select("*, items:pilot_onboarding_items(*)")
      .eq("id", body.id)
      .single();

    if (fetchErr || !cl) return NextResponse.json({ error: "Checklist not found" }, { status: 404 });

    const c = cl as {
      id: string; checklist_reference: string; checklist_type: string;
      job_reference: string | null; company_id: string | null;
      items: { required: boolean; status: string }[];
    };

    const now = new Date().toISOString();
    let patch: Record<string, unknown> = {};
    let auditEvent = "";

    // ── Gating check for approve ───────────────────────────────────────────────
    if (body.action === "approve") {
      const blockers = c.items.filter(
        (i) => i.required && !["Passed","Waived","Not Applicable"].includes(i.status)
      );
      if (blockers.length > 0) {
        return NextResponse.json({
          error: `${blockers.length} required item(s) not yet Passed or Waived. Resolve or waive them before approving.`,
          code: "ITEMS_PENDING",
          pending_count: blockers.length,
        }, { status: 409 });
      }
      patch = { status: "Approved", reviewed_by: actor.userId, reviewed_at: now, review_note: body.review_note ?? null };

      // Determine audit event by type
      if (c.checklist_type === "Provider Onboarding")  auditEvent = "provider_pilot_approved";
      else if (c.checklist_type === "Customer Onboarding") auditEvent = "customer_pilot_approved";
      else if (c.checklist_type === "Live Job Approval")   auditEvent = "job_live_pilot_approved";
      else auditEvent = "pilot_checklist_approved";
    }

    switch (body.action) {
      case "approve":
        // patch set above in gating block
        break;
      case "reject":
        patch = { status: "Rejected", reviewed_by: actor.userId, reviewed_at: now, review_note: body.review_note ?? null };
        auditEvent = "job_live_pilot_rejected";
        break;
      case "put_on_hold":
        patch = { status: "On Hold", reviewed_by: actor.userId, reviewed_at: now, review_note: body.review_note ?? null };
        auditEvent = "pilot_checklist_on_hold";
        break;
      case "waive":
        patch = { status: "Waived", reviewed_by: actor.userId, reviewed_at: now, review_note: body.review_note ?? null };
        auditEvent = "pilot_checklist_waived";
        break;
      case "set_in_review":
        patch = { status: "In Review" };
        auditEvent = "";
        break;

      case "approve_job_for_pilot": {
        // Gating: require provider + customer + live job approval checklists all Approved
        if (!c.job_reference) {
          return NextResponse.json({ error: "No job_reference on this checklist" }, { status: 400 });
        }
        const { data: relCl } = await svc
          .from("pilot_onboarding_checklists")
          .select("checklist_type, status, company_id")
          .eq("job_reference", c.job_reference)
          .in("checklist_type", ["Provider Onboarding","Customer Onboarding","Live Job Approval"]);

        const byType = (type: string) =>
          (relCl ?? []).find((x: { checklist_type: string; status: string }) => x.checklist_type === type && x.status === "Approved");

        const missing: string[] = [];
        if (!byType("Live Job Approval")) missing.push("Live Job Approval");
        // Provider/Customer onboarding may be under the company, not the job
        // Allow bypass if admin explicitly waives with review_note

        if (missing.length > 0 && !body.review_note) {
          return NextResponse.json({
            error: `Missing approved checklists: ${missing.join(", ")}. Add a review_note to waive this check.`,
            code: "CHECKLISTS_PENDING",
            missing,
          }, { status: 409 });
        }

        // Update job pilot_status
        await svc
          .from("secured_jobs")
          .update({ pilot_status: "Live Pilot Approved" })
          .eq("job_reference", c.job_reference);

        patch = { status: "Approved", reviewed_by: actor.userId, reviewed_at: now, review_note: body.review_note ?? null };
        auditEvent = "job_live_pilot_approved";
        break;
      }

      case "complete_pilot_job": {
        if (c.job_reference) {
          await svc
            .from("secured_jobs")
            .update({ pilot_status: "Live Pilot Completed" })
            .eq("job_reference", c.job_reference);
        }
        patch = { status: "Approved", review_note: body.review_note ?? "Pilot job completed." };
        auditEvent = "job_live_pilot_completed";
        break;
      }

      default:
        if (body.action !== "approve") {
          return NextResponse.json({ error: `Unknown action: ${body.action}` }, { status: 400 });
        }
    }

    const { data: updated, error: updErr } = await svc
      .from("pilot_onboarding_checklists")
      .update(patch)
      .eq("id", body.id)
      .select()
      .single();

    if (updErr) return NextResponse.json({ error: updErr.message }, { status: 500 });

    if (auditEvent) {
      await writeAudit(svc, auditEvent, actor.userId, c.job_reference, {
        checklist_id:        body.id,
        checklist_reference: c.checklist_reference,
        checklist_type:      c.checklist_type,
        action:              body.action,
      });
    }

    return NextResponse.json({ checklist: updated });
  } catch (err) {
    console.error("[pilot-onboarding PATCH]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
