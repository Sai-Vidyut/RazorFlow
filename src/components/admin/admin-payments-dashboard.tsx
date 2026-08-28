"use client";

import { useCallback, useEffect, useState } from "react";
import type { AdminPaymentDetail, AdminPaymentListItem } from "@/lib/services/admin-payments";
import { ActivityList } from "@/components/admin/admin-overview-dashboard";
import {
  AdminFeedback,
  DetailDrawer,
  DetailField,
  DetailFields,
  DetailMetric,
  DetailMetrics,
  DetailSection,
  EmptyState,
  FilterBar,
  FilterSelect,
  LoadingState,
  PageHeader,
  DataTable,
  StatusBadge,
  TableCell,
  TableHead,
  TableHeaderCell,
  TableRow,
  formatWhen,
  paymentStatusTone,
} from "@/components/admin/admin-ui";
import { Money } from "@/components/money";

type PaymentFilter = "all" | "captured" | "failed" | "pending";

export function AdminPaymentsDashboard() {
  const [payments, setPayments] = useState<AdminPaymentListItem[]>([]);
  const [filter, setFilter] = useState<PaymentFilter>("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<AdminPaymentDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const loadPayments = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = filter === "all" ? "" : `?status=${filter}`;
      const response = await fetch(`/api/admin/payments${params}`, { credentials: "include" });
      if (!response.ok) throw new Error("Could not load payments.");
      const payload = (await response.json()) as { payments: AdminPaymentListItem[] };
      setPayments(payload.payments);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not load payments.");
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => {
    void loadPayments();
  }, [loadPayments]);

  useEffect(() => {
    if (!selectedId) {
      setDetail(null);
      return;
    }
    async function loadDetail() {
      setDetailLoading(true);
      try {
        const response = await fetch(`/api/admin/payments/${selectedId}`, { credentials: "include" });
        if (!response.ok) throw new Error("Could not load payment detail.");
        const payload = (await response.json()) as { payment: AdminPaymentDetail };
        setDetail(payload.payment);
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : "Could not load payment detail.");
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
        title="Payments"
        description="Read-only Razorpay payment history for this merchant. No client-side payment manipulation."
      />

      {error ? <AdminFeedback message={error} variant="error" /> : null}

      <FilterBar>
        <FilterSelect
          label="Status"
          value={filter}
          onChange={setFilter}
          options={[
            { value: "all", label: "All payments" },
            { value: "captured", label: "Captured" },
            { value: "failed", label: "Failed" },
            { value: "pending", label: "Pending" },
          ]}
        />
      </FilterBar>

      {loading ? (
        <LoadingState label="Loading payments…" />
      ) : payments.length === 0 ? (
        <EmptyState
          title="No payments yet"
          description="Payments appear when buyers authorize checkout on the desk."
        />
      ) : (
        <DataTable>
          <TableHead>
            <tr>
              <TableHeaderCell>Payment</TableHeaderCell>
              <TableHeaderCell>Order</TableHeaderCell>
              <TableHeaderCell className="text-right">Amount</TableHeaderCell>
              <TableHeaderCell>Status</TableHeaderCell>
              <TableHeaderCell>Razorpay ID</TableHeaderCell>
              <TableHeaderCell>Created</TableHeaderCell>
              <TableHeaderCell>Captured</TableHeaderCell>
            </tr>
          </TableHead>
          <tbody>
            {payments.map((payment) => (
              <TableRow
                key={payment.id}
                onClick={() => setSelectedId(payment.id)}
                selected={selectedId === payment.id}
              >
                <TableCell className="font-mono text-xs text-accent">
                  {payment.id.slice(0, 10)}…
                </TableCell>
                <TableCell className="font-mono text-xs">{payment.orderId.slice(0, 10)}…</TableCell>
                <TableCell className="text-right font-medium tabular-nums">
                  <Money value={payment.amountInr} />
                </TableCell>
                <TableCell>
                  <StatusBadge label={payment.status} tone={paymentStatusTone(payment.status)} />
                </TableCell>
                <TableCell className="max-w-[8rem] truncate font-mono text-xs">
                  {payment.razorpayPaymentId ?? "—"}
                </TableCell>
                <TableCell className="whitespace-nowrap text-xs text-muted">
                  {formatWhen(payment.createdAt)}
                </TableCell>
                <TableCell className="whitespace-nowrap text-xs text-muted">
                  {payment.capturedAt ? formatWhen(payment.capturedAt) : "—"}
                </TableCell>
              </TableRow>
            ))}
          </tbody>
        </DataTable>
      )}

      {selectedId ? (
        <DetailDrawer title="Payment detail" onClose={() => setSelectedId(null)}>
          {detailLoading || !detail ? (
            <LoadingState label="Loading payment detail…" />
          ) : (
            <div className="space-y-0">
              <DetailMetrics>
                <DetailMetric label="Amount" value={<Money value={detail.amountInr} />} />
                <DetailMetric
                  label="Status"
                  value={
                    <StatusBadge label={detail.status} tone={paymentStatusTone(detail.status)} />
                  }
                />
              </DetailMetrics>

              <DetailSection title="Payment">
                <DetailFields>
                  <DetailField label="Order" mono>
                    {detail.orderId}
                  </DetailField>
                  <DetailField label="Session" mono>
                    {detail.sessionRef}
                  </DetailField>
                  <DetailField label="Razorpay payment ID" mono>
                    {detail.razorpayPaymentId ?? "Not captured"}
                  </DetailField>
                  <DetailField label="Products">{detail.products}</DetailField>
                  {detail.failureReason ? (
                    <DetailField label="Failure reason">
                      <span className="text-danger">{detail.failureReason}</span>
                    </DetailField>
                  ) : null}
                </DetailFields>
              </DetailSection>

              <DetailSection title="Audit trail">
                <ActivityList items={detail.auditEvents} empty="No payment audit events." />
              </DetailSection>
            </div>
          )}
        </DetailDrawer>
      ) : null}
    </div>
  );
}
