import { createHmac, randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { PrismaClient } from "@prisma/client";
import { POST as runAgentRoute } from "@/app/api/agent/run/route";
import { POST as checkoutRoute } from "@/app/api/checkout/route";
import { GET as catalogRoute } from "@/app/api/catalog/route";
import { GET as ledgerRoute } from "@/app/api/ledger/route";
import { POST as verifyPaymentRoute } from "@/app/api/payments/verify/route";
import { GET as policiesRoute, PUT as putPoliciesRoute } from "@/app/api/policies/route";
import { agentResultToApiResponse, runAgentForSession } from "@/lib/services/agent-run";
import { runAgentWithParsed } from "@/lib/agent/run-agent";
import { createStructuredIntent, structuredIntentFromDb, structuredIntentToJson } from "@/lib/agent/structured-intent";
import { db } from "@/lib/db";
import { getConfiguredDemoMerchantId } from "@/lib/config/merchant";
import { verifyWebhookSignature } from "@/lib/razorpay/verify";
import { createCheckoutForSession } from "@/lib/services/checkout";
import { handleRazorpayWebhook } from "@/lib/services/payments";
import { createBuyerSession } from "@/lib/services/sessions";
import { getAvailableCatalog } from "@/lib/services/catalog";
import { getMerchantPoliciesForAgent, updatePersistedPolicies } from "@/lib/services/policies";
import {
  buyerAuthHeaders,
  merchantAuthHeaders,
  unauthorizedHeaders,
} from "./helpers/auth";
import { createStaffAuthContext } from "./helpers/staff-auth";

const prisma = new PrismaClient();
const TEST_WEBHOOK_SECRET = "test_webhook_secret_phase3d";
const MERCHANT_ID = getConfiguredDemoMerchantId();

const defaultPolicy = {
  discountCeilingPct: 12,
  marginFloorPct: 18,
  orderCapPaise: 5000000,
  minAttachRatePct: 35,
  allowEvidenceCrossSell: true,
  requireBudgetFit: true,
};

vi.mock("@/lib/razorpay/client", async () => {
  const actual = await vi.importActual<typeof import("@/lib/razorpay/client")>("@/lib/razorpay/client");
  return {
    ...actual,
    isRazorpayConfigured: () => true,
    getRazorpayKeySecret: () => "test_razorpay_secret",
    getPublicRazorpayKeyId: () => "rzp_test_key",
    getRazorpayWebhookSecret: () => TEST_WEBHOOK_SECRET,
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

function signWebhook(body: string) {
  return createHmac("sha256", TEST_WEBHOOK_SECRET).update(body).digest("hex");
}

function uniqueEventId(label: string) {
  return `evt_${label}_${randomUUID().replace(/-/g, "").slice(0, 12)}`;
}

async function pinSessionPrimarySku(sessionId: string, sku: string, quantity: number) {
  const intentRow = await db.buyerIntent.findUniqueOrThrow({ where: { sessionId } });
  const base = structuredIntentFromDb(intentRow.structuredIntent!);
  await db.buyerIntent.update({
    where: { sessionId },
    data: {
      structuredIntent: structuredIntentToJson(
        createStructuredIntent({
          ...base,
          query: sku,
          category: "headphones",
          quantity,
          preferences: { features: [], keywords: [] },
        }),
      ),
    },
  });
}

describe("Phase 3D security and integrity", () => {
  beforeAll(async () => {
    await prisma.$connect();
    await updatePersistedPolicies(defaultPolicy);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("rejects agent run without buyer authorization", async () => {
    const { sessionId } = await createBuyerSession("ANC headphones under ₹8,500");
    const response = await runAgentRoute(
      new Request("http://localhost/api/agent/run", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...unauthorizedHeaders() },
        body: JSON.stringify({ sessionId }),
      }),
    );
    expect(response.status).toBe(401);
  });

  it("rejects cross-session IDOR on agent run", async () => {
    const first = await createBuyerSession("ANC headphones under ₹8,500");
    const second = await createBuyerSession("Gift speaker under ₹4,000");

    const response = await runAgentRoute(
      new Request("http://localhost/api/agent/run", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...buyerAuthHeaders(first.sessionId),
        },
        body: JSON.stringify({ sessionId: second.sessionId }),
      }),
    );

    expect(response.status).toBe(401);
  });

  it("rejects unauthenticated policy reads while merchant routes stay protected", async () => {
    const policies = await policiesRoute(
      new Request("http://localhost/api/policies", { headers: unauthorizedHeaders() }),
    );
    const ledger = await ledgerRoute(
      new Request("http://localhost/api/ledger", { headers: unauthorizedHeaders() }),
    );
    const catalog = await catalogRoute(
      new Request("http://localhost/api/catalog", { headers: unauthorizedHeaders() }),
    );

    expect(policies.status).toBe(401);
    expect(ledger.status).toBe(401);
    expect(catalog.status).toBe(401);
  });

  it("rejects policy updates without staff authorization", async () => {
    const staff = await createStaffAuthContext();
    const current = await policiesRoute(
      new Request("http://localhost/api/policies", { headers: staff.headers }),
    );
    expect(current.status).toBe(200);
    const payload = (await current.json()) as {
      maxDiscountPct: number;
      minMarginPct: number;
      maxOrderInr: number;
      minAttachRatePct: number;
      allowCrossSell: boolean;
      requireBudgetFit: boolean;
    };

    const response = await putPoliciesRoute(
      new Request("http://localhost/api/policies", {
        method: "PUT",
        headers: { "Content-Type": "application/json", ...unauthorizedHeaders() },
        body: JSON.stringify(payload),
      }),
    );
    expect(response.status).toBe(401);
  });

  it("never exposes merchant cost in agent API response", async () => {
    const { sessionId } = await createBuyerSession("ANC headphones under ₹8,500");
    const { decisionId, result } = await runAgentForSession(sessionId);
    const payload = agentResultToApiResponse(sessionId, decisionId, result);
    const serialized = JSON.stringify(payload);

    expect(serialized).not.toMatch(/costPaise|"cost":/);
    expect(payload.primary).not.toBeNull();
    expect(payload.primary).not.toHaveProperty("cost");
    expect(payload.primary).not.toHaveProperty("costPaise");
  });

  it("never exposes merchant cost in catalog API response", async () => {
    const response = await catalogRoute(
      new Request("http://localhost/api/catalog", { headers: merchantAuthHeaders() }),
    );
    const payload = (await response.json()) as { catalog: Array<Record<string, unknown>> };
    expect(response.status).toBe(200);
    expect(payload.catalog.length).toBeGreaterThan(0);
    for (const product of payload.catalog) {
      expect(product).not.toHaveProperty("cost");
      expect(product).not.toHaveProperty("costPaise");
    }
  });

  it("rejects checkout with a superseded agent decision", async () => {
    const { sessionId } = await createBuyerSession("ANC headphones under ₹8,500");
    const first = await runAgentForSession(sessionId);
    await runAgentForSession(sessionId);

    await expect(createCheckoutForSession(sessionId, first.decisionId)).rejects.toMatchObject({
      status: 409,
    });
  });

  it("rejects checkout for another session via route authorization", async () => {
    const owned = await createBuyerSession("ANC headphones under ₹8,500");
    const other = await createBuyerSession("Gift speaker under ₹4,000");
    const { decisionId } = await runAgentForSession(other.sessionId);

    const response = await checkoutRoute(
      new Request("http://localhost/api/checkout", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...buyerAuthHeaders(owned.sessionId),
        },
        body: JSON.stringify({ sessionId: other.sessionId, decisionId }),
      }),
    );

    expect(response.status).toBe(401);
  });

  it("rejects payment verify for an order owned by another buyer session", async () => {
    const owned = await createBuyerSession("ANC headphones under ₹8,500");
    const other = await createBuyerSession("ANC headphones under ₹8,500");
    const { decisionId } = await runAgentForSession(other.sessionId);
    const checkout = await createCheckoutForSession(other.sessionId, decisionId);

    const response = await verifyPaymentRoute(
      new Request("http://localhost/api/payments/verify", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...buyerAuthHeaders(owned.sessionId),
        },
        body: JSON.stringify({
          orderId: checkout.orderId,
          razorpay_order_id: checkout.razorpayOrderId,
          razorpay_payment_id: "pay_idor_test",
          razorpay_signature: "invalid",
        }),
      }),
    );

    expect(response.status).toBe(401);
  });

  it("prices quantity greater than one in the agent decision", async () => {
    const { sessionId } = await createBuyerSession("Northline Halo ANC under ₹20,000");
    await pinSessionPrimarySku(sessionId, "halo-anc", 2);
    const { result, decisionId } = await runAgentForSession(sessionId);

    expect(result.status).toBe("ready");
    expect(result.subtotal).toBe(7490 * 2);

    const decision = await db.agentDecision.findUniqueOrThrow({ where: { id: decisionId } });
    expect(decision.quantity).toBe(2);
    expect(decision.subtotalPaise).toBe(749000 * 2);

    const checkout = await createCheckoutForSession(sessionId, decisionId);
    expect(checkout.amountPaise).toBe(749000 * 2);
  });

  it("blocks quantity that exceeds primary inventory", async () => {
    const { sessionId } = await createBuyerSession("Northline Halo ANC under ₹20,000");
    await pinSessionPrimarySku(sessionId, "halo-anc", 3);
    await db.product.update({
      where: { merchantId_sku: { merchantId: MERCHANT_ID, sku: "halo-anc" } },
      data: { inventory: 2 },
    });

    const { result } = await runAgentForSession(sessionId);
    expect(result.status).toBe("blocked");
    expect(result.blockedReason).toMatch(/inventory/i);

    await db.product.update({
      where: { merchantId_sku: { merchantId: MERCHANT_ID, sku: "halo-anc" } },
      data: { inventory: 100 },
    });
  });

  it("blocks quantity that exceeds order cap via policy engine", async () => {
    await updatePersistedPolicies({
      ...defaultPolicy,
      orderCapPaise: 900000,
    });

    const { sessionId } = await createBuyerSession("Northline Halo ANC under ₹20,000");
    await pinSessionPrimarySku(sessionId, "halo-anc", 2);

    const intentRow = await db.buyerIntent.findUniqueOrThrow({ where: { sessionId } });
    const intent = structuredIntentFromDb(intentRow.structuredIntent!);
    const policies = await getMerchantPoliciesForAgent(MERCHANT_ID);
    const catalog = await getAvailableCatalog(MERCHANT_ID);
    const result = runAgentWithParsed(intent, policies, catalog);

    expect(result.status).toBe("blocked");
    expect(result.policies.some((policy) => policy.id === "order-cap" && policy.result === "blocked")).toBe(
      true,
    );

    await updatePersistedPolicies(defaultPolicy);
  });

  it("rejects invalid webhook signatures", async () => {
    const body = JSON.stringify({ id: uniqueEventId("bad_sig"), event: "payment.captured" });
    await expect(handleRazorpayWebhook(body, "bad_signature", TEST_WEBHOOK_SECRET)).rejects.toMatchObject({
      status: 401,
    });
  });

  it("allows webhook retry after order-not-found without marking processed", async () => {
    const eventId = uniqueEventId("retryable");
    const missingOrderBody = JSON.stringify({
      id: eventId,
      event: "payment.captured",
      payload: {
        payment: {
          entity: {
            id: "pay_missing_order",
            order_id: "order_does_not_exist",
            status: "captured",
          },
        },
      },
    });

    const signature = signWebhook(missingOrderBody);
    const first = await handleRazorpayWebhook(missingOrderBody, signature, TEST_WEBHOOK_SECRET);
    expect(first.processed).toBe(false);
    expect(first.reason).toBe("order_not_found");

    const stored = await db.processedWebhook.findUnique({ where: { eventId } });
    expect(stored).toBeNull();

    const { sessionId, decisionId } = await (async () => {
      const session = await createBuyerSession("ANC headphones under ₹8,500");
      const agent = await runAgentForSession(session.sessionId);
      return { sessionId: session.sessionId, decisionId: agent.decisionId };
    })();

    const checkout = await createCheckoutForSession(sessionId, decisionId);
    const retryBody = JSON.stringify({
      id: eventId,
      event: "payment.captured",
      payload: {
        payment: {
          entity: {
            id: "pay_retry_success",
            order_id: checkout.razorpayOrderId,
            status: "captured",
          },
        },
      },
    });

    const retry = await handleRazorpayWebhook(retryBody, signWebhook(retryBody), TEST_WEBHOOK_SECRET);
    expect(retry.processed).toBe(true);

    const processed = await db.processedWebhook.findUnique({ where: { eventId } });
    expect(processed).not.toBeNull();
  });

  it("handles duplicate webhook delivery idempotently after success", async () => {
    const { sessionId, decisionId } = await (async () => {
      const session = await createBuyerSession("ANC headphones under ₹8,500");
      const agent = await runAgentForSession(session.sessionId);
      return { sessionId: session.sessionId, decisionId: agent.decisionId };
    })();
    const checkout = await createCheckoutForSession(sessionId, decisionId);
    const eventId = uniqueEventId("duplicate");
    const body = JSON.stringify({
      id: eventId,
      event: "payment.captured",
      payload: {
        payment: {
          entity: {
            id: "pay_duplicate_success",
            order_id: checkout.razorpayOrderId,
            status: "captured",
          },
        },
      },
    });
    const signature = signWebhook(body);

    const first = await handleRazorpayWebhook(body, signature, TEST_WEBHOOK_SECRET);
    const second = await handleRazorpayWebhook(body, signature, TEST_WEBHOOK_SECRET);

    expect(first.processed).toBe(true);
    expect(second.processed).toBe(false);
    expect(second.reason).toBe("duplicate");
  });

  it("verifies webhook signatures with the shared helper", () => {
    const body = JSON.stringify({ event: "payment.captured" });
    const signature = signWebhook(body);
    expect(verifyWebhookSignature(body, signature, TEST_WEBHOOK_SECRET)).toBe(true);
    expect(verifyWebhookSignature(body, "bad", TEST_WEBHOOK_SECRET)).toBe(false);
  });
});
