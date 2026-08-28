"use client";

import { Minus, Plus, Trash } from "@phosphor-icons/react";
import { Money } from "@/components/money";
import type { CartState } from "@/hooks/use-cart";

type TransactionCartProps = {
  cart: CartState;
  loading: boolean;
  onUpdateQuantity: (lineId: string, quantity: number) => void | Promise<boolean>;
  onRemoveLine: (lineId: string) => void | Promise<boolean>;
};

export function TransactionCart({ cart, loading, onUpdateQuantity, onRemoveLine }: TransactionCartProps) {
  const isEmpty = cart.lines.length === 0;

  return (
    <section
      id="desk-transaction-cart"
      tabIndex={-1}
      className="mt-4 flex flex-1 flex-col outline-none"
      data-testid="transaction-cart"
      aria-labelledby="transaction-cart-heading"
    >
      <h3 id="transaction-cart-heading" className="text-xs font-medium uppercase tracking-wide text-muted">
        Cart
      </h3>

      {loading && isEmpty ? (
        <p className="mt-2 text-sm text-muted">Loading cart…</p>
      ) : isEmpty ? (
        <p className="mt-2 text-sm text-muted" data-testid="cart-empty-hint">
          No items added yet.
        </p>
      ) : (
        <>
          <ul className="mt-2 space-y-3" data-testid="cart-summary">
            {cart.lines.map((line) => (
              <li
                key={line.id}
                className="rounded-[8px] border border-line/60 bg-surface/60 p-3"
                data-testid={`cart-line-${line.sku}`}
              >
                <div className="flex items-start justify-between gap-2">
                  <p className="min-w-0 text-sm font-medium leading-snug" translate="no">
                    {line.name}
                  </p>
                  <p className="shrink-0 text-sm font-semibold tabular">
                    <Money value={line.lineTotal} />
                  </p>
                </div>
                <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                  <div className="inline-flex items-center rounded-[8px] border border-line/80 bg-canvas">
                    <button
                      type="button"
                      aria-label={`Decrease quantity for ${line.name}`}
                      data-testid={`decrease-qty-${line.sku}`}
                      className="rf-motion-colors inline-flex min-h-11 min-w-11 items-center justify-center text-ink-soft hover:text-ink"
                      onClick={() => void onUpdateQuantity(line.id, Math.max(1, line.quantity - 1))}
                    >
                      <Minus className="size-4" aria-hidden />
                    </button>
                    <span
                      className="min-w-8 text-center text-sm font-medium tabular"
                      data-testid={`cart-qty-${line.sku}`}
                    >
                      {line.quantity}
                    </span>
                    <button
                      type="button"
                      aria-label={`Increase quantity for ${line.name}`}
                      data-testid={`increase-qty-${line.sku}`}
                      className="rf-motion-colors inline-flex min-h-11 min-w-11 items-center justify-center text-ink-soft hover:text-ink disabled:opacity-40"
                      disabled={line.quantity >= line.inventory}
                      onClick={() => void onUpdateQuantity(line.id, line.quantity + 1)}
                    >
                      <Plus className="size-4" aria-hidden />
                    </button>
                  </div>
                  <button
                    type="button"
                    data-testid={`remove-${line.sku}`}
                    className="rf-motion-colors inline-flex min-h-11 items-center gap-1 px-2 text-sm text-danger hover:underline"
                    onClick={() => void onRemoveLine(line.id)}
                  >
                    <Trash className="size-4" aria-hidden />
                    Remove
                  </button>
                </div>
              </li>
            ))}
          </ul>

          <dl className="mt-4 space-y-2 border-t border-line/60 pt-3 text-sm">
            <div className="rf-kv-row py-0">
              <dt className="text-muted">Subtotal</dt>
              <dd className="font-medium tabular" data-testid="cart-subtotal">
                <Money value={cart.subtotal} />
              </dd>
            </div>
          </dl>
        </>
      )}
    </section>
  );
}
