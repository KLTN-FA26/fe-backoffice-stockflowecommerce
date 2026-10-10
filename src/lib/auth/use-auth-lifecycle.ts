"use client";

import { useEffect } from "react";

import { subscribeAuthEvents } from "./auth-events";
import { bootstrapSession } from "./auth-session";
import { discardLegacyAuthState, useAuthStore } from "./auth-store";

/** Every fresh browser session is verified by the BFF, never by a cached identity. */
export function useAuthLifecycle() {
  const status = useAuthStore((state) => state.status);
  const isAuthenticated = useAuthStore(
    (state) => state.status === "authenticated" && state.user !== null,
  );
  const bootstrapError = useAuthStore((state) => state.bootstrapError);
  useEffect(() => {
    discardLegacyAuthState();
    const reconcile = () => {
      void bootstrapSession(true);
    };
    const unsubscribe = subscribeAuthEvents(reconcile);
    window.addEventListener("focus", reconcile);
    if (useAuthStore.getState().status === "unknown") void bootstrapSession();
    return () => {
      unsubscribe();
      window.removeEventListener("focus", reconcile);
    };
  }, []);
  return {
    status,
    isAuthenticated,
    bootstrapError,
    retry: () => {
      void bootstrapSession(true);
    },
  };
}
