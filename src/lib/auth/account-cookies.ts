import type { NextResponse } from "next/server";
import {
  ACCOUNT_COOKIE_MAX_AGE_SECONDS,
  ACCOUNT_SESSION_COOKIE,
  buildSetCookie,
} from "@/lib/auth/cookies";
import { signAccountSessionToken } from "@/lib/auth/tokens";

export function buildAccountSessionSetCookie(authSessionId: string): string {
  const token = signAccountSessionToken(authSessionId);
  return buildSetCookie(ACCOUNT_SESSION_COOKIE, token, ACCOUNT_COOKIE_MAX_AGE_SECONDS);
}

export function buildAccountSessionClearCookie(): string {
  return `${ACCOUNT_SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`;
}

export function appendAccountSessionCookie(response: NextResponse, authSessionId: string): void {
  response.headers.append("Set-Cookie", buildAccountSessionSetCookie(authSessionId));
}

export function appendAccountSessionClearCookie(response: NextResponse): void {
  response.headers.append("Set-Cookie", buildAccountSessionClearCookie());
}
