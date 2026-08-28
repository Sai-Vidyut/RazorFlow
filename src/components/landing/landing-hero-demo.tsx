import Image from "next/image";
import { ChatCircle, ShieldCheck, Sparkle, TrendUp } from "@phosphor-icons/react/dist/ssr";
import { Money } from "@/components/money";
import { StatusChip } from "@/components/status-chip";
import type { LandingShowcase } from "@/lib/services/desk-context";

type LandingHeroDemoProps = {
  showcase: LandingShowcase;
};

export function LandingHeroDemo({ showcase }: LandingHeroDemoProps) {
  const featured = showcase.featured;

  if (!featured) {
    return (
      <div className="rf-agent-preview">
        <div className="rf-agent-preview-toolbar">
          <p className="text-sm font-medium">Agent decision</p>
        </div>
        <div className="rf-agent-preview-body p-6">
          <p className="text-sm text-muted">
            Add active catalog products to preview a live agent recommendation here.
          </p>
        </div>
      </div>
    );
  }

  const sampleBudget = Math.ceil(featured.price * 1.1);

  return (
    <div className="rf-agent-preview" aria-labelledby="landing-demo-heading">
      <div className="rf-agent-preview-toolbar">
        <div>
          <h2 id="landing-demo-heading" className="text-sm font-medium text-ink">
            Agent decision
          </h2>
          <p className="text-xs text-muted" translate="no">
            Live · {showcase.merchant.name}
          </p>
        </div>
        <StatusChip label="Recommended" tone="success" live />
      </div>

      <div className="rf-agent-preview-body">
        <div className="rf-agent-preview-step">
          <p className="flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-wider text-muted">
            <ChatCircle className="size-3.5" aria-hidden />
            Buyer request
          </p>
          <p className="mt-2 text-[15px] leading-relaxed text-ink-soft">
            {featured.blurb} Budget around <Money value={sampleBudget} />.
          </p>
        </div>

        <div className="rf-agent-preview-step">
          <p className="flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-wider text-muted">
            <Sparkle className="size-3.5" aria-hidden />
            Recommendation
          </p>
          <div className="mt-3 flex gap-4">
            <Image
              src={featured.image}
              alt={featured.imageAlt}
              width={112}
              height={112}
              className="size-28 shrink-0 rounded-[8px] bg-canvas-2 object-cover"
              priority
            />
            <div className="min-w-0 flex-1">
              <p className="text-lg font-semibold tracking-tight" translate="no">
                {featured.name}
              </p>
              <p className="mt-1 font-mono text-2xl font-semibold tabular-nums">
                <Money value={featured.price} />
              </p>
              <p className="mt-2 text-sm leading-relaxed text-ink-soft">
                Matches buyer need and stays inside the stated budget.
              </p>
            </div>
          </div>
        </div>

        <div className="mt-1 grid gap-3 sm:grid-cols-2">
          <div className="flex items-start gap-2">
            <ShieldCheck className="mt-0.5 size-4 shrink-0 text-success" aria-hidden />
            <div>
              <p className="text-[10px] uppercase tracking-wider text-muted">Policy</p>
              <p className="text-sm font-medium text-success">Allowed</p>
            </div>
          </div>
          {featured.attachName && featured.attachPrice != null ? (
            <div className="flex items-start gap-2">
              <TrendUp className="mt-0.5 size-4 shrink-0 text-accent" aria-hidden />
              <div>
                <p className="text-[10px] uppercase tracking-wider text-muted">Attach</p>
                <p className="text-sm font-medium text-accent">
                  <Money value={featured.attachPrice} delta /> {featured.attachName}
                </p>
              </div>
            </div>
          ) : null}
        </div>
      </div>

      <p className="border-t border-line px-4 py-2.5 text-[11px] text-muted">
        Live catalog and guardrails. No fabricated inventory.
      </p>
    </div>
  );
}
