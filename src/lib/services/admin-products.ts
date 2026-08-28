import type { AuditEventType, Prisma, Product } from "@prisma/client";
import type { PublicProduct } from "@/lib/agent/types";
import { recordMerchantAuditEvent } from "@/lib/audit";
import { db } from "@/lib/db";
import { rupeesToPaise } from "@/lib/format";
import { dbProductToPublicProduct } from "@/lib/services/catalog-map";

/** Server-side default margin assumption when merchants create products without cost input. */
const DEFAULT_COST_RATIO = 0.68;

export class AdminProductError extends Error {
  constructor(
    message: string,
    readonly status: number = 400,
  ) {
    super(message);
    this.name = "AdminProductError";
  }
}

export type AdminProductRecord = Omit<PublicProduct, "attachSku" | "attachRate"> & {
  id: string;
  active: boolean;
  description: string;
  attachSku: string | null;
  attachRate: number | null;
  updatedAt: string;
};

export type AdminProductListFilters = {
  search?: string;
  status?: "all" | "active" | "inactive";
  category?: string;
};

export type CreateAdminProductInput = {
  name: string;
  sku: string;
  description: string;
  category: string;
  priceInr: number;
  inventory: number;
  tags?: string[];
  metadata?: Record<string, unknown>;
  image?: string;
  imageAlt?: string;
  attachSku?: string | null;
  attachRate?: number | null;
};

export type UpdateAdminProductInput = {
  name?: string;
  description?: string;
  category?: string;
  priceInr?: number;
  inventory?: number;
  tags?: string[];
  metadata?: Record<string, unknown>;
  image?: string;
  imageAlt?: string;
  attachSku?: string | null;
  attachRate?: number | null;
  active?: boolean;
};

function normalizeTags(tags: string[] | undefined): string[] {
  if (!tags) return [];
  return [...new Set(tags.map((tag) => tag.trim().toLowerCase()).filter(Boolean))];
}

function normalizeMetadata(value: Record<string, unknown> | undefined): Prisma.InputJsonValue {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }
  return value as Prisma.InputJsonValue;
}

function normalizeSku(sku: string): string {
  return sku.trim().toLowerCase();
}

function assertNonEmptyString(value: unknown, field: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new AdminProductError(`${field} is required`);
  }
  return value.trim();
}

function assertPriceInr(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    throw new AdminProductError("priceInr must be a positive number");
  }
  return value;
}

function assertInventory(value: unknown): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0) {
    throw new AdminProductError("inventory must be a non-negative integer");
  }
  return value;
}

function toAdminProductRecord(product: Product): AdminProductRecord {
  const publicProduct = dbProductToPublicProduct(product);
  const { attachSku: _attachSku, attachRate: _attachRate, ...rest } = publicProduct;
  return {
    ...rest,
    id: product.id,
    active: product.active,
    description: product.description,
    attachSku: product.attachSku,
    attachRate: product.attachRate,
    updatedAt: product.updatedAt.toISOString(),
  };
}

async function recordProductAudit(
  merchantId: string,
  type: AuditEventType,
  data: Prisma.InputJsonValue,
) {
  await recordMerchantAuditEvent(merchantId, type, "merchant", data);
}

export function validateCreateAdminProductInput(body: unknown): CreateAdminProductInput {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new AdminProductError("Invalid product payload");
  }

  const record = body as Record<string, unknown>;
  const name = assertNonEmptyString(record.name, "name");
  const sku = normalizeSku(assertNonEmptyString(record.sku, "sku"));
  const description = assertNonEmptyString(record.description, "description");
  const category = assertNonEmptyString(record.category, "category").toLowerCase();
  const priceInr = assertPriceInr(record.priceInr);
  const inventory = assertInventory(record.inventory);

  if (!/^[a-z0-9-]+$/.test(sku)) {
    throw new AdminProductError("sku must use lowercase letters, numbers, and hyphens");
  }

  const tags = normalizeTags(Array.isArray(record.tags) ? (record.tags as string[]) : undefined);
  const metadata =
    record.metadata && typeof record.metadata === "object" && !Array.isArray(record.metadata)
      ? (record.metadata as Record<string, unknown>)
      : {};

  const image =
    typeof record.image === "string" && record.image.trim()
      ? record.image.trim()
      : "/products/placeholder.png";
  const imageAlt =
    typeof record.imageAlt === "string" && record.imageAlt.trim() ? record.imageAlt.trim() : name;

  let attachSku: string | null = null;
  if (record.attachSku != null) {
    if (typeof record.attachSku !== "string" || !record.attachSku.trim()) {
      throw new AdminProductError("attachSku must be a non-empty string when provided");
    }
    attachSku = normalizeSku(record.attachSku);
  }

  let attachRate: number | null = null;
  if (record.attachRate != null) {
    if (typeof record.attachRate !== "number" || record.attachRate < 0 || record.attachRate > 1) {
      throw new AdminProductError("attachRate must be between 0 and 1");
    }
    attachRate = record.attachRate;
  }

  return {
    name,
    sku,
    description,
    category,
    priceInr,
    inventory,
    tags,
    metadata,
    image,
    imageAlt,
    attachSku,
    attachRate,
  };
}

