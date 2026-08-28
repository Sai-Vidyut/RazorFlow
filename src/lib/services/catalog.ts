import { db } from "@/lib/db";
import { dbProductToAgentProduct } from "@/lib/services/catalog-map";

/**
 * Returns active, in-stock products for a merchant.
 * Inactive or zero-inventory products are excluded from agent consideration.
 */
export async function getAvailableCatalog(merchantId: string) {
  const products = await db.product.findMany({
    where: {
      merchantId,
      active: true,
      inventory: { gt: 0 },
    },
    orderBy: { sku: "asc" },
  });
  return products.map(dbProductToAgentProduct);
}

/** @deprecated Prefer getAvailableCatalog — alias kept for existing imports */
export async function getCatalogProductsByMerchantId(merchantId: string) {
  return getAvailableCatalog(merchantId);
}

export async function getActiveCatalog(merchantId: string) {
  return getAvailableCatalog(merchantId);
}

export async function findProductBySku(merchantId: string, sku: string) {
  const product = await db.product.findFirst({
    where: { merchantId, sku, active: true, inventory: { gt: 0 } },
  });
  return product ? dbProductToAgentProduct(product) : null;
}
