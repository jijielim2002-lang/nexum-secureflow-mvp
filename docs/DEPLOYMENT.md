# Nexum SecureFlow — Deployment Guide

## Pre-flight checklist

### Repository
- [ ] Push all changes to GitHub
- [ ] Confirm `.env.local` is in `.gitignore` and NOT committed (`git ls-files .env.local` returns nothing)
- [ ] `.env.example` is committed (safe — contains no secrets)
- [ ] `npm run build` passes locally with zero errors

### Security
- [ ] `SUPABASE_SERVICE_ROLE_KEY` is NOT prefixed with `NEXT_PUBLIC_`
- [ ] `SUPABASE_SERVICE_ROLE_KEY` only appears in `app/api/**` files — run: `grep -r "SUPABASE_SERVICE_ROLE_KEY" components/ app/` (must return nothing in components)
- [ ] No secrets in `next.config.ts` env block

### Supabase
- [ ] Production project created at supabase.com
- [ ] All SQL migrations run (001 → 013) in order
- [ ] RLS policies active (`nexum_is_admin`, `nexum_my_role`, `nexum_my_company_id` helpers exist)
- [ ] `documents` storage bucket created, public access configured
- [ ] Production admin account created via Supabase Auth dashboard
- [ ] Admin profile row in `profiles` table with `role = 'admin'`

---

## Environment Variables

### Staging `.env.local`
```
NEXT_PUBLIC_SUPABASE_URL=https://staging-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...
NEXT_PUBLIC_APP_ENV=staging
NEXT_PUBLIC_APP_URL=https://nexum-staging.vercel.app
NEXT_PUBLIC_INVITE_BASE_URL=https://nexum-staging.vercel.app
NEXT_PUBLIC_STORAGE_BUCKET=documents
NEXT_PUBLIC_DISABLE_OPTIONAL_MODULES=true
NODE_ENV=production
```

### Production `.env.local`
```
NEXT_PUBLIC_SUPABASE_URL=https://prod-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...
NEXT_PUBLIC_APP_ENV=production
NEXT_PUBLIC_APP_URL=https://app.nexum.com.my
NEXT_PUBLIC_INVITE_BASE_URL=https://app.nexum.com.my
NEXT_PUBLIC_STORAGE_BUCKET=documents
NEXT_PUBLIC_DISABLE_OPTIONAL_MODULES=false
NODE_ENV=production
```

---

## Option 1: Vercel (Recommended — Easiest)

**Why**: Zero-ops, auto HTTPS, preview deployments, Next.js native.

### Steps
1. Go to vercel.com → Import Git Repository → select `Nexum-SecureFlow-MVP`
2. Framework: **Next.js** (auto-detected)
3. Build command: `npm run build`
4. Output directory: `.next`
5. Install command: `npm install`
6. Add ALL environment variables under **Settings → Environment Variables**
   - Set `SUPABASE_SERVICE_ROLE_KEY` to **Production** and **Preview** environments only
   - Set `NEXT_PUBLIC_APP_ENV=staging` for Preview, `=production` for Production
7. Click **Deploy**
8. Custom domain: Settings → Domains → add `app.nexum.com.my`

### Staging on Vercel
- Every PR gets an auto-preview URL — treat these as staging
- Or create a separate Vercel project pointing to the same repo, `main` branch, with staging env vars

---

## Option 2: Render

**Why**: Simple PaaS, good for teams that want more control than Vercel.

### Steps
1. render.com → New → **Web Service**
2. Connect GitHub repo
3. Runtime: **Node**
4. Build command: `npm install && npm run build`
5. Start command: `npm start`
6. Environment: Add all env vars in the Render dashboard
7. Set `NEXT_PUBLIC_APP_ENV=staging` for the staging service
8. Auto-deploy: on every push to `main`

---

## Option 3: VPS / Docker

**Why**: Maximum control, needed if you want to self-host in Malaysia.

### Prerequisites
- Ubuntu 22.04 VPS (DigitalOcean, AWS EC2, Vultr)
- Docker + Docker Compose installed
- Domain + SSL (Caddy or Nginx reverse proxy)

### Enable standalone mode first
In `next.config.ts`, add:
```ts
const nextConfig: NextConfig = {
  output: "standalone",
  // ... existing config
};
```
Then rebuild.

### Deployment steps
```bash
# 1. Clone on server
git clone https://github.com/yourorg/nexum-secureflow.git
cd nexum-secureflow

# 2. Create .env.production
cp .env.example .env.production
nano .env.production  # fill in all values

# 3. Build Docker image
docker build \
  --build-arg NEXT_PUBLIC_SUPABASE_URL=https://prod.supabase.co \
  --build-arg NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ... \
  --build-arg NEXT_PUBLIC_APP_ENV=production \
  --build-arg NEXT_PUBLIC_APP_URL=https://app.nexum.com.my \
  --build-arg NEXT_PUBLIC_DISABLE_OPTIONAL_MODULES=false \
  -t nexum-secureflow:latest .

# 4. Run container (SUPABASE_SERVICE_ROLE_KEY injected at runtime — never in build args)
docker run -d \
  --name nexum-app \
  -p 3000:3000 \
  -e SUPABASE_SERVICE_ROLE_KEY=eyJ... \
  -e NODE_ENV=production \
  nexum-secureflow:latest

# 5. Reverse proxy with Caddy (create /etc/caddy/Caddyfile)
# app.nexum.com.my {
#   reverse_proxy localhost:3000
# }
# systemctl reload caddy
```

### Updates
```bash
git pull
docker build ... -t nexum-secureflow:latest .
docker stop nexum-app && docker rm nexum-app
docker run -d ... nexum-secureflow:latest
```

---

## Supabase Production Setup

1. Create new project at supabase.com (choose Singapore region for Malaysia latency)
2. Settings → API → copy `URL`, `anon key`, `service_role key`
3. SQL Editor → run migrations in order:
   - `001_initial_schema.sql`
   - `002_*.sql` … through `013_secured_jobs_confirm_columns.sql`
4. Storage → New bucket → name: `documents`, Public: yes
5. Authentication → Email templates → customise invite email
6. Authentication → Settings → disable email confirmations for pilot (optional)
7. Create admin user: Auth → Users → Invite user (your email)
8. SQL Editor: `UPDATE profiles SET role='admin' WHERE email='your@email.com';`

---

## What NOT to commit

| File | Reason |
|---|---|
| `.env.local` | Contains live Supabase keys |
| `.env.production` | Contains live keys |
| `.env.staging` | Contains staging keys |
| `node_modules/` | Dependencies (in .gitignore) |
| `.next/` | Build output (in .gitignore) |

**Safe to commit**: `.env.example` — contains no real values.
