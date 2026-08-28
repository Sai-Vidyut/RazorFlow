import type { Metadata } from "next";
import { AdminPoliciesPageClient } from "@/components/admin/admin-policies-page-client";

export const metadata: Metadata = { title: "Policies" };

export default function AdminPoliciesPage() {
  return <AdminPoliciesPageClient />;
}
