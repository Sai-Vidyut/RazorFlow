import type { Metadata } from "next";
import { AdminActivityPageClient } from "@/components/admin/admin-activity-page-client";

export const metadata: Metadata = { title: "Activity" };

export default function AdminActivityPage() {
  return <AdminActivityPageClient />;
}
