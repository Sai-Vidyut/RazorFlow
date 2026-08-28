"use client";

import { Check, ShoppingCartSimple } from "@phosphor-icons/react";
import { useState } from "react";
import { dispatchCartUpdated } from "@/hooks/use-cart";

type AddToCartButtonProps = {
  sessionId: string | null;
  sku: string;
  label?: string;
  className?: string;
  inCart?: boolean;
  onAdded?: () => void;
};

export function AddToCartButton({
  sessionId,
  sku,
  label = "Add to cart",
  className = "",
  inCart = false,
  onAdded,
}: AddToCartButtonProps) {
  const [state, setState] = useState<"idle" | "loading" | "added">("idle");

  async function handleClick() {
    if (!sessionId || state === "loading" || inCart) return;
    setState("loading");
    try {
      const response = await fetch("/api/cart", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId, sku, quantity: 1 }),
      });
      if (!response.ok) {
        setState("idle");
        return;
      }
      setState("added");
      dispatchCartUpdated();
      onAdded?.();
      window.setTimeout(() => setState("idle"), 2000);
    } catch {
      setState("idle");
    }
  }

  const showAdded = inCart || state === "added";
  const disabled = !sessionId || state === "loading" || inCart;

  return (
    <button
      type="button"
      data-testid={`add-to-cart-${sku}`}
      disabled={disabled}
      onClick={() => void handleClick()}
      className={`rf-btn rf-motion-colors inline-flex min-h-10 items-center justify-center gap-2 rounded-[8px] border border-line bg-surface px-3 text-sm font-medium text-ink hover:border-accent hover:text-accent disabled:opacity-50 ${className}`}
    >
      {showAdded ? (
        <>
          <Check className="size-4 text-success" aria-hidden />
          Added to cart
        </>
      ) : (
        <>
          <ShoppingCartSimple className="size-4" aria-hidden />
          {state === "loading" ? "Adding…" : label}
        </>
      )}
    </button>
  );
}
