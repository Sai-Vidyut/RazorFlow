import { NextResponse } from "next/server";
import { AuthError } from "@/lib/auth/errors";
import { requireStaffSession } from "@/lib/auth/request";
import { listAdminOrders, type AdminOrderFilter } from "@/lib/services/admin-orders";

function parseOrderFilter(value: string | null): AdminOrderFilter {
  if (value === "pending" || value === "paid" || value === "failed") return value;
  return "all";
}

export async function GET(request: Request) {
  try {
    const { merchantId } = await requireStaffSession(request);
    const url = new URL(request.url);
    const filter = parseOrderFilter(url.searchParams.get("status"));
    const orders = await listAdminOrders(merchantId, filter);
    return NextResponse.json({ orders });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("GET /api/admin/orders failed:", error);
    return NextResponse.json({ error: "Failed to load orders" }, { status: 500 });
  }
}
