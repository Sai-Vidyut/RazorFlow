"use client";

import { AdminLayoutClient } from "@/components/admin/admin-layout-client";
import { AdminOverviewDashboard } from "@/components/admin/admin-overview-dashboard";

export function AdminPortalClient() {
  return (
    <AdminLayoutClient>
      <AdminOverviewDashboard />
    </AdminLayoutClient>
  );
}
