"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { AgentResult } from "@/lib/agent";
import { AGENT_PROCESSING_STEPS } from "@/components/desk/agent-processing-steps";

const STEP_MS = 400;
const MIN_PRESENTATION_MS = 1300;
const RESOLVE_MS = 380;

type UseAgentProcessingPresentationOptions = {
  reducedMotion: boolean | null;
  onReveal: (result: AgentResult) => void;
};

export function useAgentProcessingPresentation({
  reducedMotion,
  onReveal,
}: UseAgentProcessingPresentationOptions) {
  const [isPresenting, setIsPresenting] = useState(false);
  const [completedCount, setCompletedCount] = useState(0);
  const [pendingResult, setPendingResult] = useState<AgentResult | null>(null);
  const startedAtRef = useRef(0);
  const onRevealRef = useRef(onReveal);

  onRevealRef.current = onReveal;

  const stepMs = reducedMotion ? 0 : STEP_MS;
  const minPresentationMs = reducedMotion ? 0 : MIN_PRESENTATION_MS;
  const resolveMs = reducedMotion ? 0 : RESOLVE_MS;
  const totalSteps = AGENT_PROCESSING_STEPS.length;

  const reset = useCallback(() => {
    setIsPresenting(false);
    setCompletedCount(0);
    setPendingResult(null);
    startedAtRef.current = 0;
  }, []);

  const start = useCallback(() => {
    setPendingResult(null);
    startedAtRef.current = Date.now();
    setCompletedCount(0);
    setIsPresenting(true);
  }, []);

  const complete = useCallback((result: AgentResult) => {
    setPendingResult(result);
  }, []);

  const cancel = useCallback(() => {
    reset();
  }, [reset]);

  useEffect(() => {
    if (!isPresenting || reducedMotion) return;
    if (completedCount >= totalSteps) return;

    const timer = window.setTimeout(() => {
      setCompletedCount((current) => {
        const next = current + 1;
        if (next >= totalSteps && !pendingResult) {
          return totalSteps - 1;
        }
        return Math.min(next, totalSteps);
      });
    }, stepMs);

    return () => window.clearTimeout(timer);
  }, [isPresenting, completedCount, pendingResult, stepMs, totalSteps, reducedMotion]);

  useEffect(() => {
    if (!isPresenting || !pendingResult) return;

    if (reducedMotion) {
      onRevealRef.current(pendingResult);
      reset();
      return;
    }

    if (completedCount < totalSteps) return;

    const elapsed = Date.now() - startedAtRef.current;
    const minWait = Math.max(0, minPresentationMs - elapsed);

    let resolveTimer: number | undefined;

    const revealTimer = window.setTimeout(() => {
      resolveTimer = window.setTimeout(() => {
        onRevealRef.current(pendingResult);
        reset();
      }, resolveMs);
    }, minWait);

    return () => {
      window.clearTimeout(revealTimer);
      if (resolveTimer !== undefined) {
        window.clearTimeout(resolveTimer);
      }
    };
  }, [
    isPresenting,
    pendingResult,
    completedCount,
    minPresentationMs,
    resolveMs,
    totalSteps,
    reducedMotion,
    reset,
  ]);

  return {
    isPresenting,
    completedCount,
    start,
    complete,
    cancel,
  };
}
