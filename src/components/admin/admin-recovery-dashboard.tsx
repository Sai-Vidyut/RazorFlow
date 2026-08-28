"use client";

import { useCallback, useEffect, useState } from "react";
import type {
  AdminRecoveryDetail,
  AdminRecoveryListItem,
  RecoveryFilter,
} from "@/lib/services/admin-recovery";
import { ActivityList } from "@/components/admin/admin-overview-dashboard";
import {
  AdminFeedback,
  DetailDrawer,
  DetailField,
  DetailFields,
  DetailSection,
  EmptyState,
  FilterBar,
  FilterSelect,
  formatWhen,
  LoadingState,
  PageHeader,
  DataTable,
  StatCell,
  StatStrip,
  StatusBadge,
  TableCell,
  TableHead,
  TableHeaderCell,
  TableRow,
  formatPct,
} from "@/components/admin/admin-ui";
import { Money } from "@/components/money";

type RecoveryMetrics = {
  failedPaymentAmountInr: number;
  recoveryCandidates: number;
  recoveryAttempts: number;
  recoveredPayments: number;
  recoveredGmvInr: number;
  recoveryRate: number | null;
};

function recoveryTone(state: AdminRecoveryListItem["recoveryState"]) {
  if (state === "recovered") return "success" as const;
  if (state === "in_progress") return "warning" as const;
  return "danger" as const;
}

function recoveryLabel(state: AdminRecoveryListItem["recoveryState"]) {
  if (state === "recovered") return "Recovered";
  if (state === "in_progress") return "In progress";
  return "Candidate";
}

function attemptTone(status: string) {
  if (status === "CAPTURED") return "success" as const;
  if (status === "FAILED") return "danger" as const;
  return "warning" as const;
}

