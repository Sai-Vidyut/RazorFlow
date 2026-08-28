"use client";

import { ShoppingCart } from "@phosphor-icons/react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

type CartIndicatorProps = {
  sessionId?: string | null;
};

function scrollToTransactionCart() {
  const rail = document.querySelector('[data-testid="transaction-rail"]');
  if (rail) {
    rail.scrollIntoView({ behavior: "smooth", block: "nearest" });
    const cartSection = document.querySelector('[data-testid="transaction-cart"]');
    if (cartSection instanceof HTMLElement) {
      window.setTimeout(() => cartSection.focus({ preventScroll: true }), 300);
    }
  }
}

export function CartIndicator({ sessionId = null }: CartIndicatorProps) {
  const pathname = usePathname();
  const onDesk = pathname === "/desk" || pathname.startsWith("/desk/");
  const [itemCount, setItemCount] = useState(0);

  useEffect(() => {
    async function loadCount() {
      if (!sessionId) {
        setItemCount(0);
        return;
      }
      try {
        const response = await fetch(`/api/cart?sessionId=${encodeURIComponent(sessionId)}`, {
          credentials: "include",
        });
        if (!response.ok) return;
        const payload = (await response.json()) as { cart: { itemCount: number } };
        setItemCount(payload.cart.itemCount);
      } catch {
        setItemCount(0);
      }
    }

    void loadCount();
    const handler = () => void loadCount();
    window.addEventListener("razorflow:cart-updated", handler);
    return () => window.removeEventListener("razorflow:cart-updated", handler);
  }, [sessionId]);

  const badge =
    itemCount > 0 ? (
      <span
        data-testid="cart-badge"
        className="inline-flex min-w-5 items-center justify-center rounded-full bg-accent px-1.5 py-0.5 text-[11px] font-medium text-white"
      >
        {itemCount}
      </span>
    ) : null;

  if (onDesk) {
    return (
      <button
        type="button"
        data-testid="cart-indicator"
        aria-label={itemCount > 0 ? `${itemCount} items in cart. Scroll to cart.` : "Cart empty. Scroll to cart."}
        className="rf-workspace-switch rf-motion-colors relative inline-flex min-h-9 items-center gap-1.5 rounded-[8px] border border-line/70 bg-surface px-3 text-sm text-ink-soft hover:text-ink"
        onClick={scrollToTransactionCart}
      >
        <ShoppingCart className="size-4" aria-hidden />
        <span className="hidden sm:inline">Cart</span>
        {badge}
      </button>
    );
  }

  return (
    <Link
      href="/desk"
      data-testid="cart-indicator"
      aria-label={itemCount > 0 ? `${itemCount} items in cart. Open desk.` : "Open desk cart."}
      className="rf-workspace-switch rf-motion-colors relative inline-flex min-h-9 items-center gap-1.5 rounded-[8px] border border-line/70 bg-surface px-3 text-sm text-ink-soft hover:text-ink"
    >
      <ShoppingCart className="size-4" aria-hidden />
      <span className="hidden sm:inline">Cart</span>
      {badge}
    </Link>
  );
}
