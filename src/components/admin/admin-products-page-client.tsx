"use client";

import { AdminLayoutClient } from "@/components/admin/admin-layout-client";
import { AdminProductsDashboard } from "@/components/admin/admin-products-dashboard";

export function AdminProductsPageClient() {
  return (
    <AdminLayoutClient>
      <AdminProductsDashboard />
    </AdminLayoutClient>
  );
}
