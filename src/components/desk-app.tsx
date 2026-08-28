"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import Image from "next/image";
import {
  CheckCircle,
  Clock,
  Lock,
  MagnifyingGlass,
  ShieldCheck,
  Wallet,
  Warning,
  XCircle,
  Sparkle,
} from "@phosphor-icons/react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { AccountAuthModal, type AccountAuthMode } from "@/components/auth/account-auth-modal";
import { AddToCartButton } from "@/components/cart/add-to-cart-button";
import {
  isSequentialBrowseMode,
  ProductRecommendationBrowser,
} from "@/components/desk/product-recommendation-browser";
import { AgentProcessingView } from "@/components/desk/agent-processing-view";
import { DeskStageRail } from "@/components/desk/desk-stage-rail";
import { useAgentProcessingPresentation } from "@/components/desk/use-agent-processing";
import type { Phase } from "@/components/desk/desk-types";
import { Money } from "@/components/money";
import { StatusChip } from "@/components/status-chip";
import { Button, Panel, Textarea } from "@/components/ui/design-system";
import { DeskShell } from "@/components/shell/desk-shell";
import { type AgentResult, type DiscoverySummary, type PolicyVerdict, type Product, type StructuredIntent, intentDisplayNeed, intentMaxBudgetInr } from "@/lib/agent";
import type { DemoPrompt } from "@/lib/agent/demo-prompts";
import { useCart } from "@/hooks/use-cart";
import { openRazorpayCheckout } from "@/lib/razorpay/checkout";

type AgentApiResponse = {
  sessionId: string;
  decisionId: string;
  status: AgentResult["status"];
  intent: StructuredIntent;
  primary: Product | null;
  attach: Product | null;
  results: Product[];
  discoverySummary: DiscoverySummary | null;
  discountPct: number;
  subtotal: number;
  marginPct: number;
  aovLift: number;
  explanations: AgentResult["explanations"];
  policies: AgentResult["policies"];
  blockedReason: string | null;
};

type RecoveryEvaluation = {
  status: "retryable" | "re_evaluate" | "blocked";
  reason: string;
  changes: string[];
  policyBlocked: boolean;
};

const phaseCopy: Record<Phase, string> = {
  idle: "Waiting for intent",
  reading: "Understanding intent…",
  matching: "Ranking catalog…",
  checking: "Checking merchant policy…",
  ready: "Awaiting authorization",
  blocked: "Offer blocked",
  empty: "No catalog match",
  processing: "Collecting payment…",
  captured: "Payment captured",
  failed: "Payment failed",
};

