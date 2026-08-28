import { NextResponse } from "next/server";
import { AuthError } from "@/lib/auth/errors";
import { getSessionAuthState } from "@/lib/auth/request";
import { resolveDemoMerchant } from "@/lib/services/merchant";

export async function GET(request: Request) {
  try {
    const merchant = await resolveDemoMerchant();
    const { sessionId, identity, account } = await getSessionAuthState(request);

    const capability = account?.capability ?? (sessionId ? (identity?.capability ?? "anonymous") : "anonymous");
    const emailVerified = account?.emailVerified ?? identity?.emailVerified ?? false;

    return NextResponse.json({
      merchantId: merchant.id,
      merchantName: merchant.name,
      sessionId,
      account: account
        ? {
            id: account.id,
            email: account.email,
            emailVerified: account.emailVerified,
            emailVerifiedAt: account.emailVerifiedAt,
            capability: account.capability,
          }
        : null,
      email: account?.email ?? identity?.email ?? null,
      emailVerified,
      emailVerifiedAt: account?.emailVerifiedAt ?? identity?.emailVerifiedAt ?? null,
      capability,
      authenticated: Boolean(account),
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("GET /api/auth/session failed:", error);
    return NextResponse.json({ error: "Failed to load session" }, { status: 500 });
  }
}
