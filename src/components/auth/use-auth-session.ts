"use client";

import { useCallback, useEffect, useState } from "react";
import type { BuyerCapability } from "@/lib/auth/capability";

export type AuthSessionState = {
  loading: boolean;
  authenticated: boolean;
  email: string | null;
  emailVerified: boolean;
  capability: BuyerCapability;
  accountId: string | null;
};

const defaultState: AuthSessionState = {
  loading: true,
  authenticated: false,
  email: null,
  emailVerified: false,
  capability: "anonymous",
  accountId: null,
};

export function useAuthSession() {
  const [state, setState] = useState<AuthSessionState>(defaultState);

  const refresh = useCallback(async () => {
    try {
      const response = await fetch("/api/auth/session", { credentials: "include" });
      if (!response.ok) {
        setState({ ...defaultState, loading: false });
        return;
      }
      const payload = (await response.json()) as {
        authenticated?: boolean;
        account?: { id: string; email: string; emailVerified: boolean; capability: BuyerCapability } | null;
        email?: string | null;
        emailVerified?: boolean;
        capability?: BuyerCapability;
      };

      setState({
        loading: false,
        authenticated: Boolean(payload.authenticated),
        email: payload.account?.email ?? payload.email ?? null,
        emailVerified: payload.account?.emailVerified ?? payload.emailVerified ?? false,
        capability: payload.account?.capability ?? payload.capability ?? "anonymous",
        accountId: payload.account?.id ?? null,
      });
    } catch {
      setState({ ...defaultState, loading: false });
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    function onAuthChanged() {
      void refresh();
    }
    window.addEventListener("razorflow:auth-changed", onAuthChanged);
    return () => window.removeEventListener("razorflow:auth-changed", onAuthChanged);
  }, [refresh]);

  const logout = useCallback(async () => {
    await fetch("/api/auth/logout", { method: "POST", credentials: "include" });
    await refresh();
  }, [refresh]);

  return { ...state, refresh, logout };
}
