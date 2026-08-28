"use client";

import { AdminLayoutClient } from "@/components/admin/admin-layout-client";
import { AdminRecoveryDashboard } from "@/components/admin/admin-recovery-dashboard";

export function AdminRecoveryPageClient() {
  return (
    <AdminLayoutClient>
      <AdminRecoveryDashboard />
    </AdminLayoutClient>
  );
}
