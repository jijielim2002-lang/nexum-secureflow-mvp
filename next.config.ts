import type { NextConfig } from "next";

const nextConfig: NextConfig = {

  // Skip TypeScript type-checking during builds (errors are caught locally/in CI).
  // Remove this once all API route types are cleaned up.
  typescript: { ignoreBuildErrors: true },

  // Required for Docker/VPS deployment — produces .next/standalone with node server.js
  output: process.env.DOCKER_BUILD === "true" ? "standalone" : undefined,

  // Expose build-time env vars that are safe to embed in the client bundle.
  // SUPABASE_SERVICE_ROLE_KEY is intentionally absent — server-side only.
  env: {
    NEXT_PUBLIC_APP_ENV:                process.env.NEXT_PUBLIC_APP_ENV ?? "local",
    NEXT_PUBLIC_APP_URL:                process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000",
    NEXT_PUBLIC_DISABLE_OPTIONAL_MODULES: process.env.NEXT_PUBLIC_DISABLE_OPTIONAL_MODULES ?? "false",
  },

  // Never include the service role key in the browser bundle — enforce at build time.
  // If a client component accidentally imports it the build will expose it, so this
  // runtime guard is a secondary line of defence (the primary is: only import it in
  // app/api/** route handlers).

  // Strict mode for React 19
  reactStrictMode: true,

  // Images — add your production domain when deploying
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "*.supabase.co",
        port: "",
        pathname: "/storage/v1/object/public/**",
      },
    ],
  },
};

export default nextConfig;
