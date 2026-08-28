"use client";

import { AdminActivityDashboard } from "@/components/admin/admin-activity-dashboard";
import { AdminLayoutClient } from "@/components/admin/admin-layout-client";

export function AdminActivityPageClient() {
  return (
    <AdminLayoutClient>
      <AdminActivityDashboard />
    </AdminLayoutClient>
  );
}
