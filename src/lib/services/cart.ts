import type { CartLine, Product as DbProduct } from "@prisma/client";
import { marginPct } from "@/lib/agent/parse-intent";
import type { MerchantPolicies, Product } from "@/lib/agent/types";
import { recordAuditEvent } from "@/lib/audit";
import { db } from "@/lib/db";
import { getAvailableCatalog } from "@/lib/services/catalog";
import { toPublicProduct } from "@/lib/services/catalog-map";
import { getMerchantPoliciesForAgent } from "@/lib/services/policies";

export type CartLineView = {
  id: string;
  productId: string;
  sku: string;
  name: string;
  blurb: string;
  image: string;
  imageAlt: string;
  unitPrice: number;
  unitPricePaise: number;
  quantity: number;
  lineTotal: number;
  lineTotalPaise: number;
  inventory: number;
};

export type CartView = {
  sessionId: string;
  lines: CartLineView[];
  itemCount: number;
  subtotal: number;
  subtotalPaise: number;
};

function mapLine(line: CartLine & { product: DbProduct }): CartLineView {
  const unitPricePaise = line.product.pricePaise;
  const lineTotalPaise = unitPricePaise * line.quantity;
  return {
    id: line.id,
    productId: line.product.id,
    sku: line.product.sku,
    name: line.product.name,
    blurb: line.product.description,
    image: line.product.image,
    imageAlt: line.product.imageAlt,
    unitPrice: unitPricePaise / 100,
    unitPricePaise,
    quantity: line.quantity,
    lineTotal: lineTotalPaise / 100,
    lineTotalPaise,
    inventory: line.product.inventory,
  };
}

export async function getCartForSession(sessionId: string): Promise<CartView> {
  const lines = await db.cartLine.findMany({
    where: { sessionId },
    include: { product: true },
    orderBy: { createdAt: "asc" },
  });

  const mapped = lines.map(mapLine);
  const subtotalPaise = mapped.reduce((sum, line) => sum + line.lineTotalPaise, 0);

  return {
    sessionId,
    lines: mapped,
    itemCount: mapped.reduce((sum, line) => sum + line.quantity, 0),
    subtotal: subtotalPaise / 100,
    subtotalPaise,
  };
}

export class CartError extends Error {
  constructor(
    message: string,
    readonly status: number = 400,
  ) {
    super(message);
    this.name = "CartError";
  }
}

async function assertSessionExists(sessionId: string) {
  const session = await db.buyerSession.findUnique({ where: { id: sessionId } });
  if (!session) {
    throw new CartError("Session not found", 404);
  }
  return session;
}

async function findCatalogProduct(sessionId: string, sku: string): Promise<Product & { id: string }> {
  const session = await assertSessionExists(sessionId);
  const catalog = await getAvailableCatalog(session.merchantId);
  const product = catalog.find((item) => item.sku === sku);
  if (!product || !product.active || !product.id) {
    throw new CartError("Product not found in catalog", 404);
  }
  return product as Product & { id: string };
}

export async function addToCart(sessionId: string, sku: string, quantity = 1) {
  if (quantity < 1) {
    throw new CartError("Quantity must be at least 1");
  }

  const product = await findCatalogProduct(sessionId, sku);
  if (product.inventory < quantity) {
    throw new CartError(`Only ${product.inventory} in stock for ${product.name}`);
  }

  const line = await db.cartLine.upsert({
    where: {
      sessionId_productId: {
        sessionId,
        productId: product.id,
      },
    },
    create: {
      sessionId,
      productId: product.id,
      quantity,
    },
    update: {
      quantity: {
        increment: quantity,
      },
    },
    include: { product: true },
  });

  const refreshed = await db.cartLine.findUnique({
    where: { id: line.id },
    include: { product: true },
  });

  if (refreshed && refreshed.quantity > product.inventory) {
    await db.cartLine.update({
      where: { id: line.id },
      data: { quantity: product.inventory },
    });
    throw new CartError(`Only ${product.inventory} in stock for ${product.name}`);
  }

  await recordAuditEvent(sessionId, "DECISION_RECORDED", "buyer", {
    action: "cart_add",
    sku,
    quantity,
  });

  return getCartForSession(sessionId);
}

