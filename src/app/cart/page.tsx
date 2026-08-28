import { Suspense } from "react";
import CartPageClient from "./cart-client";

export default function CartPage() {
  return (
    <Suspense fallback={<div className="p-6 text-sm text-muted">Loading cart…</div>}>
      <CartPageClient />
    </Suspense>
  );
}
