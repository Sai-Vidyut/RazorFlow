import { NextResponse } from "next/server";

export async function POST() {
  return NextResponse.json(
    {
      error: "Email code verification has been replaced by buyer accounts. Use the verification link from your email.",
      code: "ACCOUNT_AUTH_REQUIRED",
    },
    { status: 410 },
  );
}
