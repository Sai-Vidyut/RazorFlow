import type { Metadata } from "next";
import { AdminRecoveryPageClient } from "@/components/admin/admin-recovery-page-client";

export const metadata: Metadata = { title: "Recovery" };

export default function AdminRecoveryPage() {
  return <AdminRecoveryPageClient />;
}
