import { BUYER_SESSION_COOKIE, MERCHANT_SESSION_COOKIE } from "@/lib/auth/cookies";
import { signBuyerSessionToken, signMerchantSessionToken } from "@/lib/auth/tokens";
import { getConfiguredDemoMerchantId } from "@/lib/config/merchant";

export function buyerAuthHeaders(sessionId: string): HeadersInit {
  const token = signBuyerSessionToken(sessionId);
  return {
    Cookie: `${BUYER_SESSION_COOKIE}=${encodeURIComponent(token)}`,
    Authorization: `Bearer ${token}`,
  };
}

export function staffAuthHeaders(sessionId: string): HeadersInit {
  return buyerAuthHeaders(sessionId);
}

export function merchantAuthHeaders(merchantId: string = getConfiguredDemoMerchantId()): HeadersInit {
  const token = signMerchantSessionToken(merchantId);
  return {
    Cookie: `${MERCHANT_SESSION_COOKIE}=${encodeURIComponent(token)}`,
    Authorization: `Bearer ${token}`,
  };
}

export function unauthorizedHeaders(): HeadersInit {
  return { Cookie: "rf_buyer_session=invalid.token" };
}
