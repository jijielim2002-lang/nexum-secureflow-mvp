# Nexum SecureFlow — Supabase Schema Reference

This document describes the database schema for the Nexum SecureFlow MVP, including table purposes, key columns, relationships, storage setup, RLS notes, and seed data guidance.

---

## Table List

| # | Table | Purpose |
|---|---|---|
| 1 | `profiles` | Extended user profiles with role assignment |
| 2 | `companies` | Business entities (customers and providers) |
| 3 | `jobs` | Secured job records with full lifecycle state |
| 4 | `payment_obligations` | Payment milestones per job (deposit, balance) |
| 5 | `documents` | Uploaded document metadata and storage references |
| 6 | `shipment_tracking` | Shipment events and status updates per job |
| 7 | `tracking_connectors` | External tracking API provider configurations |
| 8 | `tracking_sync_logs` | Log of tracking sync attempts per connector |
| 9 | `business_context` | Structured business context per job |
| 10 | `ontology_nodes` | Trade ontology concept graph — nodes |
| 11 | `ontology_edges` | Trade ontology concept graph — edges |
| 12 | `decision_briefs` | AI-generated decision briefs per job |
| 13 | `exceptions` | Job exceptions (delays, disputes, force majeure) |
| 14 | `notifications` | In-app notifications per user |
| 15 | `workflow_tasks` | Actionable tasks assigned to users per job |
| 16 | `communication_logs` | Email/WhatsApp/in-app message records |
| 17 | `memberships` | Company membership tiers and usage tracking |
| 18 | `company_intelligence` | Structured intelligence snapshots per company |
| 19 | `data_sources` | External data source registry |
| 20 | `audit_logs` | Immutable action audit trail |
| 21 | `capital_readiness_assessments` | Capital readiness analysis per company |
| 22 | `financing_offers` | Simulated financing offers per assessment |
| 23 | `capital_partners` | Approved capital partner records |
| 24 | `credit_packs` | Exportable credit decision support packs |

### View

| View | Purpose |
|---|---|
| `v_credit_packs_summary` | Flattened credit pack data joining companies, offers, and assessments — extracts JSONB scalars for command center and list pages |

---

## Table Details

### `profiles`
Extends Supabase Auth `auth.users`. One row per user.

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid` PK | Matches `auth.users.id` |
| `email` | `text` | Copied from auth |
| `full_name` | `text` | Display name |
| `role` | `text` | `admin`, `provider`, `customer`, `capital_partner` |
| `company_id` | `uuid` FK → `companies` | Nullable — admin has no company |
| `created_at` | `timestamptz` | Auto |

---

### `companies`
Business entities that own jobs or provide services.

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid` PK | |
| `name` | `text` | Company display name |
| `country` | `text` | ISO 2-letter code |
| `industry` | `text` | Free text |
| `registration_number` | `text` | Optional |
| `credit_score` | `numeric` | Optional — used in capital readiness |
| `annual_revenue` | `numeric` | Optional |
| `years_in_operation` | `integer` | Optional |
| `created_at` | `timestamptz` | Auto |

---

### `jobs`
Central entity. Each job represents a secured trade transaction.

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid` PK | |
| `job_reference` | `text` | Human-readable ID (e.g. `NSF-2025-001`) |
| `customer_id` | `uuid` FK → `profiles` | Job requester |
| `provider_id` | `uuid` FK → `profiles` | Service provider |
| `company_id` | `uuid` FK → `companies` | Customer's company |
| `service_type` | `text` | e.g. `Freight`, `Inspection` |
| `currency` | `text` | ISO code |
| `job_value` | `numeric` | Total contract value |
| `deposit_amount` | `numeric` | Required deposit |
| `job_status` | `text` | Lifecycle status enum |
| `payment_status` | `text` | Payment lifecycle status enum |
| `current_milestone` | `text` | Active workflow milestone |
| `origin_country` | `text` | |
| `destination_country` | `text` | |
| `cargo_description` | `text` | |
| `incoterms` | `text` | e.g. `FOB`, `CIF` |
| `metadata` | `jsonb` | Flexible additional data |
| `created_at` | `timestamptz` | Auto |
| `updated_at` | `timestamptz` | Auto |

**Key relationships:** `jobs` → `companies`, `profiles` (customer + provider)

---

### `payment_obligations`
Tracks each payment milestone for a job.

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid` PK | |
| `job_id` | `uuid` FK → `jobs` | |
| `obligation_type` | `text` | `deposit`, `balance`, `other` |
| `amount` | `numeric` | |
| `currency` | `text` | |
| `due_date` | `date` | |
| `status` | `text` | `Pending`, `Proof Uploaded`, `Confirmed`, `Waived` |
| `proof_url` | `text` | Storage URL of proof document |
| `confirmed_by` | `uuid` FK → `profiles` | Admin who confirmed |
| `confirmed_at` | `timestamptz` | |
| `created_at` | `timestamptz` | Auto |

