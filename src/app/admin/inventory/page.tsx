import type { Metadata } from "next";
import { AdminInventoryPageClient } from "@/components/admin/admin-inventory-page-client";

export const metadata: Metadata = {
  title: "Inventory",
};

export default function AdminInventoryPage() {
  return <AdminInventoryPageClient />;
}
