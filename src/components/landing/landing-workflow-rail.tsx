const STAGES = [
  { step: "01", title: "Understand", body: "Parse buyer intent, budget, and constraints before any SKU is shown." },
  { step: "02", title: "Decide", body: "Rank catalog, bundle attach offers, and apply merchant guardrails." },
  { step: "03", title: "Govern", body: "Policy engine blocks checkout when economics or rules fail." },
  { step: "04", title: "Transact", body: "Authorize on Razorpay with verified capture and audit trail." },
  { step: "05", title: "Recover", body: "Re-evaluate failed payments before a governed retry." },
] as const;

export function LandingWorkflowRail() {
  return (
    <div className="rf-workflow-rail">
      {STAGES.map((stage) => (
        <article key={stage.step} className="rf-workflow-stage">
          <p className="rf-workflow-stage-num">{stage.step}</p>
          <h3 className="rf-workflow-stage-title">{stage.title}</h3>
          <p className="rf-workflow-stage-body">{stage.body}</p>
        </article>
      ))}
    </div>
  );
}
