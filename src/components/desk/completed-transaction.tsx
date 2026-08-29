"use client";

import { CheckCircle } from "@phosphor-icons/react";
import { Money } from "@/components/money";
import { Button } from "@/components/ui/design-system";
import { formatPaidWhen, type CapturedPaymentView } from "@/lib/desk/payment-display";

type CompletedTransactionProps = {
  payment: CapturedPaymentView;
  onStartNewSale: () => void;
};

export function CompletedTransaction({ payment, onStartNewSale }: CompletedTransactionProps) {
  return (
    <div
      className="rf-desk-transact-completed mt-auto space-y-4 border-t border-line/60 pt-4"
      data-testid="transaction-completed"
    >
      <div className="rounded-[12px] border border-accent/25 bg-accent-soft/20 p-4">
        <div className="flex items-start gap-3">
          <CheckCircle className="size-5 shrink-0 text-accent" weight="fill" aria-hidden="true" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-accent" data-testid="payment-success">
              Payment captured
            </p>
            <p className="mt-2 text-base font-semibold text-ink" translate="no">
              {payment.productName}
            </p>
            <p className="mt-1 text-3xl font-semibold tracking-tight tabular">
              <Money value={payment.amountInr} />
            </p>
          </div>
        </div>

        <dl className="mt-4 space-y-2 border-t border-line/40 pt-3 text-sm">
          <div className="rf-kv-row py-0">
            <dt className="text-muted">Order</dt>
            <dd className="font-mono text-xs font-medium tabular text-ink" data-testid="completed-order-id">
              {payment.orderLabel}
            </dd>
          </div>
          <div className="rf-kv-row py-0">
            <dt className="text-muted">Payment</dt>
            <dd className="font-mono text-xs font-medium tabular text-ink" data-testid="completed-payment-id">
              {payment.razorpayPaymentIdMasked}
            </dd>
          </div>
          <div className="rf-kv-row py-0">
            <dt className="text-muted">Status</dt>
            <dd className="font-medium text-success">Captured</dd>
          </div>
          <div className="rf-kv-row py-0">
            <dt className="text-muted">When</dt>
            <dd className="text-ink-soft" data-testid="completed-paid-when">
              {formatPaidWhen(payment.capturedAt)}
            </dd>
          </div>
        </dl>
      </div>

      <Button type="button" data-testid="start-new-sale" className="w-full" onClick={onStartNewSale}>
        Start new sale
      </Button>
    </div>
  );
}

type PaymentNotCompletedProps = {
  message: string;
  onTryAgain: () => void;
};

export function PaymentNotCompleted({ message, onTryAgain }: PaymentNotCompletedProps) {
  return (
    <div
      className="rf-desk-transact-incomplete mt-auto space-y-3 border-t border-line/60 pt-4"
      data-testid="payment-not-completed"
    >
      <div className="rounded-[12px] border border-danger/25 bg-danger/5 p-4">
        <p className="text-sm font-medium text-danger">Payment not completed</p>
        <p className="mt-2 text-sm text-ink-soft" role="alert">
          {message}
        </p>
      </div>
      <Button type="button" data-testid="try-payment-again" className="w-full" onClick={onTryAgain}>
        Try again
      </Button>
    </div>
  );
}
