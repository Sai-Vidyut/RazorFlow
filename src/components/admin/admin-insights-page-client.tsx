"use client";

import { AdminLayoutClient } from "@/components/admin/admin-layout-client";
import { AdminInsightsDashboard } from "@/components/admin/admin-insights-dashboard";

export function AdminInsightsPageClient() {
  return (
    <AdminLayoutClient>
      <AdminInsightsDashboard />
    </AdminLayoutClient>
  );
}
