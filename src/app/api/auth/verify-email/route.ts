import { NextResponse } from "next/server";
import { AccountError, verifyEmailWithToken } from "@/lib/services/buyer-account";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const token = url.searchParams.get("token")?.trim();
    if (!token) {
      return NextResponse.json({ error: "Verification link is invalid" }, { status: 400 });
    }

    const account = await verifyEmailWithToken(token);
    return NextResponse.json({
      email: account.email,
      emailVerified: account.emailVerified,
      emailVerifiedAt: account.emailVerifiedAt,
      capability: account.capability,
    });
  } catch (error) {
    if (error instanceof AccountError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    }
    console.error("GET /api/auth/verify-email failed:", error);
    return NextResponse.json({ error: "Could not verify email" }, { status: 500 });
  }
}
