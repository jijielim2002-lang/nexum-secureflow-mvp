# AWS Migration Readiness — Nexum SecureFlow

> **Status: Planning only.** No AWS resources are provisioned.  
> No actual migration has occurred. All infrastructure currently runs on Supabase + Vercel.

---

## Current Architecture

| Layer | Current | Target (AWS) |
|-------|---------|--------------|
| Database | Supabase (PostgreSQL) | Amazon RDS Aurora PostgreSQL (Multi-AZ) |
| Object storage | Supabase Storage | Amazon S3 (private bucket, presigned URLs) |
| Auth | Supabase Auth | Amazon Cognito (or keep Supabase Auth) |
| AI / LLM | OpenAI API + Anthropic API (direct) | Amazon Bedrock (model router) |
| Serverless | Vercel Edge / Node functions | AWS Lambda (Node 20) + API Gateway |
| CDN / Frontend | Vercel | AWS CloudFront + S3 static hosting |

---

## Phase 1 — Foundation (Months 1–2)

**Goal:** Make the codebase AWS-ready without breaking existing Supabase deployment.

### 1.1 Storage abstraction layer

Create `lib/storage.ts` with a unified interface:

```ts
interface StorageAdapter {
  upload(path: string, buffer: Buffer, contentType: string): Promise<{ url: string }>;
  createSignedUrl(path: string, expiresIn: number): Promise<string>;
  delete(path: string): Promise<void>;
}
```

- `SupabaseStorageAdapter` — current implementation (default when `DOCUMENT_STORAGE_PRIMARY=supabase`)
- `S3StorageAdapter` — AWS S3 implementation (activate with `DOCUMENT_STORAGE_PRIMARY=s3`)

All document upload/download code in `app/api/provider/ingestion/**` uses `StorageAdapter` — no direct Supabase storage calls.

**Environment variables added:**
```
DOCUMENT_STORAGE_PRIMARY=supabase      # supabase | s3
AWS_REGION=ap-southeast-1
AWS_S3_BUCKET_DOCUMENTS=
AWS_ACCESS_KEY_ID=                     # server-side only, never NEXT_PUBLIC_
AWS_SECRET_ACCESS_KEY=                 # server-side only, never NEXT_PUBLIC_
USE_AWS_S3_DOCUMENT_BACKUP=false       # if true, mirror uploads to S3 while primary=supabase
```

### 1.2 LLM abstraction layer (already partially done)

The dual-LLM extract API (`app/api/provider/ingestion/extract/route.ts`) uses direct HTTP calls to OpenAI and Anthropic. For AWS Bedrock:

- Add `BedrockLLMAdapter` using `@aws-sdk/client-bedrock-runtime`
- Switch when `USE_AWS_BEDROCK_MODEL_ROUTER=true`

**Environment variables added:**
```
USE_AWS_BEDROCK_MODEL_ROUTER=false
AWS_BEDROCK_PRIMARY_MODEL=anthropic.claude-3-5-haiku-20241022-v1:0
AWS_BEDROCK_SECONDARY_MODEL=anthropic.claude-3-5-sonnet-20241022-v2:0
```

### 1.3 Dual-LLM extraction (complete)

Already implemented in `app/api/provider/ingestion/extract/route.ts`:
- Primary: OpenAI gpt-4o
- Secondary: Anthropic claude-haiku-4-5 (cross-check)
- Comparison stored in `document_extraction_comparisons`

Enable via:
```
ENABLE_DUAL_LLM_EXTRACTION=true
ANTHROPIC_API_KEY=sk-ant-...
```

**Wording rules (never deviate):**
- `"AI-extracted draft"` — single LLM, not yet reviewed
- `"Cross-checked"` — both LLMs agreed
- `"Conflict detected — admin review required"` — LLMs disagreed
- `"Admin reviewed"` / `"Verified by admin"` — human confirmed
- **NEVER:** `"AI verified"`, `"guaranteed accurate"`, `"bank verified"`

---

## Phase 2 — Parallel Run (Months 3–4)

**Goal:** Run Supabase and AWS in parallel. Validate parity before cutover.

### 2.1 Database (RDS Aurora)

