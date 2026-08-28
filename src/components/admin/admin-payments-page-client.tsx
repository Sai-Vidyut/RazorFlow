"use client";

import { AdminLayoutClient } from "@/components/admin/admin-layout-client";
import { AdminPaymentsDashboard } from "@/components/admin/admin-payments-dashboard";

export function AdminPaymentsPageClient() {
  return (
    <AdminLayoutClient>
      <AdminPaymentsDashboard />
    </AdminLayoutClient>
  );
}
