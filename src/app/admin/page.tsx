import type { Metadata } from "next";
import { AdminPortalClient } from "@/components/admin/admin-portal-client";

export const metadata: Metadata = {
  title: "Admin",
};

export default function AdminPage() {
  return <AdminPortalClient />;
}
