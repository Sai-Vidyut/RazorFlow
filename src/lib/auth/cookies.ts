export const BUYER_SESSION_COOKIE = "rf_buyer_session";
export const MERCHANT_SESSION_COOKIE = "rf_merchant_session";
export const ACCOUNT_SESSION_COOKIE = "rf_account_session";

export const BUYER_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24;
export const MERCHANT_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 8;
export const ACCOUNT_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 14;

export function parseCookieHeader(cookieHeader: string | null, name: string): string | null {
  if (!cookieHeader) return null;

  for (const part of cookieHeader.split(";")) {
    const [rawKey, ...rest] = part.trim().split("=");
    if (rawKey === name) {
      return decodeURIComponent(rest.join("="));
    }
  }

  return null;
}

export function buildSetCookie(
  name: string,
  value: string,
  maxAgeSeconds: number,
): string {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  return `${name}=${encodeURIComponent(value)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAgeSeconds}${secure}`;
}
