import { NextResponse } from "next/server";
import { AuthError } from "@/lib/auth/errors";
import { requireStaffSession } from "@/lib/auth/request";
import { AdminPaymentError, getAdminPaymentDetail } from "@/lib/services/admin-payments";

type RouteContext = { params: Promise<{ paymentId: string }> };

export async function GET(request: Request, context: RouteContext) {
  try {
    const { merchantId } = await requireStaffSession(request);
    const { paymentId } = await context.params;
    if (!paymentId?.trim()) {
      return NextResponse.json({ error: "Payment id is required" }, { status: 400 });
    }

    const payment = await getAdminPaymentDetail(merchantId, paymentId);
    return NextResponse.json({ payment });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    if (error instanceof AdminPaymentError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("GET /api/admin/payments/[paymentId] failed:", error);
    return NextResponse.json({ error: "Failed to load payment" }, { status: 500 });
  }
}
