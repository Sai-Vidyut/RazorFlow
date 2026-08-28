-- Phase 3A: data-driven catalog and structured intent

-- Product: extensible metadata and string category
ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "metadata" JSONB NOT NULL DEFAULT '{}';
ALTER TABLE "Product" ALTER COLUMN "category" TYPE TEXT USING "category"::text;
CREATE INDEX IF NOT EXISTS "Product_category_idx" ON "Product"("category");

-- Policy: configurable attach threshold
ALTER TABLE "Policy" ADD COLUMN IF NOT EXISTS "minAttachRatePct" INTEGER NOT NULL DEFAULT 35;

-- BuyerIntent: structured intent JSON (backfill before dropping legacy columns)
ALTER TABLE "BuyerIntent" ADD COLUMN IF NOT EXISTS "structuredIntent" JSONB;

UPDATE "BuyerIntent" bi
SET "structuredIntent" = jsonb_build_object(
  'version', 1,
  'query', bs."rawRequest",
  'category', bi."category"::text,
  'constraints', jsonb_build_object(
    'maxPricePaise', bi."budgetMaxPaise",
    'minPricePaise', NULL,
    'maxDiscountPct', bi."requestedDiscountPct"
  ),
  'preferences', jsonb_build_object(
    'features', CASE
      WHEN bi."wantsAnc" THEN '["anc","noise-cancelling"]'::jsonb
      ELSE '[]'::jsonb
    END,
    'keywords', CASE
      WHEN bi."useCase" = 'gift' THEN '["gift"]'::jsonb
      WHEN bi."useCase" IS NOT NULL THEN to_jsonb(ARRAY[bi."useCase"])
      ELSE '[]'::jsonb
    END
  ),
  'useCase', bi."useCase",
  'quantity', 1
)
FROM "BuyerSession" bs
WHERE bs."id" = bi."sessionId"
  AND bi."structuredIntent" IS NULL;

UPDATE "BuyerIntent"
SET "structuredIntent" = jsonb_build_object(
  'version', 1,
  'query', '',
  'category', NULL,
  'constraints', jsonb_build_object(
    'maxPricePaise', NULL,
    'minPricePaise', NULL,
    'maxDiscountPct', NULL
  ),
  'preferences', jsonb_build_object(
    'features', '[]'::jsonb,
    'keywords', '[]'::jsonb
  ),
  'useCase', NULL,
  'quantity', 1
)
WHERE "structuredIntent" IS NULL;

ALTER TABLE "BuyerIntent" ALTER COLUMN "structuredIntent" SET NOT NULL;

ALTER TABLE "BuyerIntent" DROP COLUMN IF EXISTS "budgetMaxPaise";
ALTER TABLE "BuyerIntent" DROP COLUMN IF EXISTS "category";
ALTER TABLE "BuyerIntent" DROP COLUMN IF EXISTS "wantsAnc";
ALTER TABLE "BuyerIntent" DROP COLUMN IF EXISTS "useCase";
ALTER TABLE "BuyerIntent" DROP COLUMN IF EXISTS "requestedDiscountPct";
ALTER TABLE "BuyerIntent" DROP COLUMN IF EXISTS "rawStructuredData";

DROP TYPE IF EXISTS "ProductCategory";
