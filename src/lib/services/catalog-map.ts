import type { Product as DbProduct } from "@prisma/client";
import type { Product, PublicProduct } from "@/lib/agent/types";

function metadataRecord(value: DbProduct["metadata"]): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

export function dbProductToAgentProduct(product: DbProduct): Product {
  return {
    id: product.id,
    sku: product.sku,
    name: product.name,
    blurb: product.description,
    price: product.pricePaise / 100,
    pricePaise: product.pricePaise,
    cost: product.costPaise / 100,
    costPaise: product.costPaise,
    category: product.category,
    tags: product.tags,
    metadata: metadataRecord(product.metadata),
    inventory: product.inventory,
    active: product.active,
    image: product.image,
    imageAlt: product.imageAlt,
    attachSku: product.attachSku ?? undefined,
    attachRate: product.attachRate ?? undefined,
  };
}

export function toPublicProduct(product: Product): PublicProduct {
  const { cost: _cost, costPaise: _costPaise, ...publicProduct } = product;
  return publicProduct;
}

export function dbProductToPublicProduct(product: DbProduct): PublicProduct {
  return toPublicProduct(dbProductToAgentProduct(product));
}
