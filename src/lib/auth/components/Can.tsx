"use client";

import { useCallback } from "react";

import { useAuthStore } from "../auth-store";
import { hasPermission, useMyPermissions } from "../me-permissions";

import type { ReactNode } from "react";
import type { PermissionCode } from "../me-permissions";

/** UX gating only. The backend checks every operation independently. */
export function Can({
  permission,
  fallback = null,
  children,
}: {
  permission: PermissionCode;
  fallback?: ReactNode;
  children: ReactNode;
}) {
  return useCan(permission) ? <>{children}</> : <>{fallback}</>;
}

export function useCan(permission: PermissionCode): boolean {
  return usePermissionChecker()(permission);
}

export function usePermissionChecker(): (code: PermissionCode) => boolean {
  const authenticated = useAuthStore(
    (state) => state.status === "authenticated" && state.user !== null,
  );
  const { data, isSuccess } = useMyPermissions();
  return useCallback(
    (code: PermissionCode) => authenticated && isSuccess && hasPermission(data, code),
    [authenticated, data, isSuccess],
  );
}
