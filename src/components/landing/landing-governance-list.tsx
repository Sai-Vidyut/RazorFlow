import type { PolicyCopyItem } from "@/lib/policy/copy";

type LandingGovernanceListProps = {
  items: PolicyCopyItem[];
};

export function LandingGovernanceList({ items }: LandingGovernanceListProps) {
  return (
    <dl className="rf-guardrail-list">
      {items.map((item) => (
        <div key={item.id} className="rf-guardrail-row">
          <dt>{item.title}</dt>
          <dd>{item.rule}</dd>
        </div>
      ))}
    </dl>
  );
}
