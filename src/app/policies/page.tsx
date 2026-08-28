import type { Metadata } from "next";
import { PoliciesForm } from "@/components/policies-form";
import { SiteHeader } from "@/components/site-header";
import { resolveDemoMerchant } from "@/lib/services/merchant";

export const metadata: Metadata = {
  title: "Policies",
};

export default async function PoliciesPage() {
  const merchant = await resolveDemoMerchant();

  return (
    <>
      <SiteHeader />
      <main id="content" className="rf-governance-page">
        <header className="rf-governance-header">
          <p className="rf-vp-kicker">Commerce guardrails</p>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight">Merchant guardrails</h1>
          <p className="mt-2 max-w-[52ch] text-sm leading-relaxed text-ink-soft">
            Rules the agent is operationally bound by on the{" "}
            <span translate="no">{merchant.name}</span> desk. Recommendations and attach offers stay
            inside these limits.
          </p>
        </header>
        <PoliciesForm />
      </main>
    </>
  );
}