Schema migration steps:
1. Export full Supabase schema with `pg_dump --schema-only`
2. Provision RDS Aurora PostgreSQL 15 in `ap-southeast-1` (Multi-AZ for HA)
3. Apply schema dump to Aurora
4. Run `sql/platform_architecture_v1.sql` migration on Aurora
5. Set up AWS DMS (Database Migration Service) continuous replication: Supabase → Aurora
6. Validate row counts and checksums on critical tables: `secured_jobs`, `document_ingestion_batches`, `document_ingestion_files`

### 2.2 S3 document backup

With `USE_AWS_S3_DOCUMENT_BACKUP=true`:
- Every file upload to Supabase Storage is mirrored to S3
- Path convention: `s3://{AWS_S3_BUCKET_DOCUMENTS}/documents/{company_id}/{batch_id}/{file_id}/{filename}`
- Object ACL: private
- Bucket policy: restrict to Nexum service account only

### 2.3 Auth decision

Option A (simpler): Keep Supabase Auth, connect to Aurora via Supabase Auth user IDs  
Option B (full AWS): Migrate to Amazon Cognito User Pools

Recommendation: Keep Supabase Auth for Phase 2; migrate to Cognito in Phase 3 only if required by enterprise compliance.

---

## Phase 3 — Cutover (Month 5+)

**Goal:** Supabase is retired. 100% AWS.

### Cutover checklist

- [ ] Aurora read replica verified (< 50ms replication lag)
- [ ] S3 bucket policy locked (block all public access)
- [ ] CloudFront distribution configured for frontend
- [ ] Lambda + API Gateway tested for all `/api/**` routes
- [ ] Zero-downtime cutover plan approved (maintenance window < 15 min)
- [ ] Rollback plan documented: DNS TTL reduced, Supabase kept warm for 48h post-cutover
- [ ] Penetration test completed on AWS infrastructure
- [ ] WAF rules applied (OWASP top 10, SQL injection, rate limiting)
- [ ] CloudTrail enabled for all API calls
- [ ] VPC private subnet — RDS not publicly accessible
- [ ] Secrets in AWS Secrets Manager (not environment variables)

### RLS equivalent on Aurora

Supabase RLS policies translate to:
- Row-level access enforced in API route handlers (`requireProvider`, `requireCompanyAdmin` guards)
- Database user `nexum_app` has no direct internet access
- All queries from Lambda use IAM-authenticated RDS Proxy

---

## Security Notes (apply at all phases)

- `SUPABASE_SERVICE_ROLE_KEY` — server-side only, never `NEXT_PUBLIC_`, never in client code
- `AWS_SECRET_ACCESS_KEY` — server-side only, rotate every 90 days
- `ANTHROPIC_API_KEY`, `OPENAI_API_KEY` — server-side only
- Document storage bucket: always private. Signed URLs with 300s expiry for downloads
- Counterparty masking: `get_masked_company_name` uses `SECURITY DEFINER` — never bypass
- Sensitive data access: always log to `sensitive_data_access_logs` before returning restricted fields

---

## Environment Variables Summary (new in Platform Architecture v1)

```env
# ─── Dual-LLM Document Extraction ────────────────────────────────────────────
ANTHROPIC_API_KEY=                              # server-side only
DOCUMENT_EXTRACTION_PRIMARY_PROVIDER=OpenAI    # OpenAI | Anthropic | Bedrock
DOCUMENT_EXTRACTION_SECONDARY_PROVIDER=Anthropic
ENABLE_DUAL_LLM_EXTRACTION=false               # set true to activate cross-check
ENABLE_LLM_DOCUMENT_EXTRACTION=false           # master switch for all LLM extraction

# ─── AWS (Phase 1+, all off by default) ──────────────────────────────────────
AWS_REGION=ap-southeast-1
AWS_ACCESS_KEY_ID=                             # server-side only
AWS_SECRET_ACCESS_KEY=                         # server-side only
AWS_S3_BUCKET_DOCUMENTS=
DOCUMENT_STORAGE_PRIMARY=supabase              # supabase | s3
USE_AWS_S3_DOCUMENT_BACKUP=false
USE_AWS_BEDROCK_MODEL_ROUTER=false
AWS_BEDROCK_PRIMARY_MODEL=
AWS_BEDROCK_SECONDARY_MODEL=
```

---

*This document is planning-only. Update with actual resource ARNs and timelines when AWS accounts are provisioned.*
