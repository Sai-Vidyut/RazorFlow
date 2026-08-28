"use client";

import { useCallback, useEffect, useState } from "react";
import type { MerchantPolicies } from "@/lib/policies";
import type { PolicyCopyItem } from "@/lib/policy/copy";
import { AdminFeedback, Input, LoadingState } from "@/components/admin/admin-ui";

export function PoliciesForm() {
  const [policies, setPolicies] = useState<MerchantPolicies | null>(null);
  const [policyCopy, setPolicyCopy] = useState<PolicyCopyItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    async function load() {
      try {
        const response = await fetch("/api/policies", { credentials: "include" });
        if (!response.ok) throw new Error("Could not load policies.");
        const payload = (await response.json()) as MerchantPolicies & {
          explanations?: PolicyCopyItem[];
        };
        setPolicies(payload);
        if (Array.isArray(payload.explanations)) {
          setPolicyCopy(payload.explanations);
        }
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : "Could not load policies.");
      } finally {
        setLoading(false);
      }
    }
    void load();
  }, []);

  const persist = useCallback(async (next: MerchantPolicies) => {
    setError(null);
    setSaved(false);
    try {
      const response = await fetch("/api/policies", {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(next),
      });
      if (!response.ok) throw new Error("Could not save policies.");
      const payload = (await response.json()) as MerchantPolicies & {
        explanations?: PolicyCopyItem[];
      };
      setPolicies(payload);
      if (Array.isArray(payload.explanations)) {
        setPolicyCopy(payload.explanations);
      }
      setSaved(true);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not save policies.");
    }
  }, []);

  function update<K extends keyof MerchantPolicies>(key: K, value: MerchantPolicies[K]) {
    if (!policies) return;
    const next = { ...policies, [key]: value };
    setPolicies(next);
    void persist(next);
  }

  if (loading) {
    return <LoadingState label="Loading merchant guardrails…" />;
  }

  if (!policies) {
    return (
      <AdminFeedback
        message={error ?? "Merchant guardrails could not be loaded."}
        variant="error"
      />
    );
  }

  return (
    <div className="rf-governance-controls">
      <dl className="rf-governance-summary" aria-label="Current guardrails">
        <div>
          <dt>Discount ceiling</dt>
          <dd>{policies.maxDiscountPct}%</dd>
        </div>
        <div>
          <dt>Margin floor</dt>
          <dd>{policies.minMarginPct}%</dd>
        </div>
        <div>
          <dt>Order cap</dt>
          <dd className="font-mono">₹{policies.maxOrderInr.toLocaleString("en-IN")}</dd>
        </div>
        <div>
          <dt>Status</dt>
          <dd className="text-success">{saved ? "Saved" : "Live on desk"}</dd>
        </div>
      </dl>

      <form aria-describedby="policy-note">
        <div className="rf-governance-field">
          <div>
            <label htmlFor="maxDiscount" className="text-sm font-medium text-ink">
              Discount ceiling
            </label>
            <p className="mt-1 text-sm text-muted">
              Percent off list. Offers above this are blocked before checkout.
            </p>
          </div>
          <Input
            id="maxDiscount"
            name="maxDiscount"
            type="number"
            inputMode="numeric"
            min={0}
            max={40}
            value={policies.maxDiscountPct}
            onChange={(event) => update("maxDiscountPct", Number(event.target.value))}
            className="font-mono tabular"
          />
        </div>

        <div className="rf-governance-field">
          <div>
            <label htmlFor="minMargin" className="text-sm font-medium text-ink">
              Margin floor
            </label>
            <p className="mt-1 text-sm text-muted">
              Baskets below this margin cannot be authorized.
            </p>
          </div>
          <Input
            id="minMargin"
            name="minMargin"
            type="number"
            inputMode="numeric"
            min={0}
            max={80}
            value={policies.minMarginPct}
            onChange={(event) => update("minMarginPct", Number(event.target.value))}
            className="font-mono tabular"
          />
        </div>

        <div className="rf-governance-field">
          <div>
            <label htmlFor="maxOrder" className="text-sm font-medium text-ink">
              Order cap
            </label>
            <p className="mt-1 text-sm text-muted">
              Maximum single-order value before checkout is blocked.
            </p>
          </div>
          <Input
            id="maxOrder"
            name="maxOrder"
            type="number"
            inputMode="numeric"
            min={1000}
            step={500}
            value={policies.maxOrderInr}
            onChange={(event) => update("maxOrderInr", Number(event.target.value))}
            className="font-mono tabular"
          />
        </div>

        <div className="rf-governance-field">
          <div>
            <p className="text-sm font-medium text-ink">Cross-sell and budget</p>
            <p className="mt-1 text-sm text-muted">
              What the agent may attach and require before recommending.
            </p>
          </div>
          <div className="space-y-3">
            <label className="flex min-h-10 items-center gap-3 text-sm">
              <input
                type="checkbox"
                name="allowCrossSell"
                checked={policies.allowCrossSell}
                onChange={(event) => update("allowCrossSell", event.target.checked)}
                className="size-4 accent-accent"
              />
              Allow evidenced cross-sell
            </label>
            <label className="flex min-h-10 items-center gap-3 text-sm">
              <input
                type="checkbox"
                name="requireBudgetFit"
                checked={policies.requireBudgetFit}
                onChange={(event) => update("requireBudgetFit", event.target.checked)}
                className="size-4 accent-accent"
              />
              Require budget fit
            </label>
          </div>
        </div>

        {error ? (
          <div className="pt-4">
            <AdminFeedback message={error} variant="error" />
          </div>
        ) : null}
      </form>

      <section className="rf-governance-effects" aria-labelledby="policy-effects">
        <h2 id="policy-effects" className="text-sm font-semibold tracking-tight">
          Policy effects
        </h2>
        <p className="mt-1 text-sm text-muted">
          Consequences when a recommendation violates these guardrails.
        </p>
        <dl className="mt-4 divide-y divide-line">
          {policyCopy.map((item) => (
            <div key={item.id} className="grid gap-1 py-3.5 md:grid-cols-[10rem_minmax(0,1fr)] md:gap-6">
              <dt className="text-sm font-medium text-ink">{item.title}</dt>
              <dd className="text-sm leading-relaxed text-ink-soft">{item.why}</dd>
            </div>
          ))}
        </dl>
      </section>

      <p id="policy-note" className="mt-6 text-sm text-muted">
        {saved
          ? "Saved. The desk loads these guardrails on every agent run."
          : "Changes save automatically and apply to the live desk."}
      </p>
    </div>
  );
}
