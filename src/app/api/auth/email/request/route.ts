import { NextResponse } from "next/server";

export async function POST() {
  return NextResponse.json(
    {
      error: "Email code verification has been replaced by buyer accounts. Register or log in instead.",
      code: "ACCOUNT_AUTH_REQUIRED",
    },
    { status: 410 },
  );
}
