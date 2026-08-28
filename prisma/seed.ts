import { PrismaClient } from "@prisma/client";
import { clearMerchantTransactionalData } from "@/lib/services/merchant-transactional";
import {
  NORTLINE_CATALOG_PRODUCT_COUNT,
  NORTLINE_SEED_PRODUCTS,
} from "./northline-catalog";

const db = new PrismaClient();

async function main() {
  const merchant = await db.merchant.upsert({
    where: { id: "northline-audio" },
    update: { name: "Northline Audio" },
    create: {
      id: "northline-audio",
      name: "Northline Audio",
    },
  });

  await clearMerchantTransactionalData(merchant.id);

  await db.policy.upsert({
    where: { merchantId: merchant.id },
    update: {
      discountCeilingPct: 12,
      marginFloorPct: 18,
      orderCapPaise: 2500000,
      minAttachRatePct: 35,
      allowEvidenceCrossSell: true,
      requireBudgetFit: true,
    },
    create: {
      merchantId: merchant.id,
      discountCeilingPct: 12,
      marginFloorPct: 18,
      orderCapPaise: 2500000,
      minAttachRatePct: 35,
      allowEvidenceCrossSell: true,
      requireBudgetFit: true,
    },
  });

  for (const product of NORTLINE_SEED_PRODUCTS) {
    await db.product.upsert({
      where: {
        merchantId_sku: {
          merchantId: merchant.id,
          sku: product.sku,
        },
      },
      update: {
        name: product.name,
        description: product.description,
        category: product.category,
        pricePaise: product.pricePaise,
        costPaise: product.costPaise,
        tags: product.tags,
        metadata: product.metadata,
        image: product.image,
        imageAlt: product.imageAlt,
        attachSku: product.attachSku ?? null,
        attachRate: product.attachRate ?? null,
        active: true,
        inventory: product.inventory,
      },
      create: {
        merchantId: merchant.id,
        sku: product.sku,
        name: product.name,
        description: product.description,
        category: product.category,
        pricePaise: product.pricePaise,
        costPaise: product.costPaise,
        tags: product.tags,
        metadata: product.metadata,
        image: product.image,
        imageAlt: product.imageAlt,
        attachSku: product.attachSku ?? null,
        attachRate: product.attachRate ?? null,
        active: true,
        inventory: product.inventory,
      },
    });
  }

  const STAFF_EMAILS = ["staff@northlineaudio.com", "ops@northlineaudio.com"];

  for (const email of STAFF_EMAILS) {
    await db.merchantStaffEmail.upsert({
      where: { merchantId_email: { merchantId: merchant.id, email } },
      update: {},
      create: { merchantId: merchant.id, email },
    });
  }

  console.log(
    `Seeded Northline Audio merchant, policy, and ${NORTLINE_CATALOG_PRODUCT_COUNT} catalog products.`,
  );
  console.log("Cleared synthetic buyer sessions, orders, payments, and audit activity.");
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await db.$disconnect();
  });
