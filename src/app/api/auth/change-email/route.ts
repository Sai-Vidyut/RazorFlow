import { NextResponse } from "next/server";
import { AuthError } from "@/lib/auth/errors";
import { requireAuthenticatedAccount } from "@/lib/auth/request";
import { AccountError, changeAccountEmail } from "@/lib/services/buyer-account";

export async function POST(request: Request) {
  try {
    const account = await requireAuthenticatedAccount(request);
    const body = (await request.json()) as { email?: string };
    const email = body.email?.trim();
    if (!email) {
      return NextResponse.json({ error: "Email is required" }, { status: 400 });
    }

    const updated = await changeAccountEmail({ accountId: account.id, newEmail: email });
    return NextResponse.json({
      account: {
        id: updated.id,
        email: updated.email,
        emailVerified: updated.emailVerified,
        capability: updated.capability,
      },
      message: "Email updated. Check your inbox to verify the new address.",
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    }
    if (error instanceof AccountError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    }
    console.error("POST /api/auth/change-email failed:", error);
    return NextResponse.json({ error: "Could not change email" }, { status: 500 });
  }
}