---

### `documents`
Metadata for all uploaded files. Actual files live in Supabase Storage.

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid` PK | |
| `job_id` | `uuid` FK → `jobs` | |
| `uploaded_by` | `uuid` FK → `profiles` | |
| `document_type` | `text` | `invoice`, `bl`, `packing_list`, `coo`, `proof`, `other` |
| `file_name` | `text` | Original filename |
| `storage_path` | `text` | Path within the `documents` bucket |
| `extracted_data` | `jsonb` | AI-extracted fields (nullable if extraction failed) |
| `extraction_status` | `text` | `pending`, `extracted`, `failed`, `simulated` |
| `confidence_score` | `numeric` | 0–1 AI confidence |
| `created_at` | `timestamptz` | Auto |

---

### `shipment_tracking`
One row per tracking event per job.

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid` PK | |
| `job_id` | `uuid` FK → `jobs` | |
| `event_type` | `text` | `departed`, `in_transit`, `arrived`, `customs_hold`, etc. |
| `event_description` | `text` | |
| `location` | `text` | Port/city/country |
| `event_date` | `timestamptz` | When event occurred |
| `source` | `text` | `manual`, `api`, `mock` |
| `connector_id` | `uuid` FK → `tracking_connectors` | Nullable |
| `created_at` | `timestamptz` | Auto |

---

### `tracking_connectors`
Configured external tracking provider integrations.

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid` PK | |
| `name` | `text` | Display name |
| `provider_type` | `text` | `maersk`, `cosco`, `custom`, etc. |
| `api_endpoint` | `text` | Base URL of provider API |
| `api_key_hint` | `text` | Last 4 chars of key — never store full key here |
| `is_active` | `boolean` | Whether sync is enabled |
| `sync_interval_minutes` | `integer` | How often to poll |
| `last_synced_at` | `timestamptz` | |
| `created_at` | `timestamptz` | Auto |

---

### `tracking_sync_logs`
Audit log for each sync attempt.

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid` PK | |
| `connector_id` | `uuid` FK → `tracking_connectors` | |
| `job_id` | `uuid` FK → `jobs` | Nullable |
| `status` | `text` | `success`, `failed`, `partial` |
| `events_fetched` | `integer` | |
| `error_message` | `text` | Nullable |
| `synced_at` | `timestamptz` | Auto |

---

### `business_context`
Structured business context data per job, used by AI modules.

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid` PK | |
| `job_id` | `uuid` FK → `jobs` | Unique per job |
| `trade_relationship` | `text` | |
| `payment_terms` | `text` | |
| `risk_factors` | `jsonb` | Array of identified risk strings |
| `context_summary` | `text` | Plain-language summary |
| `created_at` | `timestamptz` | Auto |

---

### `ontology_nodes` + `ontology_edges`
Trade ontology knowledge graph.

**`ontology_nodes`:**

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid` PK | |
| `job_id` | `uuid` FK → `jobs` | |
| `label` | `text` | Concept label |
| `node_type` | `text` | `entity`, `concept`, `risk`, `regulation` |
| `metadata` | `jsonb` | |

**`ontology_edges`:**

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid` PK | |
| `from_node_id` | `uuid` FK → `ontology_nodes` | |
| `to_node_id` | `uuid` FK → `ontology_nodes` | |
| `relationship` | `text` | e.g. `relates_to`, `depends_on` |

---

### `decision_briefs`
AI-generated decision support per job.

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid` PK | |
| `job_id` | `uuid` FK → `jobs` | |
| `brief_summary` | `text` | |
| `risk_rating` | `text` | `low`, `medium`, `high`, `critical` |
| `recommended_action` | `text` | |
| `generated_by` | `text` | `openai`, `simulated` |
| `generated_at` | `timestamptz` | |

---

