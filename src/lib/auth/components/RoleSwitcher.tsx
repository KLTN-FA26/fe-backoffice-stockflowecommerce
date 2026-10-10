/**
 * RoleSwitcher — dev/demo toolbar for impersonating roles.
 *
 * Only visible when the app is running in mock mode (server-derived flag,
 * see `useIsMock` in `providers/app-providers.tsx`).
 * Renders a floating dropdown in the bottom-right corner.
 * Changes display context only; it cannot grant any backend capability.
 */

"use client";

import React, { useState } from "react";
import { PERMISSION_UI } from "@/constants/permissions";

import { useIsMock } from "@/providers/app-providers";
import { useAuthStore } from "../auth-store";
import { ROLES, type RoleName } from "../roles";

const ROLE_LABELS: Record<RoleName, string> = {
  "System Admin": "🔑 System Admin",
  "Procurement Staff": "📦 Procurement Staff",
  "Warehouse Staff": "🏭 Warehouse Staff",
  "Warehouse Manager": "👷 Warehouse Manager",
  "Inventory Planner": "📊 Inventory Planner",
  "QC Staff": "🔍 QC Staff",
  Accountant: "💰 Accountant",
  "E-commerce Admin": "🛒 E-commerce Admin",
  "Sales Staff": "💼 Sales Staff",
  "Order Coordinator": "📋 Order Coordinator",
};

export function RoleSwitcher() {
  const [open, setOpen] = useState(false);
  const isMock = useIsMock();

  const user = useAuthStore((s) => s.user);
  const impersonatedRole = useAuthStore((s) => s.impersonatedRole);
  const setImpersonatedRole = useAuthStore((s) => s.setImpersonatedRole);
  const effectiveRoles = useAuthStore((s) => s.effectiveRoles);

  // Only show in mock mode
  if (!isMock) return null;
  if (!user) return null;

  const currentRoles = effectiveRoles();
  const currentLabel = impersonatedRole
    ? ROLE_LABELS[impersonatedRole]
    : `${user.roles.map((r) => r).join(", ")}`;

  return (
    <div className="fixed right-4 bottom-4 z-50">
      {/* Toggle button */}
      <button
        onClick={() => setOpen(!open)}
        className="border-border-default bg-bg-surface text-text-primary hover:bg-bg-subtle flex items-center gap-2 rounded-lg border px-3 py-2 text-xs font-medium shadow-lg transition-colors"
        title="Role Switcher (Dev Mode)"
      >
        <span className="bg-warning inline-block h-2 w-2 rounded-full" />
        <span className="max-w-[200px] truncate">
          {impersonatedRole ? `⚡ ${currentLabel}` : currentLabel}
        </span>
      </button>

      {/* Dropdown */}
      {open && (
        <div className="border-border-default bg-bg-surface absolute right-0 bottom-full mb-2 w-64 rounded-lg border py-1 shadow-xl">
          <div className="border-border-default border-b px-3 py-2">
            <p className="text-text-primary text-xs font-semibold">Role Switcher</p>
            <p className="text-text-muted text-xs">{PERMISSION_UI.demoContext}</p>
            <p className="text-text-muted text-[10px]">Đang đăng nhập: {user.fullName}</p>
            <p className="text-text-muted text-[10px]">Roles gốc: {user.roles.join(", ")}</p>
          </div>

          {/* Reset to original */}
          <button
            onClick={() => {
              setImpersonatedRole(null);
              setOpen(false);
            }}
            className={`hover:bg-bg-subtle flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs transition-colors ${
              !impersonatedRole ? "bg-accent/10 text-accent font-semibold" : "text-text-secondary"
            }`}
          >
            <span className="bg-positive h-1.5 w-1.5 rounded-full" />
            Roles gốc ({user.roles.join(", ")})
          </button>

          <div className="border-border-default my-1 border-t" />

          {/* Role list */}
          {ROLES.map((role) => (
            <button
              key={role}
              onClick={() => {
                setImpersonatedRole(role);
                setOpen(false);
              }}
              className={`hover:bg-bg-subtle flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs transition-colors ${
                impersonatedRole === role
                  ? "bg-accent/10 text-accent font-semibold"
                  : "text-text-secondary"
              }`}
            >
              <span
                className={`h-1.5 w-1.5 rounded-full ${
                  currentRoles.includes(role) ? "bg-accent" : "bg-border-default"
                }`}
              />
              {ROLE_LABELS[role]}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
