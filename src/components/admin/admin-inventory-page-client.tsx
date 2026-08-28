"use client";

import { AdminLayoutClient } from "@/components/admin/admin-layout-client";
import { AdminInventoryDashboard } from "@/components/admin/admin-inventory-dashboard";

export function AdminInventoryPageClient() {
  return (
    <AdminLayoutClient>
      <AdminInventoryDashboard />
    </AdminLayoutClient>
  );
}
