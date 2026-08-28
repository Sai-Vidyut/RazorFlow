import { NextResponse } from "next/server";
import { AuthError } from "@/lib/auth/errors";
import { requireOrderBuyerSession } from "@/lib/auth/request";
import { PaymentError, abandonCheckout } from "@/lib/services/payments";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { orderId?: string; reason?: string };
    const orderId = body.orderId?.trim();
    if (!orderId) {
      return NextResponse.json({ error: "orderId is required" }, { status: 400 });
    }

    await requireOrderBuyerSession(request, orderId);

    const result = await abandonCheckout(
      orderId,
      body.reason?.trim() || "Checkout closed before payment completed.",
    );
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    if (error instanceof PaymentError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("POST /api/payments/abandon failed:", error);
    return NextResponse.json({ error: "Could not abandon checkout" }, { status: 500 });
  }
}
