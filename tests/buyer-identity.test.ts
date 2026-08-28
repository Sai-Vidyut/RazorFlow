import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { PrismaClient } from "@prisma/client";
import { POST as checkoutRoute } from "@/app/api/checkout/route";
import { GET as authSessionRoute } from "@/app/api/auth/session/route";
import { runAgentForSession } from "@/lib/services/agent-run";
import { createBuyerSession } from "@/lib/services/sessions";
import { getConfiguredDemoMerchantId } from "@/lib/config/merchant";
import { clearMerchantTransactionalData } from "@/lib/services/merchant-transactional";
import { deleteTestAccountsForMerchant } from "@/lib/services/buyer-account";
import { combinedAuthHeaders, registerAndVerifyAccount, TEST_PASSWORD } from "./helpers/accounts";
import { buyerAuthHeaders } from "./helpers/auth";

const prisma = new PrismaClient();
const MERCHANT_ID = getConfiguredDemoMerchantId();

vi.mock("@/lib/razorpay/client", async () => {
  const actual = await vi.importActual<typeof import("@/lib/razorpay/client")>("@/lib/razorpay/client");
  return {
    ...actual,
    isRazorpayConfigured: () => true,
    getRazorpayKeySecret: () => "test_razorpay_secret",
    getPublicRazorpayKeyId: () => "rzp_test_key",
    getRazorpayClient: () => ({
      orders: {
        create: vi.fn(async ({ amount, receipt }: { amount: number; receipt: string }) => ({
          id: `order_${receipt}`,
          amount,
          currency: "INR",
        })),
      },
    }),
  };
});

describe("Buyer identity session linkage", () => {
  beforeAll(async () => {
    await prisma.$connect();
  });

  afterAll(async () => {
    await clearMerchantTransactionalData(MERCHANT_ID);
    await deleteTestAccountsForMerchant(MERCHANT_ID);
    await prisma.$disconnect();
  });

  it("links verified accounts to the active buyer session for checkout", async () => {
    await clearMerchantTransactionalData(MERCHANT_ID);
    await deleteTestAccountsForMerchant(MERCHANT_ID);
    const { sessionId } = await createBuyerSession("ANC headphones under ₹8,500");
    const { decisionId } = await runAgentForSession(sessionId);
    const verified = await registerAndVerifyAccount({
      email: "linked-buyer@example.com",
      password: TEST_PASSWORD,
      sessionId,
    });

    const sessionRes = await authSessionRoute(
      new Request("http://localhost/api/auth/session", {
        headers: combinedAuthHeaders(sessionId, verified.authSessionId),
      }),
    );
    const sessionPayload = (await sessionRes.json()) as { capability: string; emailVerified: boolean };
    expect(sessionPayload.emailVerified).toBe(true);
    expect(sessionPayload.capability).toBe("buyer");

    const checkout = await checkoutRoute(
      new Request("http://localhost/api/checkout", {
        method: "POST",
        headers: {
          ...combinedAuthHeaders(sessionId, verified.authSessionId),
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ sessionId, decisionId }),
      }),
    );
    expect(checkout.status).toBe(200);
  });

  it("blocks checkout when only the buyer cookie is present", async () => {
    const { sessionId } = await createBuyerSession("ANC headphones under ₹8,500");
    const { decisionId } = await runAgentForSession(sessionId);
    const response = await checkoutRoute(
      new Request("http://localhost/api/checkout", {
        method: "POST",
        headers: {
          ...buyerAuthHeaders(sessionId),
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ sessionId, decisionId }),
      }),
    );
    expect(response.status).toBe(403);
  });
});