export function validateUpdateAdminProductInput(body: unknown): UpdateAdminProductInput {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new AdminProductError("Invalid product payload");
  }

  const record = body as Record<string, unknown>;
  const input: UpdateAdminProductInput = {};

  if (record.name != null) input.name = assertNonEmptyString(record.name, "name");
  if (record.description != null) input.description = assertNonEmptyString(record.description, "description");
  if (record.category != null) input.category = assertNonEmptyString(record.category, "category").toLowerCase();
  if (record.priceInr != null) input.priceInr = assertPriceInr(record.priceInr);
  if (record.inventory != null) input.inventory = assertInventory(record.inventory);
  if (record.tags != null) {
    if (!Array.isArray(record.tags)) throw new AdminProductError("tags must be an array");
    input.tags = normalizeTags(record.tags as string[]);
  }
  if (record.metadata != null) {
    if (typeof record.metadata !== "object" || Array.isArray(record.metadata)) {
      throw new AdminProductError("metadata must be an object");
    }
    input.metadata = record.metadata as Record<string, unknown>;
  }
  if (record.image != null) input.image = assertNonEmptyString(record.image, "image");
  if (record.imageAlt != null) input.imageAlt = assertNonEmptyString(record.imageAlt, "imageAlt");
  if (record.attachSku != null) {
    if (record.attachSku === "") {
      input.attachSku = null;
    } else if (typeof record.attachSku === "string") {
      input.attachSku = normalizeSku(record.attachSku);
    } else {
      throw new AdminProductError("attachSku must be a string");
    }
  }
  if (record.attachRate != null) {
    if (typeof record.attachRate !== "number" || record.attachRate < 0 || record.attachRate > 1) {
      throw new AdminProductError("attachRate must be between 0 and 1");
    }
    input.attachRate = record.attachRate;
  }
  if (record.active != null) {
    if (typeof record.active !== "boolean") throw new AdminProductError("active must be a boolean");
    input.active = record.active;
  }

  if (Object.keys(input).length === 0) {
    throw new AdminProductError("At least one field is required to update a product");
  }

  return input;
}

export async function listAdminProducts(
  merchantId: string,
  filters: AdminProductListFilters = {},
): Promise<AdminProductRecord[]> {
  const where: Prisma.ProductWhereInput = { merchantId };

  if (filters.status === "active") where.active = true;
  if (filters.status === "inactive") where.active = false;

  if (filters.category && filters.category !== "all") {
    where.category = filters.category.toLowerCase();
  }

  if (filters.search?.trim()) {
    const query = filters.search.trim();
    where.OR = [
      { name: { contains: query, mode: "insensitive" } },
      { sku: { contains: query, mode: "insensitive" } },
      { category: { contains: query, mode: "insensitive" } },
      { tags: { has: query.toLowerCase() } },
    ];
  }

  const products = await db.product.findMany({
    where,
    orderBy: [{ active: "desc" }, { name: "asc" }],
  });

  return products.map(toAdminProductRecord);
}

export async function getAdminProduct(
  merchantId: string,
  productId: string,
): Promise<AdminProductRecord> {
  const product = await db.product.findFirst({
    where: { id: productId, merchantId },
  });

  if (!product) {
    throw new AdminProductError("Product not found", 404);
  }

  return toAdminProductRecord(product);
}

