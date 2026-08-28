import { execSync } from "node:child_process";
import { PrismaClient } from "@prisma/client";

const merchantId = process.env.DEMO_MERCHANT_ID?.trim() || "northline-audio";
const db = new PrismaClient();

async function main() {
  const merchant = await db.merchant.findUnique({
    where: { id: merchantId },
    select: { id: true },
  });

  if (merchant) {
    console.log(`ensure-demo-seed: skip (${merchantId} already exists)`);
    return;
  }

  console.log(`ensure-demo-seed: no merchant row for ${merchantId}, running prisma db seed`);
  execSync("npx prisma db seed", { stdio: "inherit", env: process.env });
}

main()
  .catch((error) => {
    console.error("ensure-demo-seed failed:", error);
    process.exit(1);
  })
  .finally(async () => {
    await db.$disconnect();
  });
