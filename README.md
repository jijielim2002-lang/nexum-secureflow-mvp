# Nexum SecureFlow

> AI-augmented trade finance and secured-job workflow platform for freight, logistics, and cross-border trade — MVP edition.

---

## Current MVP Scope

Nexum SecureFlow MVP is a controlled-pilot web application that:

- Orchestrates secured B2B jobs between **Customers**, **Service Providers**, and **Admins**
- Manages **payment obligation ledgers**, deposit/balance confirmation, and payment proof uploads
- Extracts structured data from trade documents using **AI document intelligence** (OpenAI or simulated fallback)
- Tracks shipments via manual updates or connected tracking APIs
- Generates **capital readiness assessments** and **financing simulation offers** for businesses
- Produces **credit packs** (decision-support documents) for capital partner review
- Provides an admin **Command Center** with live metrics across all 18+ data domains
- Includes a full **pilot/staging/developer handover** toolset for controlled deployment

> **Pilot Disclaimer:** This MVP is not a regulated financial product. Credit packs and financing offers are for decision-support and simulation purposes only. No real funds are held, transferred, or committed through this system.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 16 (App Router) |
| Language | TypeScript 5 |
| Styling | Tailwind CSS v4 |
| Database | Supabase (PostgreSQL) |
| Auth | Supabase Auth |
| Storage | Supabase Storage |
| AI | OpenAI GPT-4o (with simulated fallback) |
| Email | Resend (optional) |
| Tracking | Mock adapter + manual override |
| Deployment | Vercel / self-hosted Node.js |

---

## User Roles

| Role | Description |
|---|---|
| `admin` | Full system access — job management, user management, capital tools, command center |
| `provider` | Service provider — manages their jobs, uploads documents, updates shipment status |
| `customer` | Job requester — views jobs, uploads payment proofs, tracks shipments |
| `capital_partner` | Read-only access to credit packs and capital readiness data |

---

## Main Modules

| Module | Path |
|---|---|
| Secured Jobs | `/admin/jobs`, `/provider/jobs`, `/customer/jobs` |
| Companies & Profiles | `/admin/companies` |
| Payment Ledger | embedded in job pages |
| Document Intelligence | `DocumentIntelligencePanel` component |
| Shipment Tracking | `ShipmentTrackingPanel` component |
| Tracking Connectors | `/admin/tracking-connectors` |
| Business Context | `BusinessContextPanel` component |
| Trade Ontology | `TradeOntologyGraph` component |
| Nexum Brain | `NexumBrainPanel` component |
| Exceptions & Rescue | `/admin/exceptions` |
| Notifications | `/admin/notifications` |
| Workflow Tasks | `WorkflowTaskPanel` component |
| Communications | `/admin/communications` |
| Membership | `/admin/memberships` |
| Company Intelligence | `CompanyIntelligenceCard` component |
| Command Center | `/admin/command-center` |
| Capital Readiness | `/admin/capital-readiness` |
| Financing Offers | `/admin/financing-offers` |
| Capital Partner Portal | `/capital` |
| Credit Packs | `/admin/credit-packs` |
| QA / System Tests | `/admin/system-tests` |
| Pilot Readiness | `/admin/pilot-readiness` |
| Staging Readiness | `/admin/staging-readiness` |
| Developer Handover | `/admin/developer-handover` |

---

## Local Setup

See **[docs/SETUP.md](docs/SETUP.md)** for full step-by-step instructions.

**Quick start:**

```bash
# 1. Clone
git clone <repo-url>
cd nexum-secureflow-mvp

# 2. Install
npm install

# 3. Configure environment
cp .env.example .env.local
# Fill in your Supabase URL, anon key, and service role key

# 4. Run
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

---

## Supabase Setup Overview

1. Create a project at [supabase.com](https://supabase.com)
2. Run all SQL migrations from `docs/SUPABASE_SCHEMA.md` in the Supabase SQL editor
3. Create a storage bucket named `documents` (public or private with signed URLs)
4. Enable Row Level Security — see RLS notes in `docs/SUPABASE_SCHEMA.md`
5. Create demo users via the Supabase Auth dashboard or `docs/SETUP.md` instructions

---

## Environment Variables

Copy `.env.example` to `.env.local` and fill in values:

```env
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
RESEND_API_KEY=re_...              # optional — email invites
OPENAI_API_KEY=sk-...             # optional — AI document extraction
NEXT_PUBLIC_APP_URL=http://localhost:3000
NODE_ENV=development
```

> Never commit `.env.local`. It is listed in `.gitignore`.

Full variable reference: **[docs/SETUP.md — Environment Variables](docs/SETUP.md#environment-variables)**

---

## How to Run Dev Server

```bash
npm run dev        # start on http://localhost:3000
npm run build      # production build
npm run start      # serve production build
npm run lint       # ESLint check
npx tsc --noEmit   # TypeScript check
```

---

## Demo Accounts

Create the following users in Supabase Auth, then insert matching rows in the `profiles` table:

| Email | Role | Display Name |
|---|---|---|
| `admin@nexum.test` | `admin` | Nexum Admin |
| `provider@nexum.test` | `provider` | Demo Provider |
| `customer@nexum.test` | `customer` | Demo Customer |
| `partner@nexum.test` | `capital_partner` | Capital Partner |

See **[docs/SETUP.md — Create Demo Users](docs/SETUP.md#create-demo-users)** for exact SQL.

---

## Known Limitations

See **[docs/KNOWN_LIMITATIONS.md](docs/KNOWN_LIMITATIONS.md)** for the full list.

Summary:
- AI extraction falls back to simulated output if `OPENAI_API_KEY` is not set
- Tracking is mock/manual unless a real provider connector is configured
- No payment gateway — payment proofs are uploaded files only
- Financing offers and credit packs are simulation/decision-support, not financial products
- RLS policies must be audited before any production deployment

---

## Production Roadmap

See **[docs/PRODUCTION_ROADMAP.md](docs/PRODUCTION_ROADMAP.md)** for the 4-phase plan.

---

## Documentation Index

| File | Purpose |
|---|---|
| [docs/SETUP.md](docs/SETUP.md) | Step-by-step local and staging setup |
| [docs/SUPABASE_SCHEMA.md](docs/SUPABASE_SCHEMA.md) | Database tables, relationships, RLS |
| [docs/FEATURE_MAP.md](docs/FEATURE_MAP.md) | All modules with status and file locations |
| [docs/KNOWN_LIMITATIONS.md](docs/KNOWN_LIMITATIONS.md) | Current gaps and workarounds |
| [docs/PRODUCTION_ROADMAP.md](docs/PRODUCTION_ROADMAP.md) | Productionization phases |

---

## Interactive Admin Tools

| URL | Purpose |
|---|---|
| `/admin/pilot-readiness` | Live pilot readiness checklist + health checks |
| `/admin/staging-readiness` | Pre-staging deployment checklist |
| `/admin/developer-handover` | Architecture docs, module map, DB map, export |
| `/admin/system-tests` | QA test runner |

---

*Nexum SecureFlow MVP — controlled pilot build. Not for public distribution.*
