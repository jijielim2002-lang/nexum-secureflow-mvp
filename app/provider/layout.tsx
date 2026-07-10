"use client";
import { AuthGuard } from "@/components/AuthGuard";

export default function ProviderLayout({ children }: { children: React.ReactNode }) {
  return <AuthGuard requiredRole="service_provider">{children}</AuthGuard>;
}