### `exceptions`
Job exceptions — delays, disputes, force majeure, compliance.

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid` PK | |
| `job_id` | `uuid` FK → `jobs` | |
| `exception_type` | `text` | `delay`, `dispute`, `force_majeure`, `compliance`, `payment`, `other` |
| `severity` | `text` | `low`, `medium`, `high`, `critical` |
| `title` | `text` | |
| `description` | `text` | |
| `status` | `text` | `Open`, `Under Review`, `Resolved`, `Escalated` |
| `reported_by` | `uuid` FK → `profiles` | |
| `assigned_to` | `uuid` FK → `profiles` | Nullable |
| `resolution_note` | `text` | Nullable |
| `created_at` | `timestamptz` | Auto |
| `updated_at` | `timestamptz` | Auto |

---

### `notifications`
In-app notification inbox per user.

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid` PK | |
| `user_id` | `uuid` FK → `profiles` | Recipient |
| `title` | `text` | |
| `body` | `text` | |
| `type` | `text` | `info`, `warning`, `success`, `error` |
| `is_read` | `boolean` | Default false |
| `job_id` | `uuid` FK → `jobs` | Optional context link |
| `created_at` | `timestamptz` | Auto |

---

### `workflow_tasks`
Actionable tasks assigned to users as part of job workflow.

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid` PK | |
| `job_id` | `uuid` FK → `jobs` | |
| `assigned_to` | `uuid` FK → `profiles` | |
| `title` | `text` | |
| `description` | `text` | |
| `status` | `text` | `pending`, `in_progress`, `completed`, `cancelled` |
| `due_date` | `date` | Nullable |
| `created_at` | `timestamptz` | Auto |

---

### `communication_logs`
Record of all outbound communications.

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid` PK | |
| `job_id` | `uuid` FK → `jobs` | Nullable |
| `from_user_id` | `uuid` FK → `profiles` | |
| `to_user_id` | `uuid` FK → `profiles` | Nullable |
| `channel` | `text` | `email`, `whatsapp`, `in_app` |
| `subject` | `text` | |
| `body` | `text` | |
| `status` | `text` | `sent`, `delivered`, `failed`, `simulated` |
| `sent_at` | `timestamptz` | |

---

### `memberships`
Company membership tier and usage tracking.

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid` PK | |
| `company_id` | `uuid` FK → `companies` | Unique per company |
| `tier` | `text` | `free`, `starter`, `professional`, `enterprise` |
| `status` | `text` | `active`, `suspended`, `cancelled` |
| `annual_fee` | `numeric` | |
| `jobs_limit` | `integer` | |
| `used_jobs` | `integer` | |
| `renewal_date` | `date` | |
| `created_at` | `timestamptz` | Auto |

---

### `company_intelligence`
Structured intelligence snapshot per company.

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid` PK | |
| `company_id` | `uuid` FK → `companies` | |
| `overall_trust_score` | `numeric` | 0–100 |
| `payment_reliability` | `text` | |
| `trade_volume_estimate` | `numeric` | |
| `key_risks` | `jsonb` | Array of risk strings |
| `intel_summary` | `text` | |
| `generated_at` | `timestamptz` | |

---

### `data_sources`
Registry of connected external data providers.

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid` PK | |
| `name` | `text` | |
| `source_type` | `text` | `tracking`, `credit`, `trade`, `regulatory` |
| `status` | `text` | `active`, `inactive`, `error` |
| `last_checked_at` | `timestamptz` | |

---

### `audit_logs`
Immutable action audit trail — never delete from this table.

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid` PK | |
| `job_id` | `uuid` | Nullable (not FK — audit logs are never cascaded) |
| `actor_id` | `uuid` FK → `profiles` | |
| `actor_role` | `text` | Snapshot of role at time of action |
| `actor_name` | `text` | Snapshot of name at time of action |
| `action` | `text` | e.g. `job_created`, `payment_confirmed` |
| `description` | `text` | Human-readable description |
| `metadata` | `jsonb` | Additional context |
| `created_at` | `timestamptz` | Auto |

---

### `capital_readiness_assessments`
Capital readiness analysis per company.

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid` PK | |
| `company_id` | `uuid` FK → `companies` | |
| `assessed_by` | `uuid` FK → `profiles` | Admin who ran the assessment |
| `readiness_score` | `numeric` | 0–100 |
| `risk_level` | `text` | `low`, `medium`, `high`, `critical` |
| `readiness_status` | `text` | `Strong`, `Moderate`, `Weak`, `Not Assessed` |
| `factors` | `jsonb` | JSONB object of scored factors |
| `summary` | `text` | |
| `assessed_at` | `timestamptz` | |
| `created_at` | `timestamptz` | Auto |

---

### `financing_offers`
Simulated financing offers linked to assessments.

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid` PK | |
| `assessment_id` | `uuid` FK → `capital_readiness_assessments` | |
| `company_id` | `uuid` FK → `companies` | |
| `product_type` | `text` | `Invoice Financing`, `Trade Credit`, `Letter of Credit` |
| `offer_amount` | `numeric` | |
| `currency` | `text` | |
| `interest_rate` | `numeric` | Annual % |
| `tenor_days` | `integer` | |
| `offer_status` | `text` | `Draft`, `Sent`, `Accepted`, `Declined`, `Expired` |
| `offer_notes` | `text` | |
| `created_at` | `timestamptz` | Auto |

