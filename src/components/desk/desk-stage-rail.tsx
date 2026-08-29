"use client";

import type { Phase } from "@/components/desk/desk-types";

type DeskStageRailProps = {
  phase: Phase;
  hasResult: boolean;
};

const STAGES = [
  { n: "01", label: "Understand" },
  { n: "02", label: "Decide" },
  { n: "03", label: "Govern" },
  { n: "04", label: "Transact" },
  { n: "05", label: "Recover" },
] as const;

const DESKTOP_STAGES = [
  { n: "01", label: "Understand" },
  { n: "02", label: "Decide" },
  { n: "03", label: "Transact" },
] as const;

function activeStage(phase: Phase, hasResult: boolean): number {
  if (phase === "failed") return 5;
  if (phase === "captured") return 5;
  if (phase === "processing") return 4;
  if (hasResult && phase !== "reading" && phase !== "matching" && phase !== "checking" && phase !== "idle") {
    if (phase === "blocked" || phase === "empty") return 3;
    if (phase === "ready") return 4;
    return 2;
  }
  if (phase === "reading" || phase === "matching" || phase === "checking") return 1;
  return 1;
}

function desktopActiveStage(phase: Phase, hasResult: boolean): number {
  if (phase === "processing" || phase === "captured" || phase === "failed") return 3;
  if (hasResult && phase !== "reading" && phase !== "matching" && phase !== "checking" && phase !== "idle") {
    return 2;
  }
  if (phase === "reading" || phase === "matching" || phase === "checking") return 1;
  return 1;
}

export function DeskStageRail({ phase, hasResult }: DeskStageRailProps) {
  const mobileCurrent = activeStage(phase, hasResult);
  const desktopCurrent = desktopActiveStage(phase, hasResult);

  return (
    <>
      <div className="rf-desk-stages-mobile lg:hidden" aria-label="Commerce workflow stages">
        {STAGES.map((stage, index) => {
          const step = index + 1;
          const isActive = mobileCurrent === step;
          const isComplete = mobileCurrent > step;
          return (
            <div
              key={stage.n}
              className="rf-desk-stages-mobile-step"
              data-active={isActive ? "true" : "false"}
              data-complete={isComplete ? "true" : "false"}
              aria-current={isActive ? "step" : undefined}
            >
              <span>{stage.n}</span>
              {stage.label}
            </div>
          );
        })}
      </div>

      <div className="rf-desk-stages hidden lg:contents" aria-label="Commerce workflow stages">
        {DESKTOP_STAGES.map((stage, index) => {
          const step = index + 1;
          const isActive = desktopCurrent === step;
          const isComplete = desktopCurrent > step;
          return (
            <div
              key={stage.n}
              className="rf-desk-stage-label"
              data-active={isActive ? "true" : "false"}
              data-complete={isComplete ? "true" : "false"}
            >
              <span>{stage.n}</span>
              {stage.label}
            </div>
          );
        })}
      </div>
    </>
  );
}
