"use client";

import { useEffect, useState } from "react";

const COLLAPSE_AFTER = 48;
const EXPAND_BEFORE = 12;
const SCROLL_DELTA = 6;

export function useScrollCollapse(enabled = true) {
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    if (!enabled) {
      setCollapsed(false);
      return;
    }

    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let lastY = window.scrollY;
    let ticking = false;

    function update() {
      if (document.body.classList.contains("rf-scroll-lock")) {
        ticking = false;
        return;
      }

      const y = window.scrollY;
      if (y > COLLAPSE_AFTER && y > lastY + SCROLL_DELTA) {
        setCollapsed(true);
      } else if (y < EXPAND_BEFORE || y < lastY - SCROLL_DELTA) {
        setCollapsed(false);
      }
      lastY = y;
      ticking = false;
    }

    function onScroll() {
      if (reducedMotion) {
        setCollapsed(window.scrollY > COLLAPSE_AFTER);
        return;
      }
      if (ticking) return;
      ticking = true;
      window.requestAnimationFrame(update);
    }

    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [enabled]);

  return collapsed;
}
