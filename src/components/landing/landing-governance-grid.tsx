import {
  Percent,
  ShieldCheck,
  TrendUp,
} from "@phosphor-icons/react/dist/ssr";
import { Money } from "@/components/money";
import type { PolicyCopyItem } from "@/lib/policy/copy";

type LandingGovernanceGridProps = {
  items: PolicyCopyItem[];
};

const ICONS = [ShieldCheck, Percent, TrendUp, ShieldCheck] as const;

export function LandingGovernanceGrid({ items }: LandingGovernanceGridProps) {
  return (
    <div className="rf-landing-governance-grid">
      {items.map((item, index) => {
        const Icon = ICONS[index % ICONS.length];
        return (
          <article key={item.id} className="rf-landing-governance-card">
            <h3 className="flex items-start gap-2.5 text-sm font-medium text-ink">
              <span className="rf-landing-governance-icon" aria-hidden>
                <Icon className="size-4" weight="regular" />
              </span>
              {item.title}
            </h3>
            <p className="mt-2 pl-7 text-sm leading-relaxed text-ink-soft">{item.rule}</p>
          </article>
        );
      })}
    </div>
  );
}
