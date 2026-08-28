import { NextResponse } from "next/server";
import { appendAccountSessionCookie } from "@/lib/auth/account-cookies";
import { resolveBuyerSessionId } from "@/lib/auth/request";
import {
  AccountError,
  createAccountAuthSession,
  loginAccount,
  resolveValidBuyerSessionId,
} from "@/lib/services/buyer-account";
import { resolveDemoMerchant } from "@/lib/services/merchant";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      email?: string;
      password?: string;
      sessionId?: string;
    };

    const email = body.email?.trim();
    const password = body.password ?? "";
    if (!email || !password) {
      return NextResponse.json({ error: "Email and password are required" }, { status: 400 });
    }

    const merchant = await resolveDemoMerchant();
    const rawBuyerSessionId =
      body.sessionId?.trim() || (await resolveBuyerSessionId(request)) || undefined;
    const buyerSessionId = await resolveValidBuyerSessionId(merchant.id, rawBuyerSessionId);

    const { account, identity } = await loginAccount({
      merchantId: merchant.id,
      email,
      password,
      buyerSessionId,
    });

    const authSessionId = await createAccountAuthSession(account.id);

    const response = NextResponse.json({
      account: {
        id: account.id,
        email: account.email,
        emailVerified: account.emailVerified,
        emailVerifiedAt: account.emailVerifiedAt,
        capability: account.capability,
      },
      identity: identity
        ? {
            sessionId: identity.sessionId,
            emailVerified: identity.emailVerified,
            capability: identity.capability,
          }
        : null,
    });
    appendAccountSessionCookie(response, authSessionId);
    return response;
  } catch (error) {
    if (error instanceof AccountError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    }
    console.error("POST /api/auth/login failed:", error);
    return NextResponse.json({ error: "Could not sign in" }, { status: 500 });
  }
}
