import type { BuyerCapability } from "@/lib/services/buyer-identity";
import { buildDemoPrompts, pickPrimaryCatalogProduct, type DemoPrompt } from "@/lib/agent/demo-prompts";
import { buildPolicyCopy, type PolicyCopyItem } from "@/lib/policy/copy";
import { getActiveCatalog } from "@/lib/services/catalog";
import { getMerchantPoliciesForAgent } from "@/lib/services/policies";
import { resolveDemoMerchant } from "@/lib/services/merchant";

export type DeskContext = {
  merchant: {
    id: string;
    name: string;
  };
  demoPrompts: DemoPrompt[];
  intentPlaceholder: string;
  auth: {
    sessionId: string | null;
    email: string | null;
    emailVerified: boolean;
    capability: BuyerCapability;
  };
};

export async function getDeskContext(options?: {
  sessionId?: string | null;
  capability?: BuyerCapability;
  email?: string | null;
  emailVerified?: boolean;
}): Promise<DeskContext> {
  const merchant = await resolveDemoMerchant();
  const [catalog, agentPolicies] = await Promise.all([
    getActiveCatalog(merchant.id),
    getMerchantPoliciesForAgent(merchant.id),
  ]);

  const primary = pickPrimaryCatalogProduct(catalog);
  const sampleBudget = primary ? Math.ceil(primary.price * 1.1) : 5000;
  const categoryHint = primary?.category ?? "products";

  return {
    merchant: {
      id: merchant.id,
      name: merchant.name,
    },
    demoPrompts: buildDemoPrompts(catalog, { maxDiscountPct: agentPolicies.maxDiscountPct }),
    intentPlaceholder: `Describe what you need, your budget, and any discount request. Example: ${categoryHint} under ₹${sampleBudget.toLocaleString("en-IN")}…`,
    auth: {
      sessionId: options?.sessionId ?? null,
      email: options?.email ?? null,
      emailVerified: options?.emailVerified ?? false,
      capability: options?.capability ?? "anonymous",
    },
  };
}

export type LandingShowcase = {
  merchant: {
    id: string;
    name: string;
  };
  featured: {
    name: string;
    blurb: string;
    price: number;
    image: string;
    imageAlt: string;
    attachName: string | null;
    attachPrice: number | null;
  } | null;
  policyCopy: PolicyCopyItem[];
  guardrailSummary: string;
};

export async function getLandingShowcase(): Promise<LandingShowcase> {
  const merchant = await resolveDemoMerchant();
  const [catalog, policyRow] = await Promise.all([
    getActiveCatalog(merchant.id),
    getMerchantPoliciesForAgent(merchant.id),
  ]);

  const policies = policyRow;
  const policyCopy = buildPolicyCopy(policies);

  const primary = pickPrimaryCatalogProduct(catalog) ?? null;
  const attach =
    primary?.attachSku != null
      ? (catalog.find((product) => product.sku === primary.attachSku) ?? null)
      : null;

  return {
    merchant: {
      id: merchant.id,
      name: merchant.name,
    },
    featured: primary
      ? {
          name: primary.name,
          blurb: primary.blurb,
          price: primary.price,
          image: primary.image,
          imageAlt: primary.imageAlt,
          attachName: attach?.name ?? null,
          attachPrice: attach?.price ?? null,
        }
      : null,
    policyCopy,
    guardrailSummary: `The agent can recommend and bundle. It cannot break your discount ceiling (${policies.maxDiscountPct}%), margin floor (${policies.minMarginPct}%), or budget fit rules.`,
  };
}
