"use client";

import { PERMISSION_UI } from "@/constants/permissions";

import { ApiError } from "@/lib/api/error";
import { useAuthStore } from "@/lib/auth/auth-store";
import { hasPermission, useMyPermissions } from "@/lib/auth/me-permissions";

import { PageSkeleton } from "@/components/shared/PageSkeleton";
import { Button } from "@/components/ui/button";

import type { ReactNode } from "react";
import type { PermissionCode } from "@/lib/auth/me-permissions";

/** Local page UX; AuthGuard owns 401 navigation, Spring owns enforcement. */
export function PermissionBoundary({
  permissions,
  children,
  variant = "detail",
}: {
  permissions: readonly PermissionCode[];
  children: ReactNode;
  variant?: "list" | "detail";
}) {
  const authenticated = useAuthStore((state) => state.status === "authenticated");
  const query = useMyPermissions();
  if (!authenticated || query.isPending) return <PageSkeleton variant={variant} />;
  if (query.isError && !(query.error instanceof ApiError && query.error.status === 403))
    return (
      <section role="alert" className="space-y-4 p-[var(--card-pad)]">
        <h2 className="text-ink-primary font-semibold">{PERMISSION_UI.errorTitle}</h2>
        <Button onClick={() => void query.refetch()}>{PERMISSION_UI.retry}</Button>
      </section>
    );
  if (query.isError || !permissions.every((code) => hasPermission(query.data, code)))
    return (
      <section role="alert" className="space-y-4 p-[var(--card-pad)]">
        <h2 className="text-ink-primary font-semibold">{PERMISSION_UI.deniedTitle}</h2>
        <p className="text-ink-secondary">{PERMISSION_UI.deniedDescription}</p>
      </section>
    );
  return children;
}
