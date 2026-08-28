import { NextResponse } from "next/server";
import {
  extractVerificationCodeFromEmail,
  findLatestDevEmailTo,
} from "@/lib/email/dev-outbox";
import { AccountError, verifyEmailWithCode } from "@/lib/services/buyer-account";
import { db } from "@/lib/db";
import { normalizeEmail } from "@/lib/services/buyer-identity";
import { resolveDemoMerchant } from "@/lib/services/merchant";

export async function POST(request: Request) {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  try {
    const body = (await request.json()) as { email?: string; code?: string };
    const email = body.email?.trim().toLowerCase();
    if (!email) {
      return NextResponse.json({ error: "email is required" }, { status: 400 });
    }

    const merchant = await resolveDemoMerchant();
    const account = await db.buyerAccount.findUnique({
      where: {
        merchantId_emailNormalized: { merchantId: merchant.id, emailNormalized: normalizeEmail(email) },
      },
    });
    if (!account) {
      return NextResponse.json({ error: "Account not found" }, { status: 404 });
    }

    let code = body.code?.trim();
    if (!code) {
      const message = findLatestDevEmailTo(email);
      if (!message) {
        return NextResponse.json({ error: "No verification email found" }, { status: 404 });
      }
      code = extractVerificationCodeFromEmail(message.html) ?? undefined;
    }

    if (!code) {
      return NextResponse.json({ error: "Verification code missing" }, { status: 404 });
    }

    const verified = await verifyEmailWithCode(account.id, code);
    return NextResponse.json({
      verified: true,
      email: verified.email,
      capability: verified.capability,
    });
  } catch (error) {
    if (error instanceof AccountError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    }
    console.error("POST /api/auth/dev/verify-email failed:", error);
    return NextResponse.json({ error: "Dev verification failed" }, { status: 500 });
  }
}