export async function createAdminProduct(
  merchantId: string,
  input: CreateAdminProductInput,
): Promise<AdminProductRecord> {
  const existing = await db.product.findFirst({
    where: { merchantId, sku: input.sku },
  });
  if (existing) {
    throw new AdminProductError("A product with this SKU already exists", 409);
  }

  if (input.attachSku) {
    const attachTarget = await db.product.findFirst({
      where: { merchantId, sku: input.attachSku },
    });
    if (!attachTarget) {
      throw new AdminProductError("attachSku must reference an existing product SKU", 400);
    }
  }

  const pricePaise = rupeesToPaise(input.priceInr);
  const costPaise = Math.round(pricePaise * DEFAULT_COST_RATIO);

  const product = await db.product.create({
    data: {
      merchantId,
      sku: input.sku,
      name: input.name,
      description: input.description,
      category: input.category,
      pricePaise,
      costPaise,
      inventory: input.inventory,
      tags: input.tags ?? [],
      metadata: normalizeMetadata(input.metadata),
      image: input.image ?? "/products/placeholder.png",
      imageAlt: input.imageAlt ?? input.name,
      attachSku: input.attachSku,
      attachRate: input.attachRate,
      active: true,
    },
  });

  await recordProductAudit(merchantId, "PRODUCT_CREATED", {
    productId: product.id,
    sku: product.sku,
    name: product.name,
    pricePaise: product.pricePaise,
    inventory: product.inventory,
    active: product.active,
  });

  return toAdminProductRecord(product);
}

export async function updateAdminProduct(
  merchantId: string,
  productId: string,
  input: UpdateAdminProductInput,
): Promise<AdminProductRecord> {
  const existing = await db.product.findFirst({
    where: { id: productId, merchantId },
  });

  if (!existing) {
    throw new AdminProductError("Product not found", 404);
  }

  if (input.attachSku) {
    const attachTarget = await db.product.findFirst({
      where: { merchantId, sku: input.attachSku },
    });
    if (!attachTarget) {
      throw new AdminProductError("attachSku must reference an existing product SKU", 400);
    }
  }

  const data: Prisma.ProductUpdateInput = {};
  const auditEvents: AuditEventType[] = [];
  const auditPayload: Record<string, unknown> = {
    productId: existing.id,
    sku: existing.sku,
    name: existing.name,
  };

  if (input.name != null) data.name = input.name;
  if (input.description != null) data.description = input.description;
  if (input.category != null) data.category = input.category;
  if (input.tags != null) data.tags = input.tags;
  if (input.metadata != null) data.metadata = normalizeMetadata(input.metadata);
  if (input.image != null) data.image = input.image;
  if (input.imageAlt != null) data.imageAlt = input.imageAlt;
  if (input.attachSku !== undefined) data.attachSku = input.attachSku;
  if (input.attachRate !== undefined) data.attachRate = input.attachRate;

  if (input.priceInr != null) {
    const nextPricePaise = rupeesToPaise(input.priceInr);
    if (nextPricePaise !== existing.pricePaise) {
      data.pricePaise = nextPricePaise;
      auditEvents.push("PRODUCT_PRICE_CHANGED");
      auditPayload.previousPricePaise = existing.pricePaise;
      auditPayload.nextPricePaise = nextPricePaise;
    }
  }

  if (input.inventory != null && input.inventory !== existing.inventory) {
    data.inventory = input.inventory;
    auditEvents.push("PRODUCT_INVENTORY_CHANGED");
    auditPayload.previousInventory = existing.inventory;
    auditPayload.nextInventory = input.inventory;
  }

  if (input.active != null && input.active !== existing.active) {
    data.active = input.active;
    auditEvents.push(input.active ? "PRODUCT_ACTIVATED" : "PRODUCT_DEACTIVATED");
    auditPayload.active = input.active;
  }

  const generalFieldsChanged =
    input.name != null ||
    input.description != null ||
    input.category != null ||
    input.tags != null ||
    input.metadata != null ||
    input.image != null ||
    input.imageAlt != null ||
    input.attachSku !== undefined ||
    input.attachRate !== undefined;

  if (generalFieldsChanged && auditEvents.length === 0) {
    auditEvents.push("PRODUCT_UPDATED");
  } else if (generalFieldsChanged) {
    auditEvents.push("PRODUCT_UPDATED");
  }

  const product = await db.product.update({
    where: { id: existing.id },
    data,
  });

  for (const type of [...new Set(auditEvents)]) {
    await recordProductAudit(merchantId, type, auditPayload as Prisma.InputJsonValue);
  }

  return toAdminProductRecord(product);
}

export async function listAdminProductCategories(merchantId: string): Promise<string[]> {
  const rows = await db.product.findMany({
    where: { merchantId },
    select: { category: true },
    distinct: ["category"],
    orderBy: { category: "asc" },
  });
  return rows.map((row) => row.category);
}
