import { NextResponse } from "next/server";
import { PaymentError, handleRazorpayWebhook } from "@/lib/services/payments";
import { getRazorpayWebhookSecret } from "@/lib/razorpay/client";

export async function POST(request: Request) {
  const webhookSecret = getRazorpayWebhookSecret();
  if (!webhookSecret) {
    return NextResponse.json({ error: "Webhook secret is not configured" }, { status: 503 });
  }

  const rawBody = await request.text();
  const signature = request.headers.get("x-razorpay-signature");

  try {
    const result = await handleRazorpayWebhook(rawBody, signature, webhookSecret);
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof PaymentError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("POST /api/webhooks/razorpay failed:", error);
    return NextResponse.json({ error: "Webhook processing failed" }, { status: 500 });
  }
}
