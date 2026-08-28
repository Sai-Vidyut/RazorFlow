import { LandingPageContent } from "@/components/landing/landing-page-content";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { getLandingShowcase } from "@/lib/services/desk-context";
import { getLandingMetrics } from "@/lib/services/ledger";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const [metrics, showcase] = await Promise.all([getLandingMetrics(), getLandingShowcase()]);
  const policyBlockLabel =
    metrics.policyEvaluated > 0
      ? `${metrics.policyBlocks} of ${metrics.policyEvaluated}`
      : metrics.policyBlocks > 0
        ? String(metrics.policyBlocks)
        : "0";

  return (
    <>
      <SiteHeader />
      <LandingPageContent
        showcase={showcase}
        metrics={metrics}
        policyBlockLabel={policyBlockLabel}
      />
      <SiteFooter merchantName={showcase.merchant.name} />
    </>
  );
}
