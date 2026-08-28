"use client";

import { AdminLayoutClient } from "@/components/admin/admin-layout-client";
import { AdminPoliciesDashboard } from "@/components/admin/admin-policies-dashboard";

export function AdminPoliciesPageClient() {
  return (
    <AdminLayoutClient>
      <AdminPoliciesDashboard />
    </AdminLayoutClient>
  );
}
