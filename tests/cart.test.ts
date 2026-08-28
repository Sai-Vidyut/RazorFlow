import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { PrismaClient } from "@prisma/client";
import { parseIntent } from "@/lib/agent/parse-intent";
import { runAgentWithParsed } from "@/lib/agent/run-agent";
import { db } from "@/lib/db";
import { getConfiguredDemoMerchantId } from "@/lib/config/merchant";
import { createBuyerSession } from "@/lib/services/sessions";
import { runAgentForSession } from "@/lib/services/agent-run";
import {
  addToCart,
  clearCart,
  getCartForSession,
  removeCartLine,
  updateCartLineQuantity,
  validateSessionCart,
} from "@/lib/services/cart";
import { createCheckoutFromCart } from "@/lib/services/checkout";
import { getAvailableCatalog } from "@/lib/services/catalog";
import { getMerchantPoliciesForAgent, updatePersistedPolicies } from "@/lib/services/policies";

const prisma = new PrismaClient();

vi.mock("@/lib/razorpay/client", async () => {
  const actual = await vi.importActual<typeof import("@/lib/razorpay/client")>("@/lib/razorpay/client");
  return {
    ...actual,
    isRazorpayConfigured: () => true,
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

const defaultPolicy = {
  discountCeilingPct: 12,
  marginFloorPct: 18,
  orderCapPaise: 5000000,
  minAttachRatePct: 35,
  allowEvidenceCrossSell: true,
  requireBudgetFit: true,
};

describe("user-controlled cart", () => {
  beforeAll(async () => {
    await prisma.$connect();
    await updatePersistedPolicies(defaultPolicy);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("does not auto-add suggested accessory to cart", async () => {
    const { sessionId } = await createBuyerSession(
      "halo-anc Halo ANC for a 14-hour flight, budget ₹8,500",
    );
    const { result } = await runAgentForSession(sessionId);
    expect(result.attach?.sku).toBe("halo-case");

    const cart = await getCartForSession(sessionId);
    expect(cart.lines).toHaveLength(0);
    expect(cart.subtotalPaise).toBe(0);
  });

  it("adds SKU when buyer explicitly adds to cart", async () => {
    const { sessionId } = await createBuyerSession("Need earbuds under ₹5000");
    await addToCart(sessionId, "drift-buds");
    const cart = await getCartForSession(sessionId);
    expect(cart.lines).toHaveLength(1);
    expect(cart.lines[0]?.sku).toBe("drift-buds");
    expect(cart.itemCount).toBe(1);
  });

  it("removes items from cart", async () => {
    const { sessionId } = await createBuyerSession("Need earbuds");
    await addToCart(sessionId, "drift-buds");
    const before = await getCartForSession(sessionId);
    await removeCartLine(sessionId, before.lines[0]!.id);
    const after = await getCartForSession(sessionId);
    expect(after.lines).toHaveLength(0);
  });

  it("updates totals when quantity changes", async () => {
    const { sessionId } = await createBuyerSession("Need earbuds");
    await addToCart(sessionId, "drift-buds");
    const cart = await getCartForSession(sessionId);
    await updateCartLineQuantity(sessionId, cart.lines[0]!.id, 2);
    const updated = await getCartForSession(sessionId);
    expect(updated.lines[0]?.quantity).toBe(2);
    expect(updated.subtotalPaise).toBe(cart.lines[0]!.unitPricePaise * 2);
  });

  it("blocks checkout for empty cart", async () => {
    const { sessionId } = await createBuyerSession("Need earbuds");
    const validation = await validateSessionCart(sessionId);
    expect(validation.allowed).toBe(false);
    await expect(createCheckoutFromCart(sessionId)).rejects.toThrow(/empty/i);
  });

  it("checks out only explicitly selected cart items", async () => {
    const { sessionId } = await createBuyerSession(
      "halo-anc Halo ANC for a 14-hour flight, budget ₹8,500",
    );
    await runAgentForSession(sessionId);
    await addToCart(sessionId, "halo-anc");

    const checkout = await createCheckoutFromCart(sessionId);
    expect(checkout.amountPaise).toBe(749000);

    const order = await db.order.findUnique({
      where: { id: checkout.orderId },
      include: { lineItems: true },
    });
    expect(order?.lineItems).toHaveLength(1);
    expect(order?.lineItems[0]?.sku).toBe("halo-anc");
  });

  it("works for anonymous buyer sessions without account", async () => {
    const { sessionId } = await createBuyerSession("Need a portable speaker under ₹4000");
    await addToCart(sessionId, "field-speaker");
    const cart = await getCartForSession(sessionId);
    expect(cart.lines[0]?.sku).toBe("field-speaker");
  });

  it("clears cart lines", async () => {
    const { sessionId } = await createBuyerSession("Need earbuds");
    await addToCart(sessionId, "drift-buds");
    await clearCart(sessionId);
    const cart = await getCartForSession(sessionId);
    expect(cart.lines).toHaveLength(0);
  });

  it("preserves single-product recommendation behavior", async () => {
    const catalog = await getAvailableCatalog(getConfiguredDemoMerchantId());
    const policies = await getMerchantPoliciesForAgent(getConfiguredDemoMerchantId());
    const intent = parseIntent("recommend me the best earbuds");
    const result = runAgentWithParsed(intent, policies, catalog);
    expect(result.results.length).toBe(1);
    expect(result.primary).not.toBeNull();
  });
});
