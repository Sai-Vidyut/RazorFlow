import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import { GET as listProductsRoute, POST as createProductRoute } from "@/app/api/admin/products/route";
import { GET as getProductRoute, PATCH as patchProductRoute } from "@/app/api/admin/products/[productId]/route";
import { getConfiguredDemoMerchantId } from "@/lib/config/merchant";
import { signMerchantSessionToken } from "@/lib/auth/tokens";
import { getAvailableCatalog } from "@/lib/services/catalog";
import { createCheckoutForSession } from "@/lib/services/checkout";
import { runAgentForSession } from "@/lib/services/agent-run";
import { createBuyerSession } from "@/lib/services/sessions";
import {
  createAdminProduct,
  getAdminProduct,
  updateAdminProduct,
} from "@/lib/services/admin-products";
import { db } from "@/lib/db";
import { unauthorizedHeaders } from "./helpers/auth";
import { createStaffAuthContext } from "./helpers/staff-auth";

const prisma = new PrismaClient();
const MERCHANT_ID = getConfiguredDemoMerchantId();
const ISOLATION_MERCHANT_ID = `product-isolation-${Date.now()}`;
let staffHeaders: HeadersInit;

describe("Phase 4B admin products", () => {
  const createdProductIds: string[] = [];

  beforeAll(async () => {
    await prisma.$connect();
    const staff = await createStaffAuthContext();
    staffHeaders = staff.headers;
    await db.merchant.upsert({
      where: { id: ISOLATION_MERCHANT_ID },
      create: { id: ISOLATION_MERCHANT_ID, name: "Product Isolation Merchant" },
      update: {},
    });
  });

  afterAll(async () => {
    await db.auditEvent.deleteMany({ where: { merchantId: ISOLATION_MERCHANT_ID } });
    await db.product.deleteMany({
      where: { merchantId: { in: [MERCHANT_ID, ISOLATION_MERCHANT_ID] }, sku: { startsWith: "test-" } },
    });
    await db.merchant.deleteMany({ where: { id: ISOLATION_MERCHANT_ID } });
    await prisma.$disconnect();
  });

  it("rejects unauthenticated product list access", async () => {
    const response = await listProductsRoute(
      new Request("http://localhost/api/admin/products", { headers: unauthorizedHeaders() }),
    );
    expect(response.status).toBe(401);
  });

  it("allows authenticated merchant to list own products", async () => {
    const response = await listProductsRoute(
      new Request("http://localhost/api/admin/products", { headers: staffHeaders }),
    );
    expect(response.status).toBe(200);
    const payload = (await response.json()) as { products: Array<{ id: string; sku: string }> };
    expect(payload.products.length).toBeGreaterThan(0);
    expect(payload.products.every((product) => product.sku.length > 0)).toBe(true);
  });

  it("never exposes costPaise through admin product APIs", async () => {
    const listResponse = await listProductsRoute(
      new Request("http://localhost/api/admin/products", { headers: staffHeaders }),
    );
    const listText = await listResponse.text();
    expect(listText).not.toMatch(/costPaise|"cost":/);

    const created = await createAdminProduct(MERCHANT_ID, {
      name: "Test Exposure Guard",
      sku: `test-exposure-${Date.now()}`,
      description: "Ensures cost is not returned",
      category: "test",
      priceInr: 1200,
      inventory: 5,
      tags: ["test"],
      image: "/products/halo-anc.png",
      imageAlt: "Test product",
    });
    createdProductIds.push(created.id);

    const getResponse = await getProductRoute(
      new Request(`http://localhost/api/admin/products/${created.id}`, {
        headers: staffHeaders,
      }),
      { params: Promise.resolve({ productId: created.id }) },
    );
    const getText = await getResponse.text();
    expect(getText).not.toMatch(/costPaise|"cost":/);
  });

  it("prevents cross-merchant product access", async () => {
    const isolationProduct = await createAdminProduct(ISOLATION_MERCHANT_ID, {
      name: "Isolation Only Product",
      sku: `test-isolation-${Date.now()}`,
      description: "Belongs to another merchant",
      category: "test",
      priceInr: 999,
      inventory: 3,
      tags: ["isolation"],
      image: "/products/halo-anc.png",
      imageAlt: "Isolation product",
    });

    const response = await getProductRoute(
      new Request(`http://localhost/api/admin/products/${isolationProduct.id}`, {
        headers: staffHeaders,
      }),
      { params: Promise.resolve({ productId: isolationProduct.id }) },
    );
    expect(response.status).toBe(404);

    const listResponse = await listProductsRoute(
      new Request("http://localhost/api/admin/products", { headers: staffHeaders }),
    );
    const payload = (await listResponse.json()) as { products: Array<{ id: string }> };
    expect(payload.products.some((product) => product.id === isolationProduct.id)).toBe(false);
  });

  it("creates, updates, prices, inventories, and deactivates products with audit events", async () => {
    const sku = `test-admin-${Date.now()}`;

    const createResponse = await createProductRoute(
      new Request("http://localhost/api/admin/products", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...staffHeaders },
        body: JSON.stringify({
          name: "Admin Test Buds",
          sku,
          description: "Created from admin tests",
          category: "earbuds",
          priceInr: 2500,
          inventory: 12,
          tags: ["test", "earbuds"],
          image: "/products/drift-buds.png",
          imageAlt: "Admin test buds",
        }),
      }),
    );
    expect(createResponse.status).toBe(201);
    const createdPayload = (await createResponse.json()) as { product: { id: string; sku: string } };
    const productId = createdPayload.product.id;
    createdProductIds.push(productId);

    const createdAudit = await db.auditEvent.findFirst({
      where: { merchantId: MERCHANT_ID, type: "PRODUCT_CREATED" },
      orderBy: { createdAt: "desc" },
    });
    expect(createdAudit?.data).toMatchObject({ sku, productId });

    const patchPrice = await patchProductRoute(
      new Request(`http://localhost/api/admin/products/${productId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...staffHeaders },
        body: JSON.stringify({ priceInr: 2799 }),
      }),
      { params: Promise.resolve({ productId }) },
    );
    expect(patchPrice.status).toBe(200);

    const priceAudit = await db.auditEvent.findFirst({
      where: { merchantId: MERCHANT_ID, type: "PRODUCT_PRICE_CHANGED" },
      orderBy: { createdAt: "desc" },
    });
    expect(priceAudit?.data).toMatchObject({ productId, nextPricePaise: 279900 });

    const patchInventory = await patchProductRoute(
      new Request(`http://localhost/api/admin/products/${productId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...staffHeaders },
        body: JSON.stringify({ inventory: 4 }),
      }),
      { params: Promise.resolve({ productId }) },
    );
    expect(patchInventory.status).toBe(200);

    const inventoryAudit = await db.auditEvent.findFirst({
      where: { merchantId: MERCHANT_ID, type: "PRODUCT_INVENTORY_CHANGED" },
      orderBy: { createdAt: "desc" },
    });
    expect(inventoryAudit?.data).toMatchObject({ productId, nextInventory: 4 });

    const deactivate = await patchProductRoute(
      new Request(`http://localhost/api/admin/products/${productId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...staffHeaders },
        body: JSON.stringify({ active: false }),
      }),
      { params: Promise.resolve({ productId }) },
    );
    expect(deactivate.status).toBe(200);

    const deactivatedAudit = await db.auditEvent.findFirst({
      where: { merchantId: MERCHANT_ID, type: "PRODUCT_DEACTIVATED" },
      orderBy: { createdAt: "desc" },
    });
    expect(deactivatedAudit?.data).toMatchObject({ productId, active: false });

    const reactivate = await patchProductRoute(
      new Request(`http://localhost/api/admin/products/${productId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...staffHeaders },
        body: JSON.stringify({ active: true }),
      }),
      { params: Promise.resolve({ productId }) },
    );
    expect(reactivate.status).toBe(200);

    const updated = await getAdminProduct(MERCHANT_ID, productId);
    expect(updated.price).toBe(2799);
    expect(updated.inventory).toBe(4);
    expect(updated.active).toBe(true);
  });

  it("excludes inactive and zero-inventory products from agent catalog", async () => {
    const sku = `test-catalog-${Date.now()}`;
    const product = await createAdminProduct(MERCHANT_ID, {
      name: "Catalog Filter Product",
      sku,
      description: "Used to verify catalog filtering",
      category: "test",
      priceInr: 1500,
      inventory: 2,
      tags: ["test"],
      image: "/products/halo-anc.png",
      imageAlt: "Catalog filter product",
    });
    createdProductIds.push(product.id);

    let catalog = await getAvailableCatalog(MERCHANT_ID);
    expect(catalog.some((item) => item.sku === sku)).toBe(true);

    await updateAdminProduct(MERCHANT_ID, product.id, { active: false });
    catalog = await getAvailableCatalog(MERCHANT_ID);
    expect(catalog.some((item) => item.sku === sku)).toBe(false);

    await updateAdminProduct(MERCHANT_ID, product.id, { active: true, inventory: 0 });
    catalog = await getAvailableCatalog(MERCHANT_ID);
    expect(catalog.some((item) => item.sku === sku)).toBe(false);
  });

  it("rejects checkout when product price changes after agent decision", async () => {
    const halo = await db.product.findFirstOrThrow({
      where: { merchantId: MERCHANT_ID, sku: "halo-anc" },
    });
    const originalPriceInr = halo.pricePaise / 100;

    const { sessionId } = await createBuyerSession("ANC headphones for a 14-hour flight, budget ₹8,500");
    const { decisionId, result } = await runAgentForSession(sessionId);
    expect(result.primary?.sku).toBe("halo-anc");

    try {
      await updateAdminProduct(MERCHANT_ID, halo.id, { priceInr: originalPriceInr + 500 });
      await expect(createCheckoutForSession(sessionId, decisionId)).rejects.toMatchObject({
        status: 409,
      });
    } finally {
      await updateAdminProduct(MERCHANT_ID, halo.id, { priceInr: originalPriceInr });
    }
  });

  it("rejects product routes with another merchant token", async () => {
    const response = await listProductsRoute(
      new Request("http://localhost/api/admin/products", {
        headers: {
          Cookie: `rf_merchant_session=${encodeURIComponent(signMerchantSessionToken(ISOLATION_MERCHANT_ID))}`,
        },
      }),
    );
    expect(response.status).toBe(401);
  });
});
