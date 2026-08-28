"use client";

import { useEffect } from "react";

const LOCK_CLASS = "rf-scroll-lock";

export function useBodyScrollLock(active: boolean) {
  useEffect(() => {
    if (!active) return;

    const { body } = document;
    const previousOverflow = body.style.overflow;
    const previousPaddingRight = body.style.paddingRight;
    const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth;

    body.classList.add(LOCK_CLASS);
    body.style.overflow = "hidden";
    if (scrollbarWidth > 0) {
      body.style.paddingRight = `${scrollbarWidth}px`;
    }

    return () => {
      body.classList.remove(LOCK_CLASS);
      body.style.overflow = previousOverflow;
      body.style.paddingRight = previousPaddingRight;
    };
  }, [active]);
}
