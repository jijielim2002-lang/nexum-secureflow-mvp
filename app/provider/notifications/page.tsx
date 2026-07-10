"use client";
import { useAuth } from "@/contexts/AuthContext";
import { NotificationInbox } from "@/components/NotificationInbox";
import { AuthGuard } from "@/components/AuthGuard";

export default function ProviderNotificationsPage() {
  return (
    <AuthGuard requiredRole="service_provider">
      <ProviderNotificationsInner />
    </AuthGuard>
  );
}

function ProviderNotificationsInner() {
  const { profile } = useAuth();
  return (
    <NotificationInbox
      recipientRole="service_provider"
      recipientCompanyId={profile?.company_id ?? null}
      recipientUserId={profile?.id ?? null}
      actorId={profile?.id ?? null}
      pageTitle="Provider Notifications"
      roleBadgeClass="border-purple-500/30 bg-purple-500/10 text-purple-400"
      roleBadgeLabel="Provider"
      dashboardHref="/provider"
    />
  );
}