---

### `capital_partners`
Approved capital partner organizations.

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid` PK | |
| `name` | `text` | Partner display name |
| `partner_type` | `text` | `bank`, `fund`, `fintech`, `government` |
| `country` | `text` | |
| `focus_sectors` | `jsonb` | Array of sector strings |
| `min_deal_size` | `numeric` | |
| `max_deal_size` | `numeric` | |
| `is_active` | `boolean` | |
| `contact_email` | `text` | |
| `created_at` | `timestamptz` | Auto |

---

### `credit_packs`
Decision-support credit packs shared with capital partners.

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid` PK | |
| `job_reference` | `text` | Linked job reference (denormalized for export) |
| `company_id` | `uuid` FK → `companies` | |
| `assessment_id` | `uuid` FK → `capital_readiness_assessments` | Nullable |
| `offer_id` | `uuid` FK → `financing_offers` | Nullable |
| `pack_title` | `text` | |
| `pack_status` | `text` | `Draft`, `Generated`, `Shared`, `Expired` |
| `generated_by` | `uuid` FK → `profiles` | |
| `generated_at` | `timestamptz` | |
| `pack_data` | `jsonb` | Full pack content snapshot |
| `created_at` | `timestamptz` | Auto |

---

## View: `v_credit_packs_summary`

Flattened view that joins `credit_packs` with `companies`, `financing_offers`, and `capital_readiness_assessments`. Extracts JSONB scalars so application code does not need JSON parsing.

Used by:
- `/admin/credit-packs` list page
- `/admin/command-center` Section 18

---

## Key Relationships Diagram

```
auth.users
    └── profiles (1:1)
            ├── jobs (customer_id, provider_id)
            ├── workflow_tasks (assigned_to)
            ├── notifications (user_id)
            └── audit_logs (actor_id)

companies
    ├── jobs (company_id)
    ├── memberships (company_id)
    ├── company_intelligence (company_id)
    ├── capital_readiness_assessments (company_id)
    └── credit_packs (company_id)

jobs
    ├── payment_obligations (job_id)
    ├── documents (job_id)
    ├── shipment_tracking (job_id)
    ├── business_context (job_id)
    ├── ontology_nodes (job_id)
    ├── decision_briefs (job_id)
    ├── exceptions (job_id)
    ├── workflow_tasks (job_id)
    └── communication_logs (job_id)

capital_readiness_assessments
    └── financing_offers (assessment_id)
            └── credit_packs (offer_id)
```

---

## Storage Bucket

| Bucket | Purpose | Access |
|---|---|---|
| `documents` | All uploaded files (invoices, BLs, payment proofs) | Private (signed URLs) or Public for MVP |

File path convention: `{job_id}/{document_type}/{filename}`

Configure `NEXT_PUBLIC_STORAGE_BUCKET=documents` in `.env.local`.

---

## RLS Notes

> **MVP Pilot Warning:** Row Level Security policies on this MVP may be permissive to speed up pilot testing. Before any production or public staging deployment, each table's RLS policies must be individually reviewed and tightened.

Recommended production RLS pattern:
- `admin` role → full SELECT, INSERT, UPDATE, DELETE
- `provider` role → SELECT/UPDATE own jobs only
- `customer` role → SELECT own jobs, INSERT payment proofs only
- `capital_partner` role → SELECT credit_packs and assessments only (no PII)
- `audit_logs` → INSERT only via service role; no DELETE policy

---

## Seed Data Notes

The `pilot-demo/clear` API route can reset the following tables back to a clean state for pilot demos:
- `notifications`
- `workflow_tasks`
- `communication_logs`
- `tracking_sync_logs`
- `audit_logs`

Other tables (jobs, companies, profiles, credit_packs) must be reset manually or via the Supabase dashboard.

Use the `/admin/demo-reset` page for guided pilot data management.
