import { AUTH_UI } from "@/constants/auth";

import { ApiError } from "@/lib/api/error";

import { getCurrentUserApi } from "./auth-api";
import { getAuthRevision, useAuthStore } from "./auth-store";

let pending: Promise<void> | null = null;
let generation = 0;
let queued = false;

/** Deduplicate bootstrap, and discard responses superseded by login/logout/events. */
export function bootstrapSession(force = false): Promise<void> {
  if (pending) {
    if (force) {
      generation++;
      queued = true;
      useAuthStore.getState().beginBootstrap();
    }
    return pending;
  }
  const currentGeneration = ++generation;
  const revision = getAuthRevision();
  const store = useAuthStore.getState();
  store.beginBootstrap();
  const isCurrent = () => generation === currentGeneration && getAuthRevision() === revision;
  pending = (async () => {
    try {
      const user = await getCurrentUserApi();
      if (isCurrent()) store.login(user, false);
    } catch (error: unknown) {
      if (!isCurrent()) return;
      if (error instanceof ApiError && error.status === 401) store.logout(false);
      else store.failBootstrap(AUTH_UI.bootstrapError);
    }
  })().finally(() => {
    pending = null;
    if (queued) {
      queued = false;
      if (useAuthStore.getState().status === "unknown") void bootstrapSession();
    }
  });
  return pending;
}