export async function updateCartLineQuantity(sessionId: string, lineId: string, quantity: number) {
  await assertSessionExists(sessionId);
  if (quantity < 1) {
    throw new CartError("Quantity must be at least 1");
  }

  const line = await db.cartLine.findFirst({
    where: { id: lineId, sessionId },
    include: { product: true },
  });
  if (!line) {
    throw new CartError("Cart line not found", 404);
  }
  if (line.product.inventory < quantity) {
    throw new CartError(`Only ${line.product.inventory} in stock for ${line.product.name}`);
  }

  await db.cartLine.update({
    where: { id: lineId },
    data: { quantity },
  });

  return getCartForSession(sessionId);
}

export async function removeCartLine(sessionId: string, lineId: string) {
  await assertSessionExists(sessionId);
  const line = await db.cartLine.findFirst({ where: { id: lineId, sessionId } });
  if (!line) {
    throw new CartError("Cart line not found", 404);
  }
  await db.cartLine.delete({ where: { id: lineId } });
  return getCartForSession(sessionId);
}

export async function clearCart(sessionId: string) {
  await assertSessionExists(sessionId);
  await db.cartLine.deleteMany({ where: { sessionId } });
  return getCartForSession(sessionId);
}

export type CartPolicyResult = {
  allowed: boolean;
  blockedReason: string | null;
  marginPct: number;
  policies: Array<{ id: string; label: string; result: "allowed" | "blocked"; detail: string }>;
};

export function validateCartAgainstPolicies(
  cart: CartView,
  catalog: Product[],
  policies: MerchantPolicies,
): CartPolicyResult {
  if (cart.lines.length === 0) {
    return {
      allowed: false,
      blockedReason: "Cart is empty.",
      marginPct: 0,
      policies: [
        {
          id: "cart",
          label: "Cart",
          result: "blocked",
          detail: "No items in cart",
        },
      ],
    };
  }

  const policyResults: CartPolicyResult["policies"] = [];
  let subtotal = 0;
  let cost = 0;

  for (const line of cart.lines) {
    const product = catalog.find((item) => item.sku === line.sku);
    if (!product || !product.active) {
      policyResults.push({
        id: "catalog",
        label: "Catalog availability",
        result: "blocked",
        detail: `${line.name} is unavailable`,
      });
      continue;
    }
    if (product.inventory < line.quantity) {
      policyResults.push({
        id: "inventory",
        label: "Inventory",
        result: "blocked",
        detail: `${line.name} has ${product.inventory} in stock, ${line.quantity} requested`,
      });
    }
    subtotal += product.price * line.quantity;
    cost += product.cost * line.quantity;
  }

  const margin = marginPct(subtotal, cost);
  policyResults.push({
    id: "margin",
    label: "Margin floor",
    result: margin >= policies.minMarginPct ? "allowed" : "blocked",
    detail: `${margin.toFixed(1)}% vs ${policies.minMarginPct}% floor`,
  });
  policyResults.push({
    id: "order-cap",
    label: "Order cap",
    result: subtotal <= policies.maxOrderInr ? "allowed" : "blocked",
    detail: `Cap ${policies.maxOrderInr}`,
  });

  const blocked = policyResults.find((item) => item.result === "blocked");
  return {
    allowed: !blocked,
    blockedReason: blocked?.detail ?? null,
    marginPct: margin,
    policies: policyResults,
  };
}

export async function validateSessionCart(sessionId: string): Promise<CartPolicyResult & { cart: CartView }> {
  const session = await assertSessionExists(sessionId);
  const cart = await getCartForSession(sessionId);
  const catalog = await getAvailableCatalog(session.merchantId);
  const policies = await getMerchantPoliciesForAgent(session.merchantId);
  const validation = validateCartAgainstPolicies(cart, catalog, policies);
  return { ...validation, cart };
}

export function cartToPublic(cart: CartView) {
  return {
    ...cart,
    lines: cart.lines.map((line) => ({
      ...line,
      product: toPublicProduct({
        id: line.productId,
        sku: line.sku,
        name: line.name,
        blurb: line.blurb,
        price: line.unitPrice,
        pricePaise: line.unitPricePaise,
        category: "",
        tags: [],
        metadata: {},
        inventory: line.inventory,
        active: true,
        image: line.image,
        imageAlt: line.imageAlt,
        cost: 0,
        costPaise: 0,
      }),
    })),
  };
}
