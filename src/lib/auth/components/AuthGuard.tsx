"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

import { APP_ROUTES } from "@/constants";
import { AUTH_UI } from "@/constants/auth";

import { PageSkeleton } from "@/components/shared/PageSkeleton";
import { Button } from "@/components/ui/button";

import { useAuthLifecycle } from "../use-auth-lifecycle";

import type { ReactNode } from "react";

/** Client gate only. Backend APIs remain the authority for session validity. */
export function AuthGuard({ children }: { children: ReactNode }) {
  const router = useRouter();
  const { status, isAuthenticated, bootstrapError, retry } = useAuthLifecycle();

  useEffect(() => {
    if (status === "unauthenticated") router.replace(APP_ROUTES.login);
  }, [status, router]);

  if (!isAuthenticated) {
    return (
      <main className="bg-bg-base min-h-screen p-[var(--card-pad)]">
        {bootstrapError && (
          <div role="alert">
            {bootstrapError}
            <Button onClick={retry}>{AUTH_UI.retry}</Button>
          </div>
        )}
        <PageSkeleton />
      </main>
    );
  }
  return children;
}
