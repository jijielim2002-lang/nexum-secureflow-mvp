// ─── Job Terms Snapshot — types, defaults, helpers, audit actions ─────────────
//
// COMPLIANCE NOTE:
//   This is a commercial terms snapshot for operational reference only.
//   It is NOT a final legal contract. No legal advice is provided.

// ── Types ─────────────────────────────────────────────────────────────────────

export interface JobTermsSnapshotRow {
  id:                               string;
  job_reference:                    string;
  version_number:                   number;
  is_current:                       boolean;

  customer_company_id:              string | null;
  provider_company_id:              string | null;
  accepted_by:                      string | null;
  accepted_at:                      string;

  terms_version:                    string;

  service_type:                     string | null;
  route:                            string | null;
  job_value:                        number | null;
  currency:                         string | null;
  payment_terms:                    string | null;
  required_deposit:                 number | null;
  balance_terms:                    string | null;

  delivery_confirmation_window_hours: number;
  release_condition:                string | null;
  dispute_condition:                string | null;
  liability_note:                   string | null;
  required_documents:               string[] | null;

  pilot_disclaimer:                 string | null;

  amendment_reason:                 string | null;
  amended_by:                       string | null;
  amended_at:                       string | null;

  snapshot_data:                    Record<string, unknown> | null;
  created_at:                       string;
}

// ── Audit actions ─────────────────────────────────────────────────────────────

export const SNAPSHOT_AUDIT_ACTIONS = {
  created:          "job_terms_snapshot_created",
  accepted:         "job_terms_accepted_by_customer",
  amended:          "job_terms_snapshot_amended",
  viewed:           "job_terms_snapshot_viewed",
} as const;

// ── Pilot-safe default term text ──────────────────────────────────────────────

export const DEFAULT_RELEASE_CONDITION =
  "Payment recorded as held under a designated workflow arrangement. Release instruction issued " +
  "upon customer delivery confirmation or auto-confirmation after the agreed window. Subject to " +
  "maker-checker approval. Actual fund transfer through approved bank or licensed payment partner.";

export const DEFAULT_DISPUTE_CONDITION =
  "Disputes must be raised within 48 working hours of the delivery confirmation request. " +
  "Disputed payments remain under the holding workflow pending admin review and resolution. " +
  "No automated disbursement during active dispute.";

export const DEFAULT_LIABILITY_NOTE =
  "Nexum SecureFlow is a workflow coordination platform only. It is not a regulated financial " +
  "service and does not provide legal escrow, guaranteed payments, or licensed financial advice. " +
  "Actual fund holding and disbursement must be conducted through an approved bank, licensed " +
  "payment partner, or designated account arrangement agreed by both parties.";

export const DEFAULT_PILOT_DISCLAIMER =
  "This job operates under Nexum SecureFlow's controlled pilot programme. The platform records " +
  "workflow status and coordinates communication between parties. Terms documented here are for " +
  "operational reference and audit purposes only. They are not final legal documentation and " +
  "do not constitute legal advice. Terms may be updated before production launch. Consult a " +
  "qualified legal professional for formal agreements.";

export const DEFAULT_REQUIRED_DOCUMENTS: string[] = [
  "Payment Proof",
  "Proof of Delivery (POD)",
  "Commercial Invoice",
  "Packing List",
];

export const DEFAULT_DELIVERY_WINDOW_HOURS = 48;

// ── Snapshot builder ──────────────────────────────────────────────────────────

export interface JobDataForSnapshot {
  job_reference:       string;
  service_type:        string;
  route:               string;
  job_value:           number;
  currency:            string;
  payment_terms:       string;
  required_deposit:    number | null;
  balance_terms:       string | null;
  customer_company_id: string | null;
  service_provider_company_id: string | null;
  [key: string]: unknown;
}

