import type { NextResponse } from "next/server";
import {
  BUYER_COOKIE_MAX_AGE_SECONDS,
  BUYER_SESSION_COOKIE,
  buildSetCookie,
} from "@/lib/auth/cookies";
import { signBuyerSessionToken } from "@/lib/auth/tokens";

export function buildBuyerSessionSetCookie(sessionId: string): string {
  const token = signBuyerSessionToken(sessionId);
  return buildSetCookie(BUYER_SESSION_COOKIE, token, BUYER_COOKIE_MAX_AGE_SECONDS);
}

export function appendBuyerSessionCookie(response: NextResponse, sessionId: string): void {
  response.headers.append("Set-Cookie", buildBuyerSessionSetCookie(sessionId));
}

export function clearBuyerSessionCookie(): string {
  return `${BUYER_SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`;
}

export function appendClearBuyerSessionCookie(response: NextResponse): void {
  response.headers.append("Set-Cookie", clearBuyerSessionCookie());
}
