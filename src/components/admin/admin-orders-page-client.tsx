"use client";

import { AdminLayoutClient } from "@/components/admin/admin-layout-client";
import { AdminOrdersDashboard } from "@/components/admin/admin-orders-dashboard";

export function AdminOrdersPageClient() {
  return (
    <AdminLayoutClient>
      <AdminOrdersDashboard />
    </AdminLayoutClient>
  );
}
