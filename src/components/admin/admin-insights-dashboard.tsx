"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import type { AdminInsightsData } from "@/lib/services/admin-insights";
import {
  AdminPageLoading,
  DataTable,
  EmptyState,
  formatPct,
  TableCell,
  TableHead,
  TableHeaderCell,
  TableRow,
} from "@/components/admin/admin-ui";
import { Money } from "@/components/money";

function InsightMetric({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="rf-insights-metric">
      <p className="rf-insights-metric-label">{label}</p>
      <p className="rf-insights-metric-value">{value}</p>
    </div>
  );
}

export function AdminInsightsDashboard() {
  const [data, setData] = useState<AdminInsightsData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const response = await fetch("/api/admin/insights", { credentials: "include" });
        if (!response.ok) throw new Error("Could not load insights.");
        setData((await response.json()) as AdminInsightsData);
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : "Could not load insights.");
      } finally {
        setLoading(false);
      }
    }
    void load();
  }, []);

  const sortedProducts = useMemo(() => {
    if (!data) return [];
    return [...data.products].sort((a, b) => b.revenueInr - a.revenueInr);
  }, [data]);

  if (loading) return <AdminPageLoading label="Loading insights…" />;
  if (error || !data) {
    return (
      <div className="rf-admin-page rf-insights-page">
        <header className="rf-admin-page-header">
          <div>
            <h1>Insights</h1>
            <p>{error ?? "Insights unavailable."}</p>
          </div>
        </header>
      </div>
    );
  }

  const hasRevenue = data.revenue.gmvInr > 0;
  const hasFunnelActivity = data.funnel.buyerSessions > 0;
  const hasAgentData =
    data.agent.offersGenerated > 0 ||
    data.agent.policyBlocks > 0 ||
    data.agent.attachRate != null ||
    data.agent.conversionRate != null;
  const hasProductData = sortedProducts.length > 0;

  return (
    <div className="rf-admin-page rf-insights-page">
      <header className="rf-admin-page-header">
        <div>
          <h1>Insights</h1>
          <p>Analytics from sessions, agent decisions, orders, and verified captures.</p>
        </div>
      </header>

      {data.notes.length > 0 ? (
        <aside className="rf-insights-notes" aria-label="Data notes">
          <ul>
            {data.notes.map((note) => (
              <li key={note}>{note}</li>
            ))}
          </ul>
        </aside>
      ) : null}

      <section className="rf-insights-section" aria-labelledby="insights-revenue">
        <div className="rf-insights-section-head">
          <h2 id="insights-revenue" className="rf-insights-section-title">
            Revenue
          </h2>
          <p className="rf-insights-section-desc">
            Captured GMV and order economics from verified payments.
          </p>
        </div>
        {!hasRevenue ? (
          <EmptyState
            title="Not enough activity yet"
            description="GMV and average order value appear after successful payment captures."
          />
        ) : (
          <div className="rf-insights-revenue">
            <div className="rf-insights-primary">
              <p className="rf-insights-primary-label">Captured GMV</p>
              <p className="rf-insights-primary-value">
                <Money value={data.revenue.gmvInr} />
              </p>
              <p className="rf-insights-primary-hint">Verified Razorpay captures only</p>
            </div>
            <div className="rf-insights-metric-grid rf-insights-metric-grid-revenue">
              <InsightMetric
                label="Average order value"
                value={
                  data.revenue.averageOrderValueInr != null ? (
                    <Money value={data.revenue.averageOrderValueInr} />
                  ) : (
                    "—"
                  )
                }
              />
              <InsightMetric
                label="Captured revenue"
                value={<Money value={data.revenue.capturedRevenueInr} />}
              />
              <InsightMetric label="Successful payments" value={data.funnel.successfulPayments} />
              <InsightMetric label="Failed payments" value={data.funnel.failedPayments} />
            </div>
          </div>
        )}
      </section>

      <section className="rf-insights-section" aria-labelledby="insights-funnel">
        <div className="rf-insights-section-head">
          <h2 id="insights-funnel" className="rf-insights-section-title">
            Commerce funnel
          </h2>
          <p className="rf-insights-section-desc">Buyer session through payment outcomes.</p>
        </div>
        {!hasFunnelActivity ? (
          <EmptyState
            title="No funnel data yet"
            description="Session counts populate after buyers use the desk."
          />
        ) : (
          <div className="rf-insights-metric-grid">
            <InsightMetric label="Buyer sessions" value={data.funnel.buyerSessions} />
            <InsightMetric label="Agent decisions" value={data.funnel.agentDecisions} />
            <InsightMetric label="Checkout starts" value={data.funnel.checkoutStarts} />
            <InsightMetric label="Successful payments" value={data.funnel.successfulPayments} />
            <InsightMetric label="Failed payments" value={data.funnel.failedPayments} />
          </div>
        )}
      </section>

      <section className="rf-insights-section" aria-labelledby="insights-agent">
        <div className="rf-insights-section-head">
          <h2 id="insights-agent" className="rf-insights-section-title">
            Agent performance
          </h2>
          <p className="rf-insights-section-desc">Recommendation quality and guardrail impact.</p>
        </div>
        {!hasAgentData ? (
          <EmptyState
            title="No agent performance data yet"
            description="Attach rate and conversion appear after agent runs and checkouts."
          />
        ) : (
          <div className="rf-insights-metric-grid">
            <InsightMetric label="Attach rate" value={formatPct(data.agent.attachRate)} />
            <InsightMetric label="Conversion rate" value={formatPct(data.agent.conversionRate)} />
            <InsightMetric label="Offers generated" value={data.agent.offersGenerated} />
            <InsightMetric label="Policy blocks" value={data.agent.policyBlocks} />
          </div>
        )}
      </section>

      <section className="rf-insights-section" aria-labelledby="insights-products">
        <div className="rf-insights-section-head">
          <h2 id="insights-products" className="rf-insights-section-title">
            Product performance
          </h2>
          <p className="rf-insights-section-desc">
            Recommendations, purchases, and revenue by SKU. Sorted by captured revenue.
          </p>
        </div>
        {!hasProductData ? (
          <EmptyState
            title="No product performance data yet"
            description="Recommendations and purchases will populate after agent and checkout activity."
          />
        ) : (
          <DataTable className="rf-insights-table">
            <TableHead>
              <tr>
                <TableHeaderCell>Product</TableHeaderCell>
                <TableHeaderCell className="text-right">Recommended</TableHeaderCell>
                <TableHeaderCell className="text-right">Purchased</TableHeaderCell>
                <TableHeaderCell className="text-right">Revenue</TableHeaderCell>
              </tr>
            </TableHead>
            <tbody>
              {sortedProducts.map((product) => (
                <TableRow key={product.productId}>
                  <TableCell>
                    <p className="font-medium text-ink">{product.name}</p>
                    <p className="mt-0.5 font-mono text-[11px] text-muted">{product.sku}</p>
                  </TableCell>
                  <TableCell className="text-right font-mono tabular-nums">
                    {product.timesRecommended}
                  </TableCell>
                  <TableCell className="text-right font-mono tabular-nums">
                    {product.timesPurchased}
                  </TableCell>
                  <TableCell className="text-right font-mono tabular-nums">
                    <Money value={product.revenueInr} />
                  </TableCell>
                </TableRow>
              ))}
            </tbody>
          </DataTable>
        )}
      </section>
    </div>
  );
}
