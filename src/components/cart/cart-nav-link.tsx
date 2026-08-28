"use client";

import { ShoppingCart } from "@phosphor-icons/react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { dispatchCartUpdated } from "@/hooks/use-cart";

type CartNavLinkProps = {
  sessionId?: string | null;
};

export function CartNavLink({ sessionId = null }: CartNavLinkProps) {
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

  const href = sessionId ? `/cart?sessionId=${encodeURIComponent(sessionId)}` : "/cart";

  return (
    <Link
      href={href}
      data-testid="cart-nav-link"
      className="rf-workspace-switch rf-motion-colors relative inline-flex min-h-9 items-center gap-1.5 rounded-[8px] border border-line/70 bg-surface px-3 text-sm text-ink-soft hover:text-ink"
    >
      <ShoppingCart className="size-4" aria-hidden />
      <span className="hidden sm:inline">Cart</span>
      {itemCount > 0 ? (
        <span
          data-testid="cart-badge"
          className="inline-flex min-w-5 items-center justify-center rounded-full bg-accent px-1.5 py-0.5 text-[11px] font-medium text-white"
        >
          {itemCount}
        </span>
      ) : null}
    </Link>
  );
}

export { dispatchCartUpdated };
