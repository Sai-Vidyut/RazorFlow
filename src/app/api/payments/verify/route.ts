import { NextResponse } from "next/server";
import { AuthError } from "@/lib/auth/errors";
import { requireOrderBuyerSession } from "@/lib/auth/request";
import { PaymentError, verifyAndCapturePayment } from "@/lib/services/payments";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      orderId?: string;
      razorpay_order_id?: string;
      razorpay_payment_id?: string;
      razorpay_signature?: string;
    };

    if (
      !body.orderId ||
      !body.razorpay_order_id ||
      !body.razorpay_payment_id ||
      !body.razorpay_signature
    ) {
      return NextResponse.json({ error: "Missing payment verification fields" }, { status: 400 });
    }

    await requireOrderBuyerSession(request, body.orderId);

    const result = await verifyAndCapturePayment({
      orderId: body.orderId,
      razorpayOrderId: body.razorpay_order_id,
      razorpayPaymentId: body.razorpay_payment_id,
      razorpaySignature: body.razorpay_signature,
    });

    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    if (error instanceof PaymentError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("POST /api/payments/verify failed:", error);
    return NextResponse.json({ error: "Payment verification failed" }, { status: 500 });
  }
}
