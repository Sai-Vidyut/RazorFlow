import type { Metadata } from "next";
import { AdminProductsPageClient } from "@/components/admin/admin-products-page-client";

export const metadata: Metadata = {
  title: "Products",
};

export default function AdminProductsPage() {
  return <AdminProductsPageClient />;
}
