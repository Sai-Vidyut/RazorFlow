import type { Metadata } from "next";
import { AdminPaymentsPageClient } from "@/components/admin/admin-payments-page-client";

export const metadata: Metadata = { title: "Payments" };

export default function AdminPaymentsPage() {
  return <AdminPaymentsPageClient />;
}
