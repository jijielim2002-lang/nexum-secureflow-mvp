"use client";
import { useAuth } from "@/contexts/AuthContext";
import { NotificationInbox } from "@/components/NotificationInbox";
import { AuthGuard } from "@/components/AuthGuard";

export default function AdminNotificationsPage() {
  return (
    <AuthGuard requiredRole="admin">
      <AdminNotificationsInner />
    </AuthGuard>
  );
}

function AdminNotificationsInner() {
  const { profile } = useAuth();
  return (
    <NotificationInbox
      recipientRole="admin"
      recipientCompanyId={profile?.company_id ?? null}
      recipientUserId={profile?.id ?? null}
      actorId={profile?.id ?? null}
      pageTitle="Admin Notifications"
      roleBadgeClass="border-blue-500/30 bg-blue-500/10 text-blue-400"
      roleBadgeLabel="Admin"
      dashboardHref="/admin"
    />
  );
}
