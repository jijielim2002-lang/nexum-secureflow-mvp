"use client";
import { useAuth } from "@/contexts/AuthContext";
import { NotificationInbox } from "@/components/NotificationInbox";
import { AuthGuard } from "@/components/AuthGuard";

export default function CustomerNotificationsPage() {
  return (
    <AuthGuard requiredRole="customer">
      <CustomerNotificationsInner />
    </AuthGuard>
  );
}

function CustomerNotificationsInner() {
  const { profile } = useAuth();
  return (
    <NotificationInbox
      recipientRole="customer"
      recipientCompanyId={profile?.company_id ?? null}
      recipientUserId={profile?.id ?? null}
      actorId={profile?.id ?? null}
      pageTitle="My Notifications"
      roleBadgeClass="border-emerald-500/30 bg-emerald-500/10 text-emerald-400"
      roleBadgeLabel="Customer"
      dashboardHref="/customer"
    />
  );
}
