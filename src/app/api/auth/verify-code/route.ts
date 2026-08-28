import { NextResponse } from "next/server";
import { AuthError } from "@/lib/auth/errors";
import { appendAccountSessionCookie } from "@/lib/auth/account-cookies";
import {
  requireAuthenticatedAccount,
  resolveBuyerSessionId,
} from "@/lib/auth/request";
import {
  AccountError,
  createAccountAuthSession,
  linkAccountToBuyerSession,
  resolveValidBuyerSessionId,
  verifyEmailWithCode,
} from "@/lib/services/buyer-account";
import { db } from "@/lib/db";
import { resolveDemoMerchant } from "@/lib/services/merchant";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { code?: string; sessionId?: string };
    const code = body.code?.trim();
    if (!code) {
      return NextResponse.json({ error: "Verification code is required" }, { status: 400 });
    }

    const accountSession = await requireAuthenticatedAccount(request);
    const merchant = await resolveDemoMerchant();
    if (accountSession.merchantId !== merchant.id) {
      return NextResponse.json({ error: "Account not found" }, { status: 404 });
    }

    const account = await verifyEmailWithCode(accountSession.id, code);

    const rawBuyerSessionId =
      body.sessionId?.trim() || (await resolveBuyerSessionId(request)) || undefined;
    const buyerSessionId = await resolveValidBuyerSessionId(merchant.id, rawBuyerSessionId);
    if (buyerSessionId) {
      const row = await db.buyerAccount.findUnique({ where: { id: accountSession.id } });
      if (row) {
        await linkAccountToBuyerSession(row, buyerSessionId, merchant.id);
      }
    }

    const authSessionId = await createAccountAuthSession(accountSession.id);
    const response = NextResponse.json({
      account: {
        id: account.id,
        email: account.email,
        emailVerified: account.emailVerified,
        capability: account.capability,
      },
    });
    appendAccountSessionCookie(response, authSessionId);
    return response;
  } catch (error) {
    if (error instanceof AccountError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    }
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    }
    console.error("POST /api/auth/verify-code failed:", error);
    return NextResponse.json({ error: "Could not verify email" }, { status: 500 });
  }
}
