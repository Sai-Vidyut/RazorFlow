import { NextResponse } from "next/server";
import {
  extractVerificationCodeFromEmail,
  findLatestDevEmailTo,
} from "@/lib/email/dev-outbox";
import { normalizeEmail } from "@/lib/services/buyer-identity";

/** Dev/test helper: read the latest verification code from the dev outbox. Never available in production. */
export async function POST(request: Request) {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const body = (await request.json()) as { email?: string };
  const email = body.email?.trim().toLowerCase();
  if (!email) {
    return NextResponse.json({ error: "email is required" }, { status: 400 });
  }

  normalizeEmail(email);
  const message = findLatestDevEmailTo(email);
  if (!message) {
    return NextResponse.json({ error: "No verification email found" }, { status: 404 });
  }

  const code = extractVerificationCodeFromEmail(message.html);
  if (!code) {
    return NextResponse.json({ error: "Verification code missing" }, { status: 404 });
  }

  return NextResponse.json({ code });
}
