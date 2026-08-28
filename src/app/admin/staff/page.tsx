import type { Metadata } from "next";
import { AdminStaffClient } from "@/components/admin/admin-staff-client";

export const metadata: Metadata = {
  title: "Staff",
};

export default function AdminStaffPage() {
  return <AdminStaffClient />;
}
