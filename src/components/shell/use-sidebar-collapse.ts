"use client";

import { useCallback, useLayoutEffect, useState } from "react";

const STORAGE_KEY = "razorflow-admin-sidebar-collapsed";

export function useSidebarCollapse() {
  const [collapsed, setCollapsed] = useState(false);
  const [ready, setReady] = useState(false);

  useLayoutEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored === "true") {
        setCollapsed(true);
      }
    } catch {
      /* localStorage unavailable */
    }
    setReady(true);
  }, []);

  const toggle = useCallback(() => {
    setCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(STORAGE_KEY, String(next));
      } catch {
        /* localStorage unavailable */
      }
      return next;
    });
  }, []);

  return { collapsed, toggle, ready };
}
