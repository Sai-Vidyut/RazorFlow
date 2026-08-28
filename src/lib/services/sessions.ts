import { extractIntent } from "@/lib/agent/intent";
import {
  intentDisplayNeed,
  intentMaxBudgetInr,
  structuredIntentFromDb,
  structuredIntentToJson,
  type StructuredIntent,
} from "@/lib/agent/structured-intent";
import { recordAuditEvent } from "@/lib/audit";
import { db } from "@/lib/db";
import { resolveDemoMerchant } from "@/lib/services/merchant";

export type SessionIntentResponse = {
  query: string;
  category: string | null;
  maxPricePaise: number | null;
  maxBudgetInr: number | null;
  features: string[];
  keywords: string[];
  useCase: string | null;
  maxDiscountPct: number | null;
  displayNeed: string;
};

function intentToResponse(intent: StructuredIntent): SessionIntentResponse {
  return {
    query: intent.query,
    category: intent.category,
    maxPricePaise: intent.constraints.maxPricePaise,
    maxBudgetInr: intentMaxBudgetInr(intent),
    features: intent.preferences.features,
    keywords: intent.preferences.keywords,
    useCase: intent.useCase,
    maxDiscountPct: intent.constraints.maxDiscountPct,
    displayNeed: intentDisplayNeed(intent),
  };
}

async function recordIntentExtractionAudit(
  sessionId: string,
  extraction: Awaited<ReturnType<typeof extractIntent>>,
) {
  if (extraction.source === "gemini") {
    await recordAuditEvent(sessionId, "INTENT_GEMINI_SUCCEEDED", "agent", {
      provider: "gemini",
      model: extraction.model ?? null,
    });
  } else if (extraction.fallbackReason === "gemini_not_configured") {
    await recordAuditEvent(sessionId, "INTENT_DETERMINISTIC_FALLBACK", "agent", {
      provider: "deterministic-fallback",
      reason: extraction.fallbackReason,
    });
  } else {
    await recordAuditEvent(sessionId, "INTENT_GEMINI_FAILED", "agent", {
      provider: "gemini",
      reason: extraction.fallbackReason ?? "gemini_unavailable",
    });
    await recordAuditEvent(sessionId, "INTENT_DETERMINISTIC_FALLBACK", "agent", {
      provider: "deterministic-fallback",
      reason: extraction.fallbackReason ?? "gemini_unavailable",
    });
  }

  await recordAuditEvent(sessionId, "INTENT_PARSED", "agent", {
    structuredIntent: extraction.intent,
    provider: extraction.source,
    model: extraction.model ?? null,
    fallbackReason: extraction.fallbackReason ?? null,
  });
}

export async function createBuyerSession(rawRequest: string, merchantId?: string) {
  const merchant = merchantId ? await db.merchant.findUniqueOrThrow({ where: { id: merchantId } }) : await resolveDemoMerchant();
  const extraction = await extractIntent(rawRequest);
  const intent = extraction.intent;

  const session = await db.buyerSession.create({
    data: {
      merchantId: merchant.id,
      rawRequest: intent.query,
      status: "INTENT_PARSED",
      intent: {
        create: {
          structuredIntent: structuredIntentToJson(intent),
        },
      },
    },
    include: { intent: true },
  });

  await recordAuditEvent(session.id, "SESSION_CREATED", "system", {
    merchantId: merchant.id,
    rawRequest: intent.query,
  });

  await recordIntentExtractionAudit(session.id, extraction);

  return {
    sessionId: session.id,
    intent: intentToResponse(intent),
  };
}

export async function getSessionWithIntent(sessionId: string) {
  return db.buyerSession.findUnique({
    where: { id: sessionId },
    include: { intent: true, merchant: true },
  });
}

export function loadStructuredIntentFromSession(session: {
  intent: { structuredIntent: import("@prisma/client").Prisma.JsonValue } | null;
}): StructuredIntent {
  if (!session.intent) {
    throw new Error("Session intent not found");
  }
  return structuredIntentFromDb(session.intent.structuredIntent);
}
