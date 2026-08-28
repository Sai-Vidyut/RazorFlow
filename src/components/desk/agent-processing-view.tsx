"use client";

import { Check } from "@phosphor-icons/react";
import { motion, useReducedMotion } from "motion/react";
import {
  AGENT_PROCESSING_STEPS,
  stepStateForIndex,
} from "@/components/desk/agent-processing-steps";

type AgentProcessingViewProps = {
  completedCount: number;
};

export function AgentProcessingView({ completedCount }: AgentProcessingViewProps) {
  const reduce = useReducedMotion();

  return (
    <div
      className="rf-desk-processing flex flex-1 flex-col justify-center py-2"
      aria-busy="true"
      aria-label="Agent processing"
    >
      <p className="mb-4 text-sm font-medium text-ink">Working through your request</p>
      <ol className="rf-desk-processing-list">
        {AGENT_PROCESSING_STEPS.map((step, index) => {
          const state = stepStateForIndex(index, completedCount);
          return (
            <li
              key={step.id}
              className="rf-desk-processing-step"
              data-state={state}
            >
              <span className="rf-desk-processing-num font-mono tabular">{step.num}</span>
              <span className="rf-desk-processing-label">{step.label}</span>
              <span className="rf-desk-processing-status" aria-hidden>
                {state === "complete" ? (
                  <motion.span
                    className="rf-desk-processing-check inline-flex"
                    initial={reduce ? false : { opacity: 0, scale: 0.88 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={
                      reduce
                        ? { duration: 0 }
                        : { duration: 0.2, ease: [0.33, 1, 0.68, 1] }
                    }
                  >
                    <Check className="size-3.5" weight="bold" />
                  </motion.span>
                ) : state === "active" ? (
                  <span className="rf-desk-processing-dot" />
                ) : (
                  <span className="rf-desk-processing-dot rf-desk-processing-dot--idle" />
                )}
              </span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
