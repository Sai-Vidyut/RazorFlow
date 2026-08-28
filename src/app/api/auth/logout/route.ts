import { NextResponse } from "next/server";
import { appendAccountSessionClearCookie } from "@/lib/auth/account-cookies";
import { resolveAccountSessionId } from "@/lib/auth/request";
import { revokeAccountAuthSession } from "@/lib/services/buyer-account";

export async function POST(request: Request) {
  try {
    const authSessionId = await resolveAccountSessionId(request);
    if (authSessionId) {
      await revokeAccountAuthSession(authSessionId);
    }
    const response = NextResponse.json({ ok: true });
    appendAccountSessionClearCookie(response);
    return response;
  } catch (error) {
    console.error("POST /api/auth/logout failed:", error);
    return NextResponse.json({ error: "Could not sign out" }, { status: 500 });
  }
}
