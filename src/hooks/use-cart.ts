"use client";

import { useCallback, useEffect, useState } from "react";

export type CartLine = {
  id: string;
  productId: string;
  sku: string;
  name: string;
  blurb: string;
  image: string;
  imageAlt: string;
  unitPrice: number;
  quantity: number;
  lineTotal: number;
  inventory: number;
};

export type CartState = {
  sessionId: string;
  lines: CartLine[];
  itemCount: number;
  subtotal: number;
};

const EMPTY_CART: CartState = {
  sessionId: "",
  lines: [],
  itemCount: 0,
  subtotal: 0,
};

export function dispatchCartUpdated() {
  window.dispatchEvent(new Event("razorflow:cart-updated"));
}

export function useCart(sessionId: string | null) {
  const [cart, setCart] = useState<CartState>(EMPTY_CART);
  const [loading, setLoading] = useState(false);
  const [addedSku, setAddedSku] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!sessionId) {
      setCart(EMPTY_CART);
      return;
    }
    setLoading(true);
    try {
      const response = await fetch(`/api/cart?sessionId=${encodeURIComponent(sessionId)}`, {
        credentials: "include",
      });
      if (!response.ok) return;
      const payload = (await response.json()) as { cart: CartState };
      setCart(payload.cart);
    } finally {
      setLoading(false);
    }
  }, [sessionId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    const handler = () => void refresh();
    window.addEventListener("razorflow:cart-updated", handler);
    return () => window.removeEventListener("razorflow:cart-updated", handler);
  }, [refresh]);

  async function addSku(sku: string, quantity = 1) {
    if (!sessionId) return false;
    const response = await fetch("/api/cart", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId, sku, quantity }),
    });
    if (!response.ok) return false;
    const payload = (await response.json()) as { cart: CartState };
    setCart(payload.cart);
    setAddedSku(sku);
    dispatchCartUpdated();
    window.setTimeout(() => setAddedSku(null), 2000);
    return true;
  }

  return { cart, loading, addedSku, refresh, addSku };
}
