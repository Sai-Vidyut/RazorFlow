import type { Metadata } from "next";
import { AdminOrdersPageClient } from "@/components/admin/admin-orders-page-client";

export const metadata: Metadata = { title: "Orders" };

export default function AdminOrdersPage() {
  return <AdminOrdersPageClient />;
}
