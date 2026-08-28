import { PrismaClient } from "@prisma/client";
import { clearMerchantTransactionalData } from "@/lib/services/merchant-transactional";

const db = new PrismaClient();

const SEED_PRODUCTS = [
  {
    sku: "halo-anc",
    name: "Northline Halo ANC",
    description: "Over-ear hybrid noise cancelling for long haul flights",
    pricePaise: 749000,
    costPaise: 512000,
    category: "headphones",
    tags: ["anc", "headphones", "flight", "travel", "wireless"],
    metadata: {
      features: ["anc", "wireless", "noise-cancelling"],
      useCases: ["travel", "flight"],
      catalogRole: "primary",
    },
    image: "/products/halo-anc.png",
    imageAlt: "Matte charcoal Northline Halo over-ear headphones",
    attachSku: "halo-case",
    attachRate: 0.41,
  },
  {
    sku: "halo-case",
    name: "Halo hard case",
    description: "Crush-resistant travel shell sized for Halo cups",
    pricePaise: 79000,
    costPaise: 31000,
    category: "accessory",
    tags: ["case", "travel", "accessory"],
    metadata: {
      features: ["travel"],
      useCases: ["travel"],
      catalogRole: "attach",
    },
    image: "/products/halo-case.png",
    imageAlt: "Charcoal hard-shell headphone travel case",
  },
  {
    sku: "drift-buds",
    name: "Northline Drift buds",
    description: "Compact ANC earbuds with a 28-hour case",
    pricePaise: 299000,
    costPaise: 184000,
    category: "earbuds",
    tags: ["anc", "earbuds", "compact", "commute"],
    metadata: {
      features: ["anc", "compact", "wireless"],
      useCases: ["commute"],
      catalogRole: "primary",
    },
    image: "/products/drift-buds.png",
    imageAlt: "Charcoal true wireless earbuds in an open charging case",
  },
  {
    sku: "field-speaker",
    name: "Northline Field speaker",
    description: "Portable Bluetooth speaker with 12-hour battery",
    pricePaise: 399000,
    costPaise: 246000,
    category: "speaker",
    tags: ["speaker", "gift", "portable", "bluetooth"],
    metadata: {
      features: ["portable", "wireless", "bluetooth"],
      useCases: ["gift"],
      catalogRole: "primary",
    },
    image: "/products/field-speaker.png",
    imageAlt: "Compact cylindrical charcoal Bluetooth speaker",
  },
];

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

  for (const product of SEED_PRODUCTS) {
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
        inventory: 100,
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
        inventory: 100,
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

  console.log("Seeded Northline Audio merchant, policy, and catalog.");
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
