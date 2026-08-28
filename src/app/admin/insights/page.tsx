import type { Metadata } from "next";
import { AdminInsightsPageClient } from "@/components/admin/admin-insights-page-client";

export const metadata: Metadata = { title: "Insights" };

export default function AdminInsightsPage() {
  return <AdminInsightsPageClient />;
}
