const steps = [
  { n: "01", title: "Intent", body: "Capture what the buyer wants" },
  { n: "02", title: "Understand", body: "Extract budget, need, and constraints" },
  { n: "03", title: "Recommend", body: "Match catalog inside policy" },
  { n: "04", title: "Policy", body: "Apply merchant guardrails" },
  { n: "05", title: "Authorize", body: "Customer confirms the basket" },
  { n: "06", title: "Pay", body: "Razorpay captures the payment" },
  { n: "07", title: "Revenue", body: "Record attach, AOV, and audit" },
];

export function WorkflowRail() {
  return (
    <ol className="grid grid-cols-1 gap-6 md:grid-cols-7 md:gap-3">
      {steps.map((step) => {
        const featured = step.title === "Recommend";
        const inner = (
          <div className="relative pt-2">
            <p className="font-mono text-[11px] text-accent">{step.n}</p>
            <p className="mt-3 text-[15px] font-semibold text-ink">{step.title}</p>
            <p className="mt-1 max-w-[18ch] text-sm leading-snug text-muted">{step.body}</p>
          </div>
        );
        return (
          <li key={step.n} className="relative">
            <div className="mb-4 hidden h-px bg-line md:block" aria-hidden="true" />
            {featured ? (
              <div className="rf-primary-metric rounded-[12px] p-4">{inner}</div>
            ) : (
              inner
            )}
          </li>
        );
      })}
    </ol>
  );
}