export function buildSnapshot(
  job: JobDataForSnapshot,
  acceptedByUserId: string | null,
): Omit<JobTermsSnapshotRow, "id" | "created_at" | "version_number" | "is_current" | "amendment_reason" | "amended_by" | "amended_at"> {
  return {
    job_reference:                    job.job_reference,
    customer_company_id:              job.customer_company_id,
    provider_company_id:              job.service_provider_company_id ?? null,
    accepted_by:                      acceptedByUserId ?? null,
    accepted_at:                      new Date().toISOString(),
    terms_version:                    "v1.0",

    service_type:                     job.service_type,
    route:                            job.route,
    job_value:                        job.job_value,
    currency:                         job.currency,
    payment_terms:                    job.payment_terms,
    required_deposit:                 job.required_deposit,
    balance_terms:                    job.balance_terms,

    delivery_confirmation_window_hours: DEFAULT_DELIVERY_WINDOW_HOURS,
    release_condition:                DEFAULT_RELEASE_CONDITION,
    dispute_condition:                DEFAULT_DISPUTE_CONDITION,
    liability_note:                   DEFAULT_LIABILITY_NOTE,
    required_documents:               DEFAULT_REQUIRED_DOCUMENTS,
    pilot_disclaimer:                 DEFAULT_PILOT_DISCLAIMER,

    snapshot_data:                    job as unknown as Record<string, unknown>,
  };
}

// ── Formatters ────────────────────────────────────────────────────────────────

export function fmtSnapshotDate(iso: string | null): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("en-GB", {
      day: "2-digit", month: "short", year: "numeric",
      hour: "2-digit", minute: "2-digit",
    }) + " UTC";
  } catch { return iso; }
}

export function fmtSnapshotAmount(amount: number | null, currency: string | null): string {
  if (amount == null || !currency) return "—";
  return `${currency} ${new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 2, maximumFractionDigits: 2,
  }).format(amount)}`;
}

// ── Brain context builder ─────────────────────────────────────────────────────

export function buildSnapshotBrainContext(snapshot: JobTermsSnapshotRow | null): string {
  if (!snapshot) {
    return `
## Agreed Job Terms
No commercial terms snapshot recorded for this job yet.
The snapshot is created when the customer accepts the job.
`.trim();
  }

  const lines: (string | null)[] = [
    `## Agreed Commercial Terms (Snapshot v${snapshot.version_number})`,
    `Terms Version: ${snapshot.terms_version}`,
    `Accepted At: ${fmtSnapshotDate(snapshot.accepted_at)}`,
    ``,
    `### Job Details (Frozen at Acceptance)`,
    `- Service: ${snapshot.service_type ?? "—"}`,
    `- Route: ${snapshot.route ?? "—"}`,
    `- Job Value: ${fmtSnapshotAmount(snapshot.job_value, snapshot.currency)}`,
    `- Payment Terms: ${snapshot.payment_terms ?? "—"}`,
    snapshot.required_deposit != null
      ? `- Required Deposit: ${fmtSnapshotAmount(snapshot.required_deposit, snapshot.currency)}`
      : null,
    snapshot.balance_terms
      ? `- Balance Terms: ${snapshot.balance_terms}`
      : null,
    ``,
    `### Delivery Confirmation Rule`,
    `- Confirmation Window: ${snapshot.delivery_confirmation_window_hours} working hours after provider marks delivered`,
    `- If customer does not respond within this window, delivery is auto-confirmed`,
    ``,
    `### Release Condition`,
    snapshot.release_condition ?? DEFAULT_RELEASE_CONDITION,
    ``,
    `### Dispute Condition`,
    snapshot.dispute_condition ?? DEFAULT_DISPUTE_CONDITION,
    ``,
    `### Required Documents`,
    (snapshot.required_documents ?? DEFAULT_REQUIRED_DOCUMENTS).map((d) => `- ${d}`).join("\n"),
    ``,
    `### Liability Note`,
    snapshot.liability_note ?? DEFAULT_LIABILITY_NOTE,
    ``,
    `### Pilot Disclaimer`,
    snapshot.pilot_disclaimer ?? DEFAULT_PILOT_DISCLAIMER,
  ];

  if (snapshot.amendment_reason) {
    lines.push(``, `### Amendment Note`, snapshot.amendment_reason);
  }

  return lines.filter((l): l is string => l !== null).join("\n");
}
