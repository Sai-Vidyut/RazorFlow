"use client";

import { useCallback, useEffect, useState } from "react";
import type { AdminActivityFilter } from "@/lib/services/admin-audit";
import type { AdminActivityPage } from "@/lib/services/admin-activity";
import {
  AdminFeedback,
  Badge,
  Button,
  EmptyState,
  EventRow,
  EventStream,
  FilterBar,
  FilterSelect,
  formatTimeShort,
  LoadingState,
  PageHeader,
} from "@/components/admin/admin-ui";

const PAGE_SIZE = 50;

function activityTone(type: string): "neutral" | "success" | "warning" | "danger" | "accent" {
  if (type.startsWith("PAYMENT_CAPTURED") || type === "POLICY_ALLOWED" || type === "RECOVERY_SUCCEEDED") return "success";
  if (type.startsWith("PAYMENT_FAILED") || type === "POLICY_BLOCKED" || type === "RECOVERY_BLOCKED" || type === "RECOVERY_FAILED") return "danger";
  if (type.startsWith("RECOVERY_")) return "warning";
  if (type.startsWith("PRODUCT_") || type === "POLICY_UPDATED") return "accent";
  if (type.startsWith("INTENT_") || type === "DECISION_RECORDED") return "warning";
  return "neutral";
}

export function AdminActivityDashboard() {
  const [page, setPage] = useState<AdminActivityPage | null>(null);
  const [filter, setFilter] = useState<AdminActivityFilter>("all");
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadActivity = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        filter,
        limit: String(PAGE_SIZE),
        offset: String(offset),
      });
      const response = await fetch(`/api/admin/activity?${params}`, { credentials: "include" });
      if (!response.ok) throw new Error("Could not load activity.");
      setPage((await response.json()) as AdminActivityPage);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not load activity.");
    } finally {
      setLoading(false);
    }
  }, [filter, offset]);

  useEffect(() => {
    void loadActivity();
  }, [loadActivity]);

  useEffect(() => {
    setOffset(0);
  }, [filter]);

  const hasPrev = offset > 0;
  const hasNext = page ? offset + page.limit < page.total : false;

  return (
    <div className="rf-admin-page">
      <PageHeader
        title="Activity"
        description="Merchant-scoped audit trail from buyer sessions and admin mutations. Secrets are never shown."
      />

      {error ? <AdminFeedback message={error} variant="error" /> : null}

      <FilterBar>
        <FilterSelect
          label="Filter"
          value={filter}
          onChange={setFilter}
          options={[
            { value: "all", label: "All events" },
            { value: "products", label: "Product changes" },
            { value: "policies", label: "Policy changes" },
            { value: "orders", label: "Orders" },
            { value: "payments", label: "Payments" },
            { value: "agent", label: "Agent activity" },
            { value: "system", label: "System activity" },
          ]}
        />
      </FilterBar>

      {loading ? (
        <LoadingState label="Loading activity…" />
      ) : !page || page.items.length === 0 ? (
        <EmptyState
          title="No audit events yet"
          description="No events match this filter. Activity appears after desk sessions, checkouts, and admin changes."
        />
      ) : (
        <>
          <EventStream>
            {page.items.map((item) => (
              <EventRow
                key={item.id}
                time={formatTimeShort(item.when)}
                title={item.label}
                detail={item.detail}
                meta={<Badge tone={activityTone(item.type)}>{item.type.replaceAll("_", " ")}</Badge>}
              />
            ))}
          </EventStream>
          <div className="flex items-center justify-between gap-4 border-t border-line/60 pt-4">
            <p className="text-sm text-muted">
              Showing {page.offset + 1}–{Math.min(page.offset + page.items.length, page.total)} of {page.total}
            </p>
            <div className="flex gap-2">
              <Button
                type="button"
                variant="secondary"
                disabled={!hasPrev}
                onClick={() => setOffset((current) => Math.max(0, current - PAGE_SIZE))}
              >
                Previous
              </Button>
              <Button
                type="button"
                variant="secondary"
                disabled={!hasNext}
                onClick={() => setOffset((current) => current + PAGE_SIZE)}
              >
                Next
              </Button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
