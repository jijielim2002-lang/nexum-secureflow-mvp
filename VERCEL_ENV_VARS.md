# Vercel Environment Variables

Add all of these in Vercel → Project → Settings → Environment Variables.
Set each one for **Production** (and optionally Preview).

| Variable | Value |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | `https://fhzmhsecrdnztpodfpjs.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | *(copy from .env.local)* |
| `SUPABASE_SERVICE_ROLE_KEY` | *(get the real service_role key from Supabase → Project Settings → API → service_role)* |
| `NEXT_PUBLIC_APP_URL` | `https://YOUR-APP.vercel.app` *(fill in after first deploy)* |
| `NEXT_PUBLIC_INVITE_BASE_URL` | `https://YOUR-APP.vercel.app` |
| `NEXT_PUBLIC_APP_ENV` | `production` |
| `OPENAI_API_KEY` | `sk-...` *(your key)* |
| `OPENAI_EXTRACTION_MODEL` | `gpt-4o` |
| `ENABLE_LLM_DOCUMENT_EXTRACTION` | `true` |
| `DOCUMENT_EXTRACTION_PROVIDER` | `OpenAI` |
| `NEXT_PUBLIC_DISABLE_OPTIONAL_MODULES` | `false` |
| `NODE_ENV` | `production` |

## Important: Supabase Service Role Key

Your current `.env.local` has the **anon key** in the service role slot — this means
server-side operations (AI extraction, admin writes) won't bypass RLS properly.

1. Go to [supabase.com](https://supabase.com) → your project → **Project Settings → API**
2. Copy the **service_role** secret (starts with `eyJ...`, different from the anon key)
3. Paste it as `SUPABASE_SERVICE_ROLE_KEY` in Vercel (and update `.env.local` locally)
