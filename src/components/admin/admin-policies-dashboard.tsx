"use client";

import { useCallback, useEffect, useState } from "react";
import type { PoliciesFormValues } from "@/lib/policy/map";
import { buildPolicyCopy } from "@/lib/policy/copy";
import { formatInr } from "@/lib/format";
import {
  AdminFeedback,
  Input,
  LoadingState,
  PageHeader,
  SectionHeading,
  StatCell,
  StatStrip,
} from "@/components/admin/admin-ui";

export function AdminPoliciesDashboard() {
  const [policies, setPolicies] = useState<PoliciesFormValues | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    async function load() {
      try {
        const response = await fetch("/api/admin/policies", { credentials: "include" });
        if (!response.ok) throw new Error("Could not load policies.");
        const payload = (await response.json()) as { policies: PoliciesFormValues };
        setPolicies(payload.policies);
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : "Could not load policies.");
      } finally {
        setLoading(false);
      }
    }
    void load();
  }, []);

  const persist = useCallback(async (next: PoliciesFormValues) => {
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      const response = await fetch("/api/admin/policies", {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(next),
      });
      if (!response.ok) {
        const payload = (await response.json()) as { error?: string };
        throw new Error(payload.error ?? "Could not save policies.");
      }
      const payload = (await response.json()) as { policies: PoliciesFormValues };
      setPolicies(payload.policies);
      setSaved(true);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not save policies.");
    } finally {
      setSaving(false);
    }
  }, []);

  function update<K extends keyof PoliciesFormValues>(key: K, value: PoliciesFormValues[K]) {
    setPolicies((current) => {
      if (!current) return current;
      const next = { ...current, [key]: value };
      void persist(next);
      return next;
    });
  }

  if (loading) return <LoadingState label="Loading merchant guardrails…" />;
  if (!policies) {
    return <PageHeader title="Policies" description={error ?? "Policies unavailable."} />;
  }

  const explanations = buildPolicyCopy(policies);

  return (
    <div className="rf-admin-page">
      <PageHeader
        title="Policies"
        description={`Guardrails for ${policies.merchant}'s autonomous commerce agent. Financial authority stays on the server.`}
      />

      {saved ? (
        <AdminFeedback message="Policy saved. Future agent decisions will use the new limits." />
      ) : null}
      {error ? <AdminFeedback message={error} variant="error" /> : null}
      {saving ? <p className="text-sm text-muted" role="status">Saving policy…</p> : null}

      <section className="rf-admin-section" aria-labelledby="policy-current">
        <SectionHeading
          title="Current guardrails"
          description="Live values applied to the next agent run and checkout validation."
        />
        <StatStrip>
          <StatCell label="Discount ceiling" value={`${policies.maxDiscountPct}%`} />
          <StatCell label="Margin floor" value={`${policies.minMarginPct}%`} />
          <StatCell label="Order cap" value={formatInr(policies.maxOrderInr)} />
          <StatCell label="Min attach rate" value={`${policies.minAttachRatePct}%`} />
          <StatCell label="Cross-sell" value={policies.allowCrossSell ? "Enabled" : "Off"} />
          <StatCell label="Budget fit" value={policies.requireBudgetFit ? "Required" : "Optional"} />
        </StatStrip>
      </section>

      <section className="rf-admin-section" aria-labelledby="policy-config">
        <SectionHeading
          title="Edit guardrails"
          description="Changes save automatically. Checkout re-validates against current catalog and policy state."
        />

        <form className="divide-y divide-line/50" aria-describedby="admin-policy-note">
          <div className="rf-policy-row">
            <div>
              <label htmlFor="maxDiscountPct" className="text-sm font-medium text-ink">
                Discount ceiling (%)
              </label>
              <p className="mt-1 text-sm text-muted">Maximum percent off list price the agent may offer.</p>
            </div>
            <Input
              id="maxDiscountPct"
              type="number"
              min={0}
              max={100}
              value={policies.maxDiscountPct}
              onChange={(event) => update("maxDiscountPct", Number(event.target.value))}
              className="font-mono tabular-nums"
              disabled={saving}
            />
          </div>

          <div className="rf-policy-row">
            <div>
              <label htmlFor="minMarginPct" className="text-sm font-medium text-ink">
                Margin floor
              </label>
              <p className="mt-1 text-sm text-muted">Baskets below this margin cannot be authorized.</p>
            </div>
            <Input
              id="minMarginPct"
              type="number"
              min={0}
              max={100}
              value={policies.minMarginPct}
              onChange={(event) => update("minMarginPct", Number(event.target.value))}
              className="font-mono tabular-nums"
              disabled={saving}
            />
          </div>

          <div className="rf-policy-row">
            <div>
              <label htmlFor="maxOrderInr" className="text-sm font-medium text-ink">
                Order cap
              </label>
              <p className="mt-1 text-sm text-muted">Maximum single-order value before checkout is blocked.</p>
            </div>
            <Input
              id="maxOrderInr"
              type="number"
              min={1}
              value={policies.maxOrderInr}
              onChange={(event) => update("maxOrderInr", Number(event.target.value))}
              className="font-mono tabular-nums"
              disabled={saving}
            />
          </div>

          <div className="rf-policy-row">
            <div>
              <label htmlFor="minAttachRatePct" className="text-sm font-medium text-ink">
                Cross-sell evidence
              </label>
              <p className="mt-1 text-sm text-muted">Minimum attach rate required when cross-sell is enabled.</p>
            </div>
            <Input
              id="minAttachRatePct"
              type="number"
              min={0}
              max={100}
              value={policies.minAttachRatePct}
              onChange={(event) => update("minAttachRatePct", Number(event.target.value))}
              className="font-mono tabular-nums"
              disabled={saving}
            />
          </div>

          <div className="rf-policy-row">
            <div>
              <p className="text-sm font-medium text-ink">Cross-sell and budget</p>
              <p className="mt-1 text-sm text-muted">Toggle evidence-based cross-sell and budget-fit requirements.</p>
            </div>
            <div className="space-y-3">
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={policies.allowCrossSell}
                  onChange={(event) => update("allowCrossSell", event.target.checked)}
                  className="size-4 accent-accent"
                  disabled={saving}
                />
                Allow evidence-based cross-sell
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={policies.requireBudgetFit}
                  onChange={(event) => update("requireBudgetFit", event.target.checked)}
                  className="size-4 accent-accent"
                  disabled={saving}
                />
                Require budget fit
              </label>
            </div>
          </div>
        </form>

        <p id="admin-policy-note" className="text-xs text-muted">
          Existing checkout decisions are re-validated against current catalog and policy state before payment.
        </p>
      </section>

      <section className="rf-admin-section" aria-labelledby="policy-behavior">
        <SectionHeading
          title="What this means"
          description="Derived from your current values. Updates as you edit guardrails."
        />
        <ul className="divide-y divide-line/50">
          {explanations.map((item) => (
            <li key={item.id} className="py-4 first:pt-0">
              <p className="text-sm font-medium text-ink">{item.title}</p>
              <p className="mt-1 text-sm text-ink-soft">{item.rule}</p>
              <p className="mt-1 text-sm text-muted">{item.why}</p>
            </li>
          ))}
        </ul>
      </section>

      <section className="rf-admin-section" aria-labelledby="policy-consequences">
        <SectionHeading title="Consequences" description="How guardrail changes affect live commerce." />
        <ul className="space-y-3 text-sm text-ink-soft">
          <li>
            Agent runs after a save use the updated limits for recommendations, attach offers, and policy checks.
          </li>
          <li>
            In-flight checkout sessions re-validate against the new policy before Razorpay authorization.
          </li>
          <li>
            Policy blocks and audit events record the guardrail values in effect at decision time.
          </li>
        </ul>
      </section>
    </div>
  );
}