export function AdminRecoveryDashboard() {
  const [items, setItems] = useState<AdminRecoveryListItem[]>([]);
  const [metrics, setMetrics] = useState<RecoveryMetrics | null>(null);
  const [filter, setFilter] = useState<RecoveryFilter>("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<AdminRecoveryDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const loadRecovery = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = filter === "all" ? "" : `?status=${filter}`;
      const response = await fetch(`/api/admin/recovery${params}`, { credentials: "include" });
      if (!response.ok) throw new Error("Could not load recovery data.");
      const payload = (await response.json()) as {
        items: AdminRecoveryListItem[];
        metrics: RecoveryMetrics;
      };
      setItems(payload.items);
      setMetrics(payload.metrics);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not load recovery data.");
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => {
    void loadRecovery();
  }, [loadRecovery]);

  useEffect(() => {
    if (!selectedId) {
      setDetail(null);
      return;
    }
    async function loadDetail() {
      setDetailLoading(true);
      try {
        const response = await fetch(`/api/admin/recovery/${selectedId}`, { credentials: "include" });
        if (!response.ok) throw new Error("Could not load recovery detail.");
        const payload = (await response.json()) as { recovery: AdminRecoveryDetail };
        setDetail(payload.recovery);
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : "Could not load recovery detail.");
        setSelectedId(null);
      } finally {
        setDetailLoading(false);
      }
    }
    void loadDetail();
  }, [selectedId]);

  return (
    <div className="rf-admin-page">
      <PageHeader
        title="Recovery"
        description="Governed revenue recovery for failed payments. Policy and catalog checks run before every retry."
      />

      {error ? <AdminFeedback message={error} variant="error" /> : null}

      {metrics ? (
        <StatStrip>
          <StatCell
            label="Failed payment amount"
            value={<Money value={metrics.failedPaymentAmountInr} />}
          />
          <StatCell label="Recovery candidates" value={metrics.recoveryCandidates} />
          <StatCell label="Recovery attempts" value={metrics.recoveryAttempts} />
          <StatCell label="Recovered payments" value={metrics.recoveredPayments} />
          <StatCell label="Recovered GMV" value={<Money value={metrics.recoveredGmvInr} />} />
          <StatCell label="Recovery rate" value={formatPct(metrics.recoveryRate)} />
        </StatStrip>
      ) : null}

      <FilterBar>
        <FilterSelect
          label="State"
          value={filter}
          onChange={setFilter}
          options={[
            { value: "all", label: "All recovery" },
            { value: "candidate", label: "Candidates" },
            { value: "in_progress", label: "In progress" },
            { value: "recovered", label: "Recovered" },
          ]}
        />
      </FilterBar>

      {loading ? (
        <LoadingState label="Loading recovery queue…" />
      ) : items.length === 0 ? (
        <EmptyState
          title="No recovery activity"
          description="Failed payments eligible for governed retry will appear here after desk checkout failures."
        />
      ) : (
        <DataTable>
          <TableHead>
            <tr>
              <TableHeaderCell>Session</TableHeaderCell>
              <TableHeaderCell>Products</TableHeaderCell>
              <TableHeaderCell className="text-right">Amount</TableHeaderCell>
              <TableHeaderCell className="text-right">At risk</TableHeaderCell>
              <TableHeaderCell>State</TableHeaderCell>
              <TableHeaderCell>Failed attempts</TableHeaderCell>
              <TableHeaderCell>Last failure</TableHeaderCell>
            </tr>
          </TableHead>
          <tbody>
            {items.map((item) => (
              <TableRow
                key={item.id}
                onClick={() => setSelectedId(item.decisionId)}
                selected={selectedId === item.decisionId}
              >
                <TableCell className="max-w-[12rem] truncate text-sm">{item.sessionRef}</TableCell>
                <TableCell className="max-w-[14rem] truncate">{item.products}</TableCell>
                <TableCell className="text-right tabular-nums">
                  <Money value={item.amountInr} />
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {item.amountAtRiskInr > 0 ? <Money value={item.amountAtRiskInr} /> : "—"}
                </TableCell>
                <TableCell>
                  <StatusBadge label={recoveryLabel(item.recoveryState)} tone={recoveryTone(item.recoveryState)} />
                </TableCell>
                <TableCell className="font-mono tabular-nums">{item.failedAttempts}</TableCell>
                <TableCell className="whitespace-nowrap text-xs text-muted">
                  {item.lastFailedAt ? formatWhen(item.lastFailedAt) : "—"}
                </TableCell>
              </TableRow>
            ))}
          </tbody>
        </DataTable>
      )}

      {selectedId ? (
        <DetailDrawer title="Recovery detail" onClose={() => setSelectedId(null)}>
          {detailLoading || !detail ? (
            <LoadingState label="Loading recovery detail…" />
          ) : (
            <div className="space-y-0">
              <DetailSection title="Recovery state">
                <DetailFields>
                  <DetailField label="State">
                    <StatusBadge
                      label={recoveryLabel(detail.recoveryState)}
                      tone={recoveryTone(detail.recoveryState)}
                    />
                  </DetailField>
                  <DetailField label="Products">{detail.products}</DetailField>
                  <DetailField label="Basket total">
                    <Money value={detail.amountInr} />
                  </DetailField>
                  <DetailField label="Session" mono>
                    {detail.sessionRef}
                  </DetailField>
                </DetailFields>
              </DetailSection>

              <DetailSection title="Payment attempts">
                <ul className="space-y-3">
                  {detail.paymentAttempts.map((attempt) => (
                    <li
                      key={attempt.paymentId}
                      className="border-b border-line/50 pb-3 last:border-b-0 last:pb-0"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <p className="text-sm font-medium">
                          Attempt {attempt.attemptNumber}
                        </p>
                        <StatusBadge
                          label={attempt.paymentStatus}
                          tone={attemptTone(attempt.paymentStatus)}
                        />
                      </div>
                      <p className="mt-1 text-sm tabular-nums">
                        <Money value={attempt.amountInr} />
                      </p>
                      {attempt.failureReason ? (
                        <p className="mt-1 text-sm text-danger">{attempt.failureReason}</p>
                      ) : null}
                      <p className="mt-1 text-xs text-muted">{formatWhen(attempt.createdAt)}</p>
                    </li>
                  ))}
                </ul>
              </DetailSection>

              <DetailSection title="Audit trail">
                <ActivityList items={detail.auditEvents} empty="No recovery audit events." />
              </DetailSection>
            </div>
          )}
        </DetailDrawer>
      ) : null}
    </div>
  );
}
