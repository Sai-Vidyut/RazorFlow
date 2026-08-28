import { NextResponse } from "next/server";
import { EmailDeliveryError } from "@/lib/email/errors";
import { AccountError, requestPasswordReset } from "@/lib/services/buyer-account";
import { resolveDemoMerchant } from "@/lib/services/merchant";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { email?: string };
    const email = body.email?.trim();
    if (!email) {
      return NextResponse.json({ error: "Email is required" }, { status: 400 });
    }

    const merchant = await resolveDemoMerchant();
    await requestPasswordReset({ merchantId: merchant.id, email });

    return NextResponse.json({
      message: "If an account exists for that email, a reset link has been sent.",
    });
  } catch (error) {
    if (error instanceof EmailDeliveryError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: 503 });
    }
    if (error instanceof AccountError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    }
    console.error("POST /api/auth/forgot-password failed:", error);
    return NextResponse.json({ error: "Could not process request" }, { status: 500 });
  }
}
