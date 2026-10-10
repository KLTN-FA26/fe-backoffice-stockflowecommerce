import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { IDENTITY_PERMISSIONS, SUPPLIER_PERMISSIONS } from "@/constants/permissions";

import { api } from "@/lib/api/client";
import { ApiError } from "@/lib/api/error";
import { useAuthStore } from "@/lib/auth/auth-store";
import { meKeys } from "@/lib/auth/me-permissions";

import { NAV_GROUPS, useCanSeeNavItem } from "./BackofficeShell";

function Navigation() {
  const canSee = useCanSeeNavItem();
  return (
    <nav>
      {NAV_GROUPS.flatMap((group) => group.items)
        .filter(canSee)
        .map((item) => (
          <a key={item.href} href={item.href}>
            {item.label}
          </a>
        ))}
    </nav>
  );
}
let client: QueryClient;
beforeEach(() => {
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  useAuthStore.getState().login(
    {
      userId: "nav-user",
      username: "staff",
      fullName: null,
      email: "staff@example.com",
      roles: ["ROLE_SYSTEM_ADMIN"],
      status: "ACTIVE",
      lastLoginAt: null,
    },
    false,
  );
});
afterEach(() => {
  cleanup();
  client.clear();
  useAuthStore.getState().logout(false);
  vi.restoreAllMocks();
});
const mount = () =>
  render(
    <QueryClientProvider client={client}>
      <Navigation />
    </QueryClientProvider>,
  );

describe("declared navigation permissions", () => {
  it("does not flash gated navigation while unresolved; ungated items remain visible", async () => {
    vi.spyOn(api, "get").mockResolvedValue({
      data: { roles: [], permissions: [SUPPLIER_PERMISSIONS.viewPage], dataScope: "ALL" },
    });
    mount();
    for (const name of ["Nhà cung cấp", "Đơn đặt NCC", "Đơn hàng", "Phân quyền"])
      expect(screen.queryByRole("link", { name })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Tổng quan" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Sản phẩm & SKU" })).toBeInTheDocument();
    expect(await screen.findByRole("link", { name: "Nhà cung cấp" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Đơn đặt NCC" })).not.toBeInTheDocument();
  });
  it("query errors hide required entries without hiding ungated entries", async () => {
    vi.spyOn(api, "get").mockRejectedValue(new ApiError(503, "UNAVAILABLE", "Unavailable"));
    mount();
    await waitFor(() =>
      expect(
        client.getQueryState(
          meKeys.sessionPermissions("nav-user", useAuthStore.getState().authorizationVersion),
        )?.status,
      ).toBe("error"),
    );
    expect(screen.queryByRole("link", { name: "Nhà cung cấp" })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Tổng quan" })).toBeInTheDocument();
  });
  it("read-only RBAC navigation uses the real backend READ capability", async () => {
    vi.spyOn(api, "get").mockResolvedValue({
      data: { roles: [], permissions: [IDENTITY_PERMISSIONS.rbacRead], dataScope: "ALL" },
    });
    mount();
    expect(await screen.findByRole("link", { name: "Phân quyền" })).toBeInTheDocument();
  });
});