export function DeskApp() {
  const reduce = useReducedMotion();
  const [intent, setIntent] = useState("");
  const [merchantName, setMerchantName] = useState("Merchant");
  const [demoPrompts, setDemoPrompts] = useState<DemoPrompt[]>([]);
  const [intentPlaceholder, setIntentPlaceholder] = useState("Describe what you need, your budget, and any discount request…");
  const [contextReady, setContextReady] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [decisionId, setDecisionId] = useState<string | null>(null);
  const [orderId, setOrderId] = useState<string | null>(null);
  const [phase, setPhase] = useState<Phase>("idle");
  const [result, setResult] = useState<AgentResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [recovery, setRecovery] = useState<RecoveryEvaluation | null>(null);
  const [accountModalOpen, setAccountModalOpen] = useState(false);
  const [accountModalMode, setAccountModalMode] = useState<AccountAuthMode>("login");
  const [resumeAuthorizeAfterAuth, setResumeAuthorizeAfterAuth] = useState(false);
  const [pendingForceFail, setPendingForceFail] = useState(false);

  const { cart, refresh: refreshCart } = useCart(sessionId);

  const refreshAuthState = useCallback(() => {
    window.dispatchEvent(new Event("razorflow:auth-changed"));
  }, []);

  const handleAgentReveal = useCallback((agentResult: AgentResult) => {
    setResult(agentResult);
    setPhase(
      agentResult.status === "blocked"
        ? "blocked"
        : agentResult.status === "empty"
          ? "empty"
          : "ready",
    );
  }, []);

  const agentProcessing = useAgentProcessingPresentation({
    reducedMotion: reduce,
    onReveal: handleAgentReveal,
  });

  const agentBusy = agentProcessing.isPresenting;
  const busy = agentBusy || phase === "processing";

  useEffect(() => {
    async function loadContext() {
      try {
        const response = await fetch("/api/desk/context");
        if (!response.ok) return;
        const payload = (await response.json()) as {
          merchant: { name: string };
          demoPrompts: DemoPrompt[];
          intentPlaceholder: string;
        };
        setMerchantName(payload.merchant.name);
        setDemoPrompts(payload.demoPrompts);
        setIntentPlaceholder(payload.intentPlaceholder);
        if (payload.demoPrompts[0]?.text) {
          setIntent(payload.demoPrompts[0].text);
        }
      } finally {
        setContextReady(true);
      }
    }
    void loadContext();
  }, []);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setResult(null);
    setSessionId(null);
    setDecisionId(null);
    setOrderId(null);
    setRecovery(null);
    agentProcessing.start();
    setPhase("reading");
    try {
      const sessionRes = await fetch("/api/sessions", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rawRequest: intent }),
      });
      if (!sessionRes.ok) {
        const payload = (await sessionRes.json()) as { error?: string };
        throw new Error(payload.error ?? "Session could not be created.");
      }
      const { sessionId: createdSessionId } = (await sessionRes.json()) as { sessionId: string };

      const agentRes = await fetch("/api/agent/run", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId: createdSessionId }),
      });
      if (!agentRes.ok) {
        const payload = (await agentRes.json()) as { error?: string };
        throw new Error(payload.error ?? "Agent could not run.");
      }
      const payload = (await agentRes.json()) as AgentApiResponse;
      setSessionId(createdSessionId);
      setDecisionId(payload.decisionId);
      setOrderId(null);
      agentProcessing.complete(mapApiResponseToAgentResult(payload));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Agent run failed.");
      agentProcessing.cancel();
      setPhase("idle");
    }
  }

  async function startCheckout() {
    if (!sessionId) {
      throw new Error("Session is missing. Run the agent again.");
    }
    if (cart.itemCount === 0) {
      throw new Error("Add items to your cart before checkout.");
    }

    const response = await fetch("/api/checkout", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId, source: "cart" }),
    });

    const payload = (await response.json()) as {
      error?: string;
      code?: string;
      keyId?: string;
      orderId?: string;
      decisionId?: string;
      razorpayOrderId?: string;
      amountPaise?: number;
      currency?: string;
    };

    if (!response.ok) {
      if (response.status === 403 && payload.code === "VERIFICATION_REQUIRED") {
        const err = new Error(payload.error ?? "Email verification required");
        (err as Error & { code?: string }).code = "VERIFICATION_REQUIRED";
        throw err;
      }
      throw new Error(payload.error ?? "Checkout could not start.");
    }

    if (!payload.keyId || !payload.orderId || !payload.razorpayOrderId || !payload.amountPaise) {
      throw new Error("Checkout response was incomplete.");
    }

    setOrderId(payload.orderId);
    if (payload.decisionId) {
      setDecisionId(payload.decisionId);
    }
    return payload as {
      keyId: string;
      orderId: string;
      decisionId?: string;
      razorpayOrderId: string;
      amountPaise: number;
      currency: string;
    };
  }

  async function loadRecoveryEvaluation(activeDecisionId = decisionId): Promise<RecoveryEvaluation | null> {
    if (!sessionId || !activeDecisionId) return null;
    try {
      const response = await fetch("/api/recovery/evaluate", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId, decisionId: activeDecisionId }),
      });
      if (!response.ok) return null;
      const payload = (await response.json()) as { evaluation: RecoveryEvaluation };
      return payload.evaluation;
    } catch {
      return null;
    }
  }

  async function promptForCheckoutAuth(forceFail: boolean) {
    setPhase("ready");
    setResumeAuthorizeAfterAuth(true);
    setPendingForceFail(forceFail);

    try {
      const authRes = await fetch("/api/auth/session", { credentials: "include" });
      if (authRes.ok) {
        const auth = (await authRes.json()) as {
          authenticated?: boolean;
          emailVerified?: boolean;
          account?: { emailVerified?: boolean };
        };
        const verified = auth.emailVerified || auth.account?.emailVerified;
        if (auth.authenticated && verified) {
          await authorize(forceFail, true);
          return;
        }
        if (auth.authenticated && !verified) {
          setAccountModalMode("verify-code");
          setAccountModalOpen(true);
          return;
        }
      }
    } catch {
      // Fall through to login prompt.
    }

    setAccountModalMode("login");
    setAccountModalOpen(true);
  }

  async function authorize(forceFail = false, skipVerificationPrompt = false) {
    if (!result || result.status !== "ready" || cart.itemCount === 0) return;
    setPhase("processing");
    setError(null);

    try {
      const checkout = await startCheckout();

      if (forceFail) {
        const failRes = await fetch("/api/payments/fail", {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            orderId: checkout.orderId,
            reason: "Razorpay declined the payment. The basket is unchanged. Retry or pick another method.",
          }),
        });
        if (!failRes.ok) {
          const payload = (await failRes.json()) as { error?: string };
          throw new Error(payload.error ?? "Could not record payment failure.");
        }
        setPhase("failed");
        setError("Razorpay declined the payment. The basket is unchanged. Retry or pick another method.");
        const evaluation = await loadRecoveryEvaluation(checkout.decisionId);
        setRecovery(evaluation);
        return;
      }

      const razorpay = await openRazorpayCheckout({
        key: checkout.keyId,
        amount: checkout.amountPaise,
        currency: checkout.currency,
        name: merchantName,
        description: cart.lines.map((line) => line.name).join(", ") || "RazorFlow purchase",
        order_id: checkout.razorpayOrderId,
        theme: { color: "#0f766e" },
        handler: async (paymentResponse) => {
          try {
            const verifyRes = await fetch("/api/payments/verify", {
              method: "POST",
              credentials: "include",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                orderId: checkout.orderId,
                razorpay_order_id: paymentResponse.razorpay_order_id,
                razorpay_payment_id: paymentResponse.razorpay_payment_id,
                razorpay_signature: paymentResponse.razorpay_signature,
              }),
            });
            if (!verifyRes.ok) {
              const payload = (await verifyRes.json()) as { error?: string };
              throw new Error(payload.error ?? "Payment verification failed.");
            }
            setPhase("captured");
            setRecovery(null);
          } catch (cause) {
            setPhase("failed");
            setError(cause instanceof Error ? cause.message : "Payment verification failed.");
            const evaluation = await loadRecoveryEvaluation(checkout.decisionId);
            setRecovery(evaluation);
          }
        },
        modal: {
          ondismiss: () => {
            void (async () => {
              try {
                await fetch("/api/payments/abandon", {
                  method: "POST",
                  credentials: "include",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ orderId: checkout.orderId }),
                });
              } finally {
                setPhase("ready");
                setRecovery(null);
                setError("Checkout closed before payment completed.");
              }
            })();
          },
        },
      });

      razorpay.on("payment.failed", (response) => {
        void (async () => {
          const reason =
            response.error?.description ??
            "Razorpay declined the payment. The basket is unchanged. Retry or pick another method.";
          const failRes = await fetch("/api/payments/fail", {
            method: "POST",
            credentials: "include",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ orderId: checkout.orderId, reason }),
          });
          if (!failRes.ok) {
            const payload = (await failRes.json()) as { error?: string };
            setError(payload.error ?? "Could not record payment failure.");
          } else {
            setError(reason);
          }
          setPhase("failed");
          const evaluation = await loadRecoveryEvaluation(checkout.decisionId);
          setRecovery(evaluation);
        })();
      });
    } catch (cause) {
      if (
        !skipVerificationPrompt &&
        cause instanceof Error &&
        (cause as Error & { code?: string }).code === "VERIFICATION_REQUIRED"
      ) {
        await promptForCheckoutAuth(forceFail);
        return;
      }
      setPhase("failed");
      setError(cause instanceof Error ? cause.message : "Payment failed. Retry the capture.");
      const evaluation = await loadRecoveryEvaluation();
      setRecovery(evaluation);
    }
  }

  async function continueAfterAccountAuth() {
    const shouldResume = resumeAuthorizeAfterAuth;
    const forceFail = pendingForceFail;
    setResumeAuthorizeAfterAuth(false);
    setPendingForceFail(false);
    refreshAuthState();
    if (shouldResume) {
      await authorize(forceFail);
    }
  }

  return (
    <DeskShell
      merchantName={merchantName}
      sessionId={sessionId}
    >
      <DeskStageRail phase={phase} hasResult={result != null} />
      <div className="rf-desk-workspace">
        <div className="rf-desk-stage">
          <Panel title="Buyer intent" step="01" fill className="min-w-0">
            <form id="desk-intent-form" className="flex flex-1 flex-col gap-4" onSubmit={onSubmit}>
              <div>
                <label htmlFor="intent" className="text-sm font-medium text-ink">
                  Customer request
                </label>
                <Textarea
                  id="intent"
                  name="intent"
                  data-testid="intent-input"
                  value={intent}
                  onChange={(event) => setIntent(event.target.value)}
                  rows={3}
                  spellCheck={false}
                  autoComplete="off"
                  className="mt-1.5"
                  placeholder={intentPlaceholder}
                  disabled={!contextReady}
                />
              </div>

              <div>
                <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted">Quick prompts</p>
                <div className="flex flex-wrap gap-2">
                  {demoPrompts.map((prompt) => (
                    <button
                      key={prompt.id}
                      type="button"
                      data-testid={`demo-prompt-${prompt.id}`}
                      onClick={() => setIntent(prompt.text)}
                      className="min-h-9 rounded-[8px] border border-line/80 bg-canvas-2/50 px-3 text-sm text-ink-soft transition-colors hover:border-line hover:text-ink"
                    >
                      {prompt.label}
                    </button>
                  ))}
                </div>
              </div>

              <dl className="space-y-0 border-t border-line/60 pt-3 text-sm">
                <div className="rf-kv-row border-b border-line/40">
                  <dt className="flex items-center gap-2 text-ink-soft">
                    <Wallet className="size-3.5 text-accent" aria-hidden />
                    Budget
                  </dt>
                  <dd className="font-medium">
                    {result?.intent ? (
                      intentMaxBudgetInr(result.intent) != null ? (
                        <Money value={intentMaxBudgetInr(result.intent)!} />
                      ) : (
                        "Not stated"
                      )
                    ) : (
                      "—"
                    )}
                  </dd>
                </div>
                <div className="rf-kv-row border-b border-line/40">
                  <dt className="flex items-center gap-2 text-ink-soft">
                    <MagnifyingGlass className="size-3.5 text-accent" aria-hidden />
                    Need
                  </dt>
                  <dd className="font-medium">{result?.intent ? intentDisplayNeed(result.intent) : "—"}</dd>
                </div>
                <div className="rf-kv-row">
                  <dt className="flex items-center gap-2 text-ink-soft">
                    <Clock className="size-3.5 text-accent" aria-hidden />
                    Timeline
                  </dt>
                  <dd className="font-medium">{result?.intent ? "Immediate" : "—"}</dd>
                </div>
              </dl>

              {error && phase !== "failed" ? (
                <p className="text-sm text-danger" role="alert">
                  {error}
                </p>
              ) : null}

              <div className="mt-auto pt-1">
                <Button
                  type="submit"
                  data-testid="run-agent"
                  disabled={busy || intent.trim().length < 4}
                  className="w-full"
                >
                  {agentBusy ? "Running agent…" : "Run agent"}
                </Button>
              </div>
            </form>
          </Panel>
        </div>

        <div className="rf-desk-stage">
          <Panel
            title="Agent decision"
            step="02"
            variant="decision"
            fill
            className="min-w-0"
            action={
              result?.status === "ready" ? (
                <span className="rounded-full bg-accent-soft px-2 py-0.5 text-[11px] font-medium text-accent">
                  Offer ready
                </span>
              ) : null
            }
          >
            <div className="flex flex-1 flex-col" data-testid="recommendation">
              <div aria-live="polite" className="sr-only">
                {agentBusy ? "Agent processing" : phaseCopy[phase]}
              </div>
              <AnimatePresence mode="wait">
                {agentBusy ? (
                  <motion.div
                    key="agent-processing"
                    className="flex flex-1 flex-col"
                    initial={false}
                    animate={{ opacity: 1 }}
                    exit={reduce ? undefined : { opacity: 0 }}
                    transition={{ duration: reduce ? 0 : 0.22, ease: [0.33, 1, 0.68, 1] }}
                  >
                    <AgentProcessingView completedCount={agentProcessing.completedCount} />
                  </motion.div>
                ) : (
                  <motion.div
                    key={`agent-result-${result?.primary?.sku ?? "none"}-${phase}`}
                    className="flex flex-1 flex-col"
                    initial={reduce ? false : { opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={reduce ? undefined : { opacity: 0, y: -4 }}
                    transition={{ duration: reduce ? 0 : 0.38, ease: [0.33, 1, 0.68, 1] }}
                  >
                    {!result || phase === "idle" ? (
                      <EmptyDecision />
                    ) : result.status === "empty" || phase === "empty" ? (
                      <div className="rf-desk-empty-state">
                        <div className="rf-desk-empty-state-icon">
                          <Warning className="size-5" aria-hidden />
                        </div>
                        <p className="text-base font-medium text-ink">No catalog match</p>
                        <p className="max-w-[36ch] text-sm text-muted">
                          No product fits this request. Widen the budget or adjust the category.
                        </p>
                      </div>
                    ) : (
                      <DecisionBody
                        result={result}
                        sessionId={sessionId}
                        cartSkus={new Set(cart.lines.map((line) => line.sku))}
                        onCartChange={() => void refreshCart()}
                      />
                    )}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </Panel>
        </div>

        <div className="rf-desk-stage rf-desk-stage-transact">
          <Panel
            title="Transaction"
            step="03"
            variant="transact"
            fill
            className="min-w-0"
            data-testid="transaction-rail"
            action={
                <StatusChip
                  label={phaseCopy[phase]}
                  tone={
                    phase === "failed" || phase === "blocked"
                      ? "danger"
                      : phase === "captured"
                        ? "success"
                        : "warning"
                  }
                  live={busy}
                />
              }
            >
              <div className="flex flex-1 flex-col">
                <ul className="space-y-0 text-sm">
                  {(result?.policies.length ? result.policies : defaultChecks).map((item: PolicyVerdict) => (
                    <li key={item.id} className="rf-kv-row border-b border-line/40 last:border-0">
                      <span className="text-ink-soft">{item.label}</span>
                      <span
                        className={
                          item.detail === "Waiting"
                            ? "text-muted"
                            : item.result === "blocked"
                              ? "text-danger"
                              : "text-success"
                        }
                      >
                        {item.result === "blocked" ? "Blocked" : item.detail}
                      </span>
                    </li>
                  ))}
                </ul>

                <div className="mt-3 border-t border-line/60 pt-3" data-testid="policy-result">
                  <p className="flex items-start gap-2 text-sm">
                    {result?.status === "blocked" ? (
                      <Warning className="mt-0.5 size-4 shrink-0 text-danger" aria-hidden="true" />
                    ) : (
                      <ShieldCheck className="mt-0.5 size-4 shrink-0 text-success" aria-hidden="true" />
                    )}
                    <span className={result?.status === "blocked" ? "text-danger" : "text-success"}>
                      {result?.status === "blocked"
                        ? result.blockedReason
                        : result?.status === "ready"
                          ? "Allowed. All guardrails satisfied."
                          : "Policy has not run yet."}
                    </span>
                  </p>
                </div>

                <div className="mt-4 flex-1">
                  <p className="text-xs font-medium uppercase tracking-wide text-muted">Cart</p>
                  {cart.lines.length > 0 ? (
                    <ul className="mt-2 space-y-2 text-sm" data-testid="cart-summary">
                      {cart.lines.map((line) => (
                        <li key={line.id} className="flex items-start justify-between gap-3">
                          <span className="text-ink-soft">
                            {line.name}
                            {line.quantity > 1 ? ` × ${line.quantity}` : ""}
                          </span>
                          <span className="shrink-0 font-medium tabular">
                            <Money value={line.lineTotal} />
                          </span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="mt-2 text-sm text-muted" data-testid="cart-empty-hint">
                      No items yet. Add products from the agent results.
                    </p>
                  )}
                </div>

                <div className="mt-4 border-t border-line/60 pt-4">
                  <dl className="space-y-2 text-sm">
                    <div className="rf-kv-row py-0">
                      <dt className="text-muted">Subtotal</dt>
                      <dd className="font-medium tabular">
                        <Money value={cart.subtotal} />
                      </dd>
                    </div>
                    {result && result.discountPct > 0 ? (
                      <div className="rf-kv-row py-0">
                        <dt className="text-muted">Discount</dt>
                        <dd className="font-medium text-success tabular">−{result.discountPct}%</dd>
                      </div>
                    ) : null}
                  </dl>
                  <p className="mt-3 text-xs font-medium uppercase tracking-wide text-muted">Total</p>
                  <p className="mt-1 text-3xl font-semibold tracking-tight tabular" data-testid="checkout-total">
                    <Money value={cart.subtotal} />
                  </p>
                </div>

                <div className="rf-desk-transact-actions mt-auto pt-4">
                  <button
                    type="button"
                    data-testid="authorize"
                    disabled={result?.status !== "ready" || cart.itemCount === 0 || busy || phase === "captured"}
                    onClick={() => authorize(false)}
                    className="rf-btn rf-motion-colors flex min-h-11 w-full items-center justify-center rounded-[8px] bg-accent text-sm font-medium text-white hover:bg-accent-hover enabled:active:scale-[0.98] disabled:opacity-50"
                  >
                    {phase === "processing" ? (
                      "Collecting payment…"
                    ) : result?.status === "ready" && cart.itemCount > 0 ? (
                      <>
                        Authorize <Money value={cart.subtotal} />
                      </>
                    ) : (
                      "Authorize"
                    )}
                  </button>
                  <button
                    type="button"
                    data-testid="simulate-decline"
                    disabled={result?.status !== "ready" || cart.itemCount === 0 || busy}
                    onClick={() => authorize(true)}
                    className="mt-2 flex min-h-11 w-full items-center justify-center rounded-[8px] border border-line text-sm text-ink-soft hover:text-ink disabled:opacity-50"
                  >
                    Simulate decline
                  </button>
                  <p className="mt-3 flex items-center gap-2 text-xs text-muted">
                    <Lock className="size-3.5 shrink-0" aria-hidden="true" />
                    Razorpay Test Mode checkout. Capture is confirmed only after server verification.
                  </p>
                </div>
              </div>
            </Panel>
        </div>

        <AnimatePresence>
          {(phase === "captured" || phase === "failed") && result ? (
            <PaymentOverlay
              phase={phase}
              checkoutTotal={cart.subtotal}
              result={result}
              error={error}
              recovery={recovery}
              onRetry={() => authorize(false)}
              onReviewBasket={() => {
                setRecovery(null);
                setPhase("ready");
                setError("Basket needs a fresh agent check before payment can continue.");
              }}
              onClose={() => {
                setRecovery(null);
                setPhase(result.status === "ready" ? "ready" : phase === "failed" ? "ready" : "captured");
              }}
            />
          ) : null}
        </AnimatePresence>
      </div>
      <AccountAuthModal
        open={accountModalOpen}
        initialMode={accountModalMode}
        sessionId={sessionId}
        onClose={() => setAccountModalOpen(false)}
        onAuthenticated={() => void continueAfterAccountAuth()}
        onAuthStateChange={() => refreshAuthState()}
      />
    </DeskShell>
  );
}

function mapApiResponseToAgentResult(payload: AgentApiResponse): AgentResult {
  return {
    status: payload.status,
    intent: payload.intent,
    primary: payload.primary,
    attach: payload.attach,
    results: payload.results ?? (payload.primary ? [payload.primary] : []),
    discoverySummary: payload.discoverySummary ?? null,
    discountPct: payload.discountPct,
    subtotal: payload.subtotal,
    marginPct: payload.marginPct,
    aovLift: payload.aovLift,
    explanations: payload.explanations,
    policies: payload.policies,
    blockedReason: payload.blockedReason,
  };
}

const defaultChecks = [
  { id: "budget", label: "Budget fit", result: "allowed" as const, detail: "Waiting" },
  { id: "margin", label: "Margin floor", result: "allowed" as const, detail: "Waiting" },
  { id: "order-cap", label: "Order cap", result: "allowed" as const, detail: "Waiting" },
  { id: "attach", label: "Cross-sell rule", result: "allowed" as const, detail: "Waiting" },
];

function EmptyDecision() {
  return (
    <div className="rf-desk-empty-state">
      <div className="rf-desk-empty-state-icon">
        <Sparkle className="size-5" aria-hidden />
      </div>
      <p className="text-base font-medium text-ink">Run the agent to see a recommendation</p>
      <p className="max-w-[36ch] text-sm text-muted">
        The agent will rank your catalog, explain the choice, and surface attach offers with merchant guardrails applied.
      </p>
    </div>
  );
}

function DecisionBody({
  result,
  sessionId,
  cartSkus,
  onCartChange,
}: {
  result: AgentResult;
  sessionId: string | null;
  cartSkus: Set<string>;
  onCartChange?: () => void;
}) {
  if (!result.primary) return null;

  if (isSequentialBrowseMode(result)) {
    return (
      <ProductRecommendationBrowser
        result={result}
        sessionId={sessionId}
        cartSkus={cartSkus}
        onCartChange={onCartChange}
      />
    );
  }

  const inCart = cartSkus.has(result.primary.sku);

  return (
    <div>
      <article className="flex gap-4">
        <Image
          src={result.primary.image}
          alt={result.primary.imageAlt}
          width={120}
          height={120}
          className="size-24 rounded-[12px] bg-canvas-2 object-cover md:size-28"
        />
        <div className="min-w-0 flex-1">
          <h3 className="text-xl font-semibold tracking-tight" translate="no" data-testid="product-name">
            {result.primary.name}
          </h3>
          <p className="mt-1 text-sm text-muted">{result.primary.blurb}</p>
          <p className="mt-3 text-2xl font-semibold text-accent">
            <Money value={result.primary.price} />
          </p>
          <div className="mt-4">
            <AddToCartButton
              sessionId={sessionId}
              sku={result.primary.sku}
              inCart={inCart}
              onAdded={onCartChange}
            />
          </div>
        </div>
      </article>
      <blockquote className="mt-6 border-l-2 border-accent pl-4 text-[15px] leading-relaxed text-ink">
        {result.explanations[0]?.reason}
      </blockquote>
      <dl className="mt-6 grid grid-cols-2 gap-4 text-sm">
        <div>
          <dt className="text-muted">Primary price</dt>
          <dd className="mt-1 text-lg font-semibold">
            <Money value={result.primary.price} />
          </dd>
        </div>
        <div>
          <dt className="text-muted">Margin</dt>
          <dd className="mt-1 text-lg font-semibold">{result.marginPct.toFixed(1)}%</dd>
        </div>
      </dl>
      {result.attach ? (
        <div
          className="mt-6 flex flex-col gap-3 border-t border-line pt-5 sm:flex-row sm:items-center"
          data-testid="suggested-accessory"
        >
          <Image
            src={result.attach.image}
            alt={result.attach.imageAlt}
            width={56}
            height={56}
            className="size-14 rounded-[8px] bg-canvas-2 object-cover"
          />
          <div className="min-w-0 flex-1">
            <p className="text-xs font-medium uppercase tracking-wide text-muted">Suggested accessory</p>
            <p className="font-medium" translate="no">
              {result.attach.name}
            </p>
            <p className="text-sm text-muted">
              <Money value={result.attach.price} /> · attach rate{" "}
              {Math.round((result.primary.attachRate ?? 0) * 100)}%
            </p>
            <p className="mt-1 text-sm text-ink-soft">{result.explanations[1]?.reason}</p>
          </div>
          <AddToCartButton sessionId={sessionId} sku={result.attach.sku} inCart={cartSkus.has(result.attach.sku)} onAdded={onCartChange} />
        </div>
      ) : null}
    </div>
  );
}

function PaymentOverlay({
  phase,
  checkoutTotal,
  result,
  error,
  recovery,
  onRetry,
  onReviewBasket,
  onClose,
}: {
  phase: "captured" | "failed";
  checkoutTotal: number;
  result: AgentResult;
  error: string | null;
  recovery: RecoveryEvaluation | null;
  onRetry: () => void;
  onReviewBasket: () => void;
  onClose: () => void;
}) {
  const failureMessage =
    error ?? "Razorpay declined the payment. Your basket is unchanged.";

  const recoveryStatus = recovery?.status ?? "retryable";

  return (
    <motion.div
      className="rf-overlay"
      role="presentation"
      initial={false}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={onClose}
    >
      <div className="rf-overlay-backdrop" aria-hidden />
      <section
        role="dialog"
        aria-modal="true"
        className="rf-dialog"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start gap-3">
          {phase === "captured" ? (
            <CheckCircle className="size-6 shrink-0 text-accent" weight="fill" aria-hidden="true" />
          ) : (
            <XCircle className="size-6 shrink-0 text-danger" weight="fill" aria-hidden="true" />
          )}
          <div className="min-w-0 flex-1">
            <h2
              className="text-lg font-semibold tracking-tight"
              data-testid={phase === "captured" ? "payment-success" : "payment-failed"}
            >
              {phase === "captured" ? "Payment captured" : "Payment failed"}
            </h2>
            <p className="mt-3 text-3xl font-semibold tracking-tight tabular">
              <Money value={checkoutTotal} />
            </p>
            {phase === "captured" ? (
              <>
                <p className="mt-2 text-sm text-muted">Verified on the server via Razorpay.</p>
                <p className="mt-3">
                  <StatusChip label="Settling via Razorpay" tone="accent" />
                </p>
              </>
            ) : (
              <>
                <p className="mt-3 text-sm text-ink-soft" role="alert">
                  {failureMessage}
                </p>
                {recoveryStatus === "retryable" ? (
                  <>
                    <p className="mt-2 text-sm text-muted">Your basket is unchanged.</p>
                    <div className="mt-5 flex flex-col gap-2">
                      <Button type="button" data-testid="retry-payment" onClick={onRetry} className="w-full">
                        Retry payment
                      </Button>
                      <Button type="button" variant="secondary" onClick={onClose} className="w-full">
                        Close
                      </Button>
                    </div>
                  </>
                ) : recoveryStatus === "re_evaluate" ? (
                  <>
                    <p className="mt-2 text-sm text-muted">
                      {recovery?.changes.length
                        ? recovery.changes.join(". ")
                        : "One item changed availability, so we need to re-check your basket before retrying."}
                    </p>
                    <div className="mt-5 flex flex-col gap-2">
                      <Button
                        type="button"
                        data-testid="review-basket"
                        onClick={onReviewBasket}
                        className="w-full"
                      >
                        Review basket
                      </Button>
                      <Button type="button" variant="secondary" onClick={onClose} className="w-full">
                        Close
                      </Button>
                    </div>
                  </>
                ) : (
                  <>
                    <p className="mt-2 text-sm text-muted">
                      {recovery?.reason ??
                        "This basket no longer satisfies the merchant pricing policy."}
                    </p>
                    <p className="mt-2 text-sm font-medium text-danger">Recovery unavailable</p>
                    <div className="mt-5">
                      <Button type="button" variant="secondary" onClick={onClose} className="w-full">
                        Close
                      </Button>
                    </div>
                  </>
                )}
              </>
            )}
          </div>
          {phase === "captured" ? (
            <button
              type="button"
              onClick={onClose}
              className="min-h-9 shrink-0 rounded-[8px] px-2 text-sm text-muted hover:bg-canvas-2 hover:text-ink"
              aria-label="Close payment status"
            >
              Close
            </button>
          ) : null}
        </div>
      </section>
    </motion.div>
  );
}
