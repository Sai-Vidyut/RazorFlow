import { NextResponse } from "next/server";
import { AuthError } from "@/lib/auth/errors";
import { requireStaffSession } from "@/lib/auth/request";
import { AdminOrderError, getAdminOrderDetail } from "@/lib/services/admin-orders";

type RouteContext = { params: Promise<{ orderId: string }> };

export async function GET(request: Request, context: RouteContext) {
  try {
    const { merchantId } = await requireStaffSession(request);
    const { orderId } = await context.params;
    if (!orderId?.trim()) {
      return NextResponse.json({ error: "Order id is required" }, { status: 400 });
    }

    const order = await getAdminOrderDetail(merchantId, orderId);
    return NextResponse.json({ order });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    if (error instanceof AdminOrderError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("GET /api/admin/orders/[orderId] failed:", error);
    return NextResponse.json({ error: "Failed to load order" }, { status: 500 });
  }
}
