import { NextResponse } from "next/server";
import { AccountError, resetPasswordWithToken } from "@/lib/services/buyer-account";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      token?: string;
      password?: string;
      passwordConfirmation?: string;
    };

    const token = body.token?.trim();
    const password = body.password ?? "";
    const passwordConfirmation = body.passwordConfirmation ?? "";

    if (!token || !password || !passwordConfirmation) {
      return NextResponse.json({ error: "All reset fields are required" }, { status: 400 });
    }

    await resetPasswordWithToken({ token, password, passwordConfirmation });
    return NextResponse.json({ message: "Password updated. Sign in with your new password." });
  } catch (error) {
    if (error instanceof AccountError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    }
    console.error("POST /api/auth/reset-password failed:", error);
    return NextResponse.json({ error: "Could not reset password" }, { status: 500 });
  }
}
