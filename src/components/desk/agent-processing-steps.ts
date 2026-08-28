export const AGENT_PROCESSING_STEPS = [
  { id: "parse", num: "01", label: "Parsing buyer request" },
  { id: "catalog", num: "02", label: "Checking catalog" },
  { id: "guardrails", num: "03", label: "Evaluating guardrails" },
  { id: "offer", num: "04", label: "Calculating best offer" },
  { id: "recommendation", num: "05", label: "Preparing recommendation" },
] as const;

export type AgentProcessingStepState = "pending" | "active" | "complete";

export function stepStateForIndex(
  index: number,
  completedCount: number,
): AgentProcessingStepState {
  if (index < completedCount) return "complete";
  if (index === completedCount && completedCount < AGENT_PROCESSING_STEPS.length) {
    return "active";
  }
  if (completedCount >= AGENT_PROCESSING_STEPS.length) return "complete";
  return "pending";
}
