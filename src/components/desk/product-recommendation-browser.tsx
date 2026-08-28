"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { CaretLeft, CaretRight } from "@phosphor-icons/react";
import { AddToCartButton } from "@/components/cart/add-to-cart-button";
import { Money } from "@/components/money";
import type { AgentResult, Product } from "@/lib/agent/types";

type ProductRecommendationBrowserProps = {
  result: AgentResult;
  sessionId: string | null;
  cartSkus: Set<string>;
  onCartChange?: () => void;
};

export function ProductRecommendationBrowser({
  result,
  sessionId,
  cartSkus,
  onCartChange,
}: ProductRecommendationBrowserProps) {
  const reduce = useReducedMotion();
  const products = result.results;
  const [index, setIndex] = useState(0);

  useEffect(() => {
    setIndex(0);
  }, [result.primary?.sku, products.length, result.intent.query]);

  if (products.length === 0 || !products[index]) {
    return null;
  }

  const current = products[index]!;
  const total = products.length;
  const isFirst = index === 0;
  const isLast = index === total - 1;
  const summary = result.discoverySummary;
  const inCart = cartSkus.has(current.sku);

  return (
    <div className="flex min-h-[22rem] flex-col" data-testid="product-recommendation-browser">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-medium text-ink" data-testid="option-indicator">
          Option {index + 1} of {total}
        </p>
        {summary && summary.requestedCount != null && summary.returnedCount < summary.requestedCount ? (
          <p className="text-xs text-muted" data-testid="partial-match-notice">
            {summary.returnedCount} matching option{summary.returnedCount === 1 ? "" : "s"} found
          </p>
        ) : null}
      </div>

      <p className="mt-2 text-sm text-muted">{result.explanations[0]?.reason}</p>

      <div className="relative mt-4 flex-1">
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={current.sku}
            data-active-sku={current.sku}
            initial={reduce ? false : { opacity: 0, x: 12 }}
            animate={{ opacity: 1, x: 0 }}
            exit={reduce ? undefined : { opacity: 0, x: -12 }}
            transition={{ duration: reduce ? 0 : 0.22, ease: [0.33, 1, 0.68, 1] }}
            className="flex h-full flex-col"
          >
            <article className="flex flex-col items-center text-center sm:flex-row sm:items-start sm:text-left">
              <Image
                src={current.image}
                alt={current.imageAlt}
                width={128}
                height={128}
                className="size-28 shrink-0 rounded-[12px] bg-canvas-2 object-cover"
              />
              <div className="mt-4 min-w-0 sm:mt-0 sm:ml-4">
                <h3
                  className="text-xl font-semibold tracking-tight"
                  translate="no"
                  data-testid="product-name"
                >
                  {current.name}
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-muted">{current.blurb}</p>
                <p className="mt-3 text-2xl font-semibold text-accent tabular">
                  <Money value={current.price} />
                </p>
                <div className="mt-4">
                  <AddToCartButton
                    key={current.sku}
                    sessionId={sessionId}
                    sku={current.sku}
                    inCart={inCart}
                    onAdded={onCartChange}
                  />
                </div>
              </div>
            </article>
          </motion.div>
        </AnimatePresence>
      </div>

      <div className="mt-auto flex flex-col gap-3 border-t border-line/60 pt-4">
        <div className="flex items-center justify-between gap-3">
          <button
            type="button"
            data-testid="previous-product"
            disabled={isFirst}
            onClick={() => setIndex((value) => Math.max(0, value - 1))}
            className="rf-btn rf-motion-colors inline-flex min-h-10 items-center gap-1.5 rounded-[8px] border border-line px-3 text-sm text-ink-soft hover:text-ink disabled:cursor-not-allowed disabled:opacity-40"
          >
            <CaretLeft className="size-4" aria-hidden />
            Previous
          </button>
          {!isLast ? (
            <button
              type="button"
              data-testid="next-product"
              onClick={() => setIndex((value) => Math.min(total - 1, value + 1))}
              className="rf-btn rf-motion-colors inline-flex min-h-10 items-center gap-1.5 rounded-[8px] border border-line bg-surface px-3 text-sm font-medium text-ink hover:border-accent hover:text-accent"
            >
              Next product
              <CaretRight className="size-4" aria-hidden />
            </button>
          ) : (
            <p className="text-sm text-muted" data-testid="no-more-options">
              That&apos;s all the matching options.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

export function isSequentialBrowseMode(result: AgentResult): boolean {
  return result.results.length > 1;
}
