"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Storefront } from "@phosphor-icons/react";
import type { AdminActivityItem } from "@/lib/services/admin-audit";
import type { AdminOverviewData } from "@/lib/services/admin-dashboard";
import { Money } from "@/components/money";
import {
  AdminPageLoading,
  EmptyState,
  EventRow,
  EventStream,
  formatPct,
  formatTimeShort,
} from "@/components/admin/admin-ui";

export function AdminOverviewDashboard() {
  const [data, setData] = useState<AdminOverviewData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const response = await fetch("/api/admin/overview", { credentials: "include" });
        if (!response.ok) {
          const payload = (await response.json()) as { error?: string };
          throw new Error(payload.error ?? "Could not load overview.");
        }
        setData((await response.json()) as AdminOverviewData);
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : "Could not load overview.");
      } finally {
        setLoading(false);
      }
    }
    void load();
  }, []);

  if (loading) return <AdminPageLoading label="Loading overview metrics…" />;
  if (error || !data) {
    return (
      <div className="rf-admin-page">
        <header className="rf-admin-page-header">
          <div>
            <h1>Overview</h1>
            <p>{error ?? "Overview unavailable."}</p>
          </div>
        </header>
      </div>
    );
  }

  const hasCommerce =
    data.commerce.orderCount > 0 ||
    data.commerce.capturedPayments > 0 ||
    data.commerce.gmvInr > 0;

  return (
    <div className="rf-admin-page">
      <header className="rf-admin-page-header">
        <div>
          <h1>Overview</h1>
          <p translate="no">
            {data.merchant.name} · metrics from verified checkout activity for this merchant
          </p>
        </div>
        <Link
          href="/desk"
          className="rf-btn rf-btn-primary inline-flex min-h-10 items-center gap-2 rounded-[8px] px-4 text-sm font-medium text-white"
        >
          <Storefront className="size-4" aria-hidden />
          Open desk
        </Link>
      </header>

      {!hasCommerce ? (
        <EmptyState
          title="No governed sales yet"
          description="Captured GMV, orders, and conversion will appear after the first buyer completes checkout on the desk."
        />
      ) : (
        <div className="rf-command-layout">
          <div className="rf-command-primary">
            <p className="rf-command-primary-label">Captured GMV</p>
            <p className="rf-command-primary-value">
              <Money value={data.commerce.gmvInr} />
            </p>
            <p className="rf-command-primary-hint">Verified Razorpay captures only</p>
          </div>
          <div className="rf-command-secondary">
            <div className="rf-command-metric">
              <p className="rf-command-metric-label">Orders</p>
              <p className="rf-command-metric-value">{data.commerce.orderCount}</p>
            </div>
            <div className="rf-command-metric">
              <p className="rf-command-metric-label">Conversion</p>
              <p className="rf-command-metric-value">{formatPct(data.commerce.conversionRate)}</p>
            </div>
            <div className="rf-command-metric">
              <p className="rf-command-metric-label">Successful payments</p>
              <p className="rf-command-metric-value">{data.commerce.capturedPayments}</p>
            </div>
            <div className="rf-command-metric">
              <p className="rf-command-metric-label">Failed payments</p>
              <p className="rf-command-metric-value">{data.commerce.failedPayments}</p>
            </div>
            <div className="rf-command-metric">
              <p className="rf-command-metric-label">Pending payments</p>
              <p className="rf-command-metric-value">{data.commerce.pendingPayments}</p>
            </div>
            <div className="rf-command-metric">
              <p className="rf-command-metric-label">Policy blocks</p>
              <p className="rf-command-metric-value">{data.agent.policyBlocks}</p>
            </div>
          </div>
        </div>
      )}

      <section className="rf-admin-block" aria-labelledby="commerce-activity">
        <div>
          <h2 id="commerce-activity" className="rf-admin-block-title">
            Commerce activity
          </h2>
          <p className="rf-admin-block-desc">Recent audit events from checkout and policy evaluation.</p>
        </div>
        <ActivityList
          items={data.recentActivity}
          empty="No audit events recorded for this merchant yet."
        />
      </section>

      <section className="rf-admin-block" aria-labelledby="catalog-health">
        <div>
          <h2 id="catalog-health" className="rf-admin-block-title">
            Catalog health
          </h2>
          <p className="rf-admin-block-desc">Inventory posture for active products.</p>
        </div>
        <div className="rf-command-secondary max-w-3xl">
          <div className="rf-command-metric">
            <p className="rf-command-metric-label">Active products</p>
            <p className="rf-command-metric-value">{data.catalog.activeCount}</p>
          </div>
          <div className="rf-command-metric">
            <p className="rf-command-metric-label">Inactive</p>
            <p className="rf-command-metric-value">{data.catalog.inactiveCount}</p>
          </div>
          <div className="rf-command-metric">
            <p className="rf-command-metric-label">Zero inventory</p>
            <p className="rf-command-metric-value">{data.catalog.zeroInventoryCount}</p>
          </div>
          <div className="rf-command-metric">
            <p className="rf-command-metric-label">Low stock</p>
            <p className="rf-command-metric-value">{data.catalog.lowStockCount}</p>
          </div>
          <div className="rf-command-metric">
            <p className="rf-command-metric-label">Total units</p>
            <p className="rf-command-metric-value">{data.catalog.totalInventoryUnits}</p>
          </div>
        </div>
      </section>

      <section className="rf-admin-block" aria-labelledby="agent-activity">
        <div>
          <h2 id="agent-activity" className="rf-admin-block-title">
            Agent activity
          </h2>
          <p className="rf-admin-block-desc">Recommendation and guardrail signals from live sessions.</p>
        </div>
        {data.agent.decisions === 0 ? (
          <EmptyState
            title="No agent decisions yet"
            description="Run the buyer desk to generate recommendations. Offers, policy blocks, and attach metrics will appear here."
          />
        ) : (
          <div className="rf-command-secondary max-w-2xl">
            <div className="rf-command-metric">
              <p className="rf-command-metric-label">Decisions</p>
              <p className="rf-command-metric-value">{data.agent.decisions}</p>
            </div>
            <div className="rf-command-metric">
              <p className="rf-command-metric-label">Offers generated</p>
              <p className="rf-command-metric-value">{data.agent.offersGenerated}</p>
            </div>
            <div className="rf-command-metric">
              <p className="rf-command-metric-label">Policy blocks</p>
              <p className="rf-command-metric-value">{data.agent.policyBlocks}</p>
            </div>
            <div className="rf-command-metric">
              <p className="rf-command-metric-label">Payment failures</p>
              <p className="rf-command-metric-value">{data.agent.paymentFailures}</p>
            </div>
            <div className="rf-command-metric">
              <p className="rf-command-metric-label">Checkout attempts</p>
              <p className="rf-command-metric-value">{data.agent.checkoutAttempts}</p>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}

export function ActivityList({
  items,
  empty,
}: {
  items: AdminActivityItem[];
  empty: string;
}) {
  if (items.length === 0) {
    return <p className="text-sm text-muted">{empty}</p>;
  }

  return (
    <EventStream>
      {items.map((item) => (
        <EventRow
          key={item.id}
          time={formatTimeShort(item.when)}
          title={item.label}
          detail={item.detail}
          meta={
            item.sessionId ? (
              <span className="font-mono text-muted">Session {item.sessionId.slice(0, 8)}…</span>
            ) : null
          }
        />
      ))}
    </EventStream>
  );
}
