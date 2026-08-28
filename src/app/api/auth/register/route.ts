import { NextResponse } from "next/server";
import { AuthError } from "@/lib/auth/errors";
import { EmailDeliveryError } from "@/lib/email/errors";
import { appendAccountSessionCookie } from "@/lib/auth/account-cookies";
import { resolveBuyerSessionId } from "@/lib/auth/request";
import {
  AccountError,
  createAccountAuthSession,
  registerAccount,
  resolveValidBuyerSessionId,
} from "@/lib/services/buyer-account";
import { resolveDemoMerchant } from "@/lib/services/merchant";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      email?: string;
      password?: string;
      passwordConfirmation?: string;
      sessionId?: string;
    };

    const email = body.email?.trim();
    const password = body.password ?? "";
    const passwordConfirmation = body.passwordConfirmation ?? "";

    if (!email || !password || !passwordConfirmation) {
      return NextResponse.json({ error: "All registration fields are required" }, { status: 400 });
    }

    const merchant = await resolveDemoMerchant();
    const rawBuyerSessionId =
      body.sessionId?.trim() || (await resolveBuyerSessionId(request)) || undefined;
    const buyerSessionId = await resolveValidBuyerSessionId(merchant.id, rawBuyerSessionId);

    const { account } = await registerAccount({
      merchantId: merchant.id,
      email,
      password,
      passwordConfirmation,
      buyerSessionId,
    });

    const authSessionId = await createAccountAuthSession(account.id);

    const response = NextResponse.json({
      account: {
        id: account.id,
        email: account.email,
        emailVerified: account.emailVerified,
        capability: account.capability,
      },
      message: "Account created. Check your email to verify your address.",
    });
    appendAccountSessionCookie(response, authSessionId);
    return response;
  } catch (error) {
    if (error instanceof EmailDeliveryError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: 503 });
    }
    if (error instanceof AccountError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    }
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    }
    console.error("POST /api/auth/register failed:", error);
    return NextResponse.json({ error: "Could not create account" }, { status: 500 });
  }
}
