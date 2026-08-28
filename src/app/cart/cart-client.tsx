"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { Minus, Plus, Trash } from "@phosphor-icons/react";
import { DeskShell } from "@/components/shell/desk-shell";
import { Money } from "@/components/money";
import { Button } from "@/components/ui/design-system";
import type { CartState } from "@/hooks/use-cart";
import { dispatchCartUpdated } from "@/hooks/use-cart";

export default function CartPageClient() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const sessionId = searchParams.get("sessionId");
  const [cart, setCart] = useState<CartState | null>(null);
  const [merchantName, setMerchantName] = useState("Northline Audio");
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!sessionId) {
      setCart(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const response = await fetch(`/api/cart?sessionId=${encodeURIComponent(sessionId)}`, {
        credentials: "include",
      });
      if (response.ok) {
        const payload = (await response.json()) as { cart: CartState };
        setCart(payload.cart);
      }
    } finally {
      setLoading(false);
    }
  }, [sessionId]);

  useEffect(() => {
    void refresh();
    async function loadMerchant() {
      const response = await fetch("/api/desk/context");
      if (!response.ok) return;
      const payload = (await response.json()) as { merchant: { name: string } };
      setMerchantName(payload.merchant.name);
    }
    void loadMerchant();
  }, [refresh]);

  async function updateQuantity(lineId: string, quantity: number) {
    if (!sessionId) return;
    const response = await fetch("/api/cart", {
      method: "PATCH",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId, lineId, quantity }),
    });
    if (response.ok) {
      const payload = (await response.json()) as { cart: CartState };
      setCart(payload.cart);
      dispatchCartUpdated();
    }
  }

  async function removeLine(lineId: string) {
    if (!sessionId) return;
    const response = await fetch("/api/cart", {
      method: "DELETE",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId, lineId }),
    });
    if (response.ok) {
      const payload = (await response.json()) as { cart: CartState };
      setCart(payload.cart);
      dispatchCartUpdated();
    }
  }

  async function clearAll() {
    if (!sessionId) return;
    const response = await fetch("/api/cart", {
      method: "DELETE",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId, clear: true }),
    });
    if (response.ok) {
      const payload = (await response.json()) as { cart: CartState };
      setCart(payload.cart);
      dispatchCartUpdated();
    }
  }

  const isEmpty = !cart || cart.lines.length === 0;

  return (
    <DeskShell merchantName={merchantName} sessionId={sessionId}>
      <div className="mx-auto max-w-3xl" data-testid="cart-page">
        <h1 className="text-2xl font-semibold tracking-tight">Your cart</h1>
        <p className="mt-1 text-sm text-muted">Items you explicitly added from the Northline catalog.</p>

        {loading ? (
          <p className="mt-8 text-sm text-muted">Loading cart…</p>
        ) : isEmpty ? (
          <div className="rf-desk-empty-state mt-10" data-testid="empty-cart">
            <p className="text-base font-medium text-ink">Your cart is empty</p>
            <p className="max-w-[36ch] text-sm text-muted">
              Find something you like from the Northline catalog.
            </p>
            <Link
              href="/desk"
              className="rf-btn rf-motion-colors mt-4 inline-flex min-h-10 items-center rounded-[8px] bg-accent px-4 text-sm font-medium text-white hover:bg-accent-hover"
            >
              Browse products
            </Link>
          </div>
        ) : (
          <>
            <ul className="mt-6 space-y-4">
              {cart.lines.map((line) => (
                <li
                  key={line.id}
                  className="flex gap-4 rounded-[12px] border border-line/70 bg-surface p-4"
                  data-testid={`cart-line-${line.sku}`}
                >
                  <Image
                    src={line.image}
                    alt={line.imageAlt}
                    width={80}
                    height={80}
                    className="size-20 rounded-[8px] bg-canvas-2 object-cover"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="font-medium" translate="no">
                      {line.name}
                    </p>
                    <p className="mt-1 text-sm text-muted tabular">
                      <Money value={line.unitPrice} /> each
                    </p>
                    <div className="mt-3 flex flex-wrap items-center gap-3">
                      <div className="inline-flex items-center rounded-[8px] border border-line">
                        <button
                          type="button"
                          aria-label="Decrease quantity"
                          className="min-h-9 min-w-9 px-2 text-ink-soft hover:text-ink"
                          onClick={() => void updateQuantity(line.id, Math.max(1, line.quantity - 1))}
                        >
                          <Minus className="size-4" aria-hidden />
                        </button>
                        <span className="min-w-8 text-center text-sm font-medium tabular">{line.quantity}</span>
                        <button
                          type="button"
                          aria-label="Increase quantity"
                          className="min-h-9 min-w-9 px-2 text-ink-soft hover:text-ink"
                          disabled={line.quantity >= line.inventory}
                          onClick={() => void updateQuantity(line.id, line.quantity + 1)}
                        >
                          <Plus className="size-4" aria-hidden />
                        </button>
                      </div>
                      <button
                        type="button"
                        data-testid={`remove-${line.sku}`}
                        className="inline-flex min-h-9 items-center gap-1 text-sm text-danger hover:underline"
                        onClick={() => void removeLine(line.id)}
                      >
                        <Trash className="size-4" aria-hidden />
                        Remove
                      </button>
                    </div>
                  </div>
                  <p className="shrink-0 text-lg font-semibold tabular">
                    <Money value={line.lineTotal} />
                  </p>
                </li>
              ))}
            </ul>

            <div className="mt-6 border-t border-line/60 pt-4">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted">Subtotal</span>
                <span className="font-medium tabular" data-testid="cart-subtotal">
                  <Money value={cart.subtotal} />
                </span>
              </div>
              <div className="mt-2 flex items-center justify-between">
                <span className="text-base font-medium">Total</span>
                <span className="text-2xl font-semibold tabular" data-testid="cart-total">
                  <Money value={cart.subtotal} />
                </span>
              </div>
            </div>

            <div className="mt-6 flex flex-col gap-2 sm:flex-row">
              <Button type="button" variant="secondary" className="flex-1" onClick={() => router.push("/desk")}>
                Continue shopping
              </Button>
              <Button
                type="button"
                data-testid="proceed-checkout"
                className="flex-1"
                onClick={() => router.push(`/desk?sessionId=${encodeURIComponent(sessionId!)}&checkout=cart`)}
              >
                Proceed to checkout
              </Button>
              <Button type="button" variant="secondary" onClick={() => void clearAll()}>
                Clear cart
              </Button>
            </div>
          </>
        )}
      </div>
    </DeskShell>
  );
}
