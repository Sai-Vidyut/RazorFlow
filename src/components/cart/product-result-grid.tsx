"use client";

import Image from "next/image";
import type { Product } from "@/lib/agent/types";
import { AddToCartButton } from "@/components/cart/add-to-cart-button";
import { Money } from "@/components/money";

type ProductResultGridProps = {
  products: Product[];
  sessionId: string | null;
  onAdded?: () => void;
};

export function ProductResultGrid({ products, sessionId, onAdded }: ProductResultGridProps) {
  if (products.length === 0) return null;

  return (
    <div className="mt-6 grid gap-4 sm:grid-cols-2" data-testid="product-results">
      {products.map((product) => (
        <article
          key={product.sku}
          className="flex flex-col rounded-[12px] border border-line/70 bg-canvas-2/30 p-4"
          data-testid={`product-card-${product.sku}`}
        >
          <Image
            src={product.image}
            alt={product.imageAlt}
            width={96}
            height={96}
            className="size-20 rounded-[8px] bg-canvas-2 object-cover"
          />
          <h4 className="mt-3 text-base font-semibold tracking-tight" translate="no">
            {product.name}
          </h4>
          <p className="mt-1 line-clamp-2 text-sm text-muted">{product.blurb}</p>
          <p className="mt-3 text-lg font-semibold text-accent tabular">
            <Money value={product.price} />
          </p>
          <div className="mt-auto pt-4">
            <AddToCartButton
              sessionId={sessionId}
              sku={product.sku}
              onAdded={onAdded}
              className="w-full"
            />
          </div>
        </article>
      ))}
    </div>
  );
}
