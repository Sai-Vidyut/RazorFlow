"use client";

import { useCallback, useEffect, useState } from "react";
import type { AdminOrderDetail, AdminOrderListItem } from "@/lib/services/admin-orders";
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
  orderStatusTone,
  paymentStatusTone,
} from "@/components/admin/admin-ui";
import { Money } from "@/components/money";

type OrderFilter = "all" | "pending" | "paid" | "failed";

export function AdminOrdersDashboard() {
  const [orders, setOrders] = useState<AdminOrderListItem[]>([]);
  const [filter, setFilter] = useState<OrderFilter>("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<AdminOrderDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const loadOrders = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = filter === "all" ? "" : `?status=${filter}`;
      const response = await fetch(`/api/admin/orders${params}`, { credentials: "include" });
      if (!response.ok) throw new Error("Could not load orders.");
      const payload = (await response.json()) as { orders: AdminOrderListItem[] };
      setOrders(payload.orders);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not load orders.");
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => {
    void loadOrders();
  }, [loadOrders]);

  useEffect(() => {
    if (!selectedId) {
      setDetail(null);
      return;
    }
    async function loadDetail() {
      setDetailLoading(true);
      try {
        const response = await fetch(`/api/admin/orders/${selectedId}`, { credentials: "include" });
        if (!response.ok) throw new Error("Could not load order detail.");
        const payload = (await response.json()) as { order: AdminOrderDetail };
        setDetail(payload.order);
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : "Could not load order detail.");
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
        title="Orders"
        description="Merchant-scoped order history with agent decisions, policy outcomes, and payment state."
      />

      {error ? <AdminFeedback message={error} variant="error" /> : null}

      <FilterBar>
        <FilterSelect
          label="Status"
          value={filter}
          onChange={setFilter}
          options={[
            { value: "all", label: "All orders" },
            { value: "pending", label: "Pending" },
            { value: "paid", label: "Paid" },
            { value: "failed", label: "Failed" },
          ]}
        />
      </FilterBar>

      {loading ? (
        <LoadingState label="Loading orders…" />
      ) : orders.length === 0 ? (
        <EmptyState
          title="No orders yet"
          description="Orders appear when buyers complete checkout flows on the desk."
        />
      ) : (
        <DataTable>
          <TableHead>
            <tr>
              <TableHeaderCell>Order</TableHeaderCell>
              <TableHeaderCell>When</TableHeaderCell>
              <TableHeaderCell>Products</TableHeaderCell>
              <TableHeaderCell className="text-right">Qty</TableHeaderCell>
              <TableHeaderCell className="text-right">Amount</TableHeaderCell>
              <TableHeaderCell>Order status</TableHeaderCell>
              <TableHeaderCell>Payment</TableHeaderCell>
            </tr>
          </TableHead>
          <tbody>
            {orders.map((order) => (
              <TableRow
                key={order.id}
                onClick={() => setSelectedId(order.id)}
                selected={selectedId === order.id}
              >
                <TableCell className="font-mono text-xs text-accent">
                  {order.id.slice(0, 10)}…
                </TableCell>
                <TableCell className="text-xs text-muted whitespace-nowrap">
                  {formatWhen(order.createdAt)}
                </TableCell>
                <TableCell className="max-w-[14rem] truncate">{order.products}</TableCell>
                <TableCell className="text-right font-mono tabular-nums">{order.quantity}</TableCell>
                <TableCell className="text-right font-medium tabular-nums">
                  <Money value={order.amountInr} />
                </TableCell>
                <TableCell>
                  <StatusBadge
                    label={order.orderStatus}
                    tone={orderStatusTone(order.orderStatus)}
                  />
                </TableCell>
                <TableCell>
                  <StatusBadge
                    label={order.paymentStatus}
                    tone={paymentStatusTone(order.paymentStatus)}
                  />
                </TableCell>
              </TableRow>
            ))}
          </tbody>
        </DataTable>
      )}

      {selectedId ? (
        <DetailDrawer title="Order detail" onClose={() => setSelectedId(null)}>
          {detailLoading || !detail ? (
            <LoadingState label="Loading order detail…" />
          ) : (
            <div className="space-y-0">
              <DetailMetrics>
                <DetailMetric label="Total" value={<Money value={detail.amountInr} />} />
                <DetailMetric label="Quantity" value={detail.quantity} />
                <DetailMetric label="Subtotal" value={<Money value={detail.subtotalInr} />} />
                <DetailMetric label="Discount" value={`${detail.discountPct}%`} />
              </DetailMetrics>

              <DetailSection title="Order">
                <DetailFields>
                  <DetailField label="Order status">
                    <StatusBadge label={detail.orderStatus} tone={orderStatusTone(detail.orderStatus)} />
                  </DetailField>
                  <DetailField label="Payment status">
                    <StatusBadge label={detail.payment.status} tone={paymentStatusTone(detail.payment.status)} />
                  </DetailField>
                  <DetailField label="Session" mono>
                    {detail.sessionRef}
                  </DetailField>
                  <DetailField label="Products">
                    {detail.products.primary?.name}
                    {detail.products.attach ? ` + ${detail.products.attach.name}` : ""}
                  </DetailField>
                </DetailFields>
              </DetailSection>

              <DetailSection title="Agent decision">
                <p className="text-sm leading-relaxed text-ink-soft">{detail.decision.recommendationReason}</p>
                <p className="mt-2 text-sm">
                  Policy:{" "}
                  <span className={detail.decision.policyAllowed ? "text-success" : "text-danger"}>
                    {detail.decision.policyAllowed ? "Allowed" : "Blocked"}
                  </span>
                  {detail.decision.policyReason ? ` — ${detail.decision.policyReason}` : ""}
                </p>
              </DetailSection>

              <DetailSection title="Payment">
                <DetailFields>
                  <DetailField label="Razorpay payment ID" mono>
                    {detail.payment.razorpayPaymentId ?? "Not captured"}
                  </DetailField>
                  {detail.payment.failureReason ? (
                    <DetailField label="Failure reason">
                      <span className="text-danger">{detail.payment.failureReason}</span>
                    </DetailField>
                  ) : null}
                </DetailFields>
              </DetailSection>

              <DetailSection title="Audit trail">
                <ActivityList items={detail.auditEvents} empty="No related audit events." />
              </DetailSection>
            </div>
          )}
        </DetailDrawer>
      ) : null}
    </div>
  );
}
