// Centralized environment configuration.
// Import this in client components — never access process.env directly in client code.
// All values here are NEXT_PUBLIC_ safe for the browser bundle.

export type AppEnv = "local" | "staging" | "production";

export const APP_ENV: AppEnv =
  (process.env.NEXT_PUBLIC_APP_ENV as AppEnv | undefined) ?? "local";

export const APP_URL =
  process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

// When true, AI/intelligence optional panels are hidden.
// Controlled by NEXT_PUBLIC_DISABLE_OPTIONAL_MODULES=true in the host env.
export const OPTIONAL_MODULES_DISABLED =
  process.env.NEXT_PUBLIC_DISABLE_OPTIONAL_MODULES === "true";

export const IS_LOCAL      = APP_ENV === "local";
export const IS_STAGING    = APP_ENV === "staging";
export const IS_PRODUCTION = APP_ENV === "production";

// ─── Derived labels ───────────────────────────────────────────────────────────

export const ENV_LABEL: Record<AppEnv, string> = {
  local:      "Local Dev",
  staging:    "Staging",
  production: "Production (Pilot)",
};

export const ENV_BANNER_MESSAGE: Record<AppEnv, string | null> = {
  local:      null,
  staging:    "Staging Mode — Do not use for actual customer funds. Data may be reset without notice.",
  production: "Production Mode — Actual pilot customer workflow. MYR only · Manual DuitNow/bank transfer.",
};
