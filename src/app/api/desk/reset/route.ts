import { NextResponse } from "next/server";
import { appendClearBuyerSessionCookie } from "@/lib/auth/buyer-cookies";

export async function POST() {
  const response = NextResponse.json({ ok: true });
  appendClearBuyerSessionCookie(response);
  return response;
}
