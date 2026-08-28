import { NextResponse } from "next/server";
import { requireAuthenticatedAccount } from "@/lib/auth/request";
import { AuthError } from "@/lib/auth/errors";
import { EmailDeliveryError } from "@/lib/email/errors";
import { AccountError, resendVerificationCode } from "@/lib/services/buyer-account";

export async function POST(request: Request) {
  try {
    const account = await requireAuthenticatedAccount(request);
    const result = await resendVerificationCode(account.id);
    if (!result.sent) {
      return NextResponse.json({
        message: "Email is already verified",
        email: account.email,
        alreadyVerified: true,
        sent: false,
      });
    }
    return NextResponse.json({
      message: "Verification code sent",
      email: account.email,
      sent: true,
    });
  } catch (error) {
    if (error instanceof EmailDeliveryError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: 503 });
    }
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    }
    if (error instanceof AccountError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    }
    console.error("POST /api/auth/resend-verification failed:", error);
    return NextResponse.json({ error: "Could not resend verification email" }, { status: 500 });
  }
}
