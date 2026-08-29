import Link from "next/link";
import { Money } from "@/components/money";
import { LandingGovernanceList } from "@/components/landing/landing-governance-list";
import { LandingHeroDemo } from "@/components/landing/landing-hero-demo";
import { LandingWorkflowRail } from "@/components/landing/landing-workflow-rail";
import type { LandingShowcase } from "@/lib/services/desk-context";

type LandingMetrics = {
  weekGmv: number;
  attachRevenue: number;
  policyBlocks: number;
  policyEvaluated: number;
};

type LandingPageContentProps = {
  showcase: LandingShowcase;
  metrics: LandingMetrics;
  policyBlockLabel: string;
};

export function LandingPageContent({
  showcase,
  metrics,
  policyBlockLabel,
}: LandingPageContentProps) {
  return (
    <main id="content" className="rf-landing bg-canvas">
      <section className="rf-vp-hero" aria-labelledby="hero-heading">
        <div className="rf-vp-hero-inner">
          <div className="rf-vp-hero-copy">
            <p className="rf-vp-kicker">Merchant operating system</p>
            <p className="rf-vp-eyebrow" translate="no">
              {showcase.merchant.name}
            </p>
            <h1 id="hero-heading" className="rf-vp-headline">
              Turn buyer intent into a governed sale.
            </h1>
            <p className="rf-vp-lede">
              RazorFlow recommends from your catalog, enforces policy, collects on Razorpay, and
              recovers failed payments without breaking the basket.
            </p>
            <div className="rf-vp-actions">
              <Link href="/desk" className="rf-btn rf-btn-primary rf-motion-colors inline-flex min-h-11 items-center rounded-[8px] px-5 text-sm font-medium text-white">
                Open the desk
              </Link>
              <a href="#guardrails-heading" className="rf-motion-colors text-sm font-medium text-ink-soft hover:text-ink">
                View guardrails
              </a>
            </div>
          </div>
          <div className="rf-vp-hero-preview">
            <LandingHeroDemo showcase={showcase} />
          </div>
        </div>
      </section>

      <section className="rf-land-section" aria-labelledby="workflow-heading">
        <div className="rf-land-section-inner">
          <h2 id="workflow-heading" className="rf-land-section-title">
            The governed commerce lifecycle
          </h2>
          <p className="rf-land-section-lede">
            Every sale moves through the same operational stages. Each transition is audited and
            visible in the merchant control plane.
          </p>
          <LandingWorkflowRail />
        </div>
      </section>

      <section className="rf-land-section bg-canvas-2/40" aria-labelledby="guardrails-heading">
        <div className="rf-land-section-inner">
          <h2 id="guardrails-heading" className="rf-land-section-title">
            Guardrails sit in front of payment
          </h2>
          <p className="rf-land-section-lede">{showcase.guardrailSummary}</p>
          <LandingGovernanceList items={showcase.policyCopy} />
        </div>
      </section>

      <section className="rf-land-section" aria-labelledby="metrics-heading">
        <div className="rf-land-section-inner">
          <h2 id="metrics-heading" className="rf-land-section-title">
            Verified commerce signals
          </h2>
          <p className="rf-land-section-lede">
            Real metrics from captured payments and policy evaluations. Zero when your store has not
            processed activity yet.
          </p>
          <div className="rf-metrics-band">
            <figure className="rf-metrics-band-cell rf-metrics-band-cell-primary">
              <figcaption className="rf-metrics-band-label">GMV this week</figcaption>
              <p className="rf-metrics-band-value">
                <Money value={metrics.weekGmv} />
              </p>
              <p className="rf-metrics-band-hint">Verified Razorpay captures only</p>
            </figure>
            <figure className="rf-metrics-band-cell">
              <figcaption className="rf-metrics-band-label">Attach revenue</figcaption>
              <p className="rf-metrics-band-value text-accent">
                <Money value={metrics.attachRevenue} delta />
              </p>
            </figure>
            <figure className="rf-metrics-band-cell">
              <figcaption className="rf-metrics-band-label">Policy blocks</figcaption>
              <p className="rf-metrics-band-value">{policyBlockLabel}</p>
            </figure>
            <figure className="rf-metrics-band-cell">
              <figcaption className="rf-metrics-band-label">Evaluations</figcaption>
              <p className="rf-metrics-band-value">{metrics.policyEvaluated || "0"}</p>
            </figure>
          </div>
        </div>
      </section>

      <section className="rf-land-cta">
        <div className="rf-land-cta-inner">
          <div>
            <h2 className="text-lg font-semibold tracking-tight">Run a governed sale on the desk</h2>
            <p className="mt-1.5 max-w-[42ch] text-sm text-muted">
              Start with buyer intent. The agent handles recommendation, policy, Razorpay checkout,
              and recovery.
            </p>
          </div>
          <Link href="/desk" className="rf-btn rf-btn-primary inline-flex min-h-11 shrink-0 items-center rounded-[8px] px-5 text-sm font-medium text-white">
            Start on the desk
          </Link>
        </div>
      </section>
    </main>
  );
}
