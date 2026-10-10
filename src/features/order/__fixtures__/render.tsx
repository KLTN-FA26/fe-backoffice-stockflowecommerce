/**
 * Render màn đơn hàng trong test với API giả lập theo URL — đi qua đúng chuỗi thật:
 * `/identity/me/permissions` → usePermissionChecker → UI. Quyền giả lập theo MÃ QUYỀN BE.
 */

import { Suspense } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render } from "@testing-library/react";
import { NuqsTestingAdapter } from "nuqs/adapters/testing";
import { vi } from "vitest";

import { ORDER_PERMISSIONS } from "@/constants";
import { api } from "@/lib/api/client";
import { useAuthStore } from "@/lib/auth/auth-store";

import type { PermissionCode } from "@/lib/auth";

/** Theo seed BE: ORDER_COORDINATOR có APPROVE; SALES_STAFF chỉ VIEW_PAGE/READ/CREATE/UPDATE. */
export const ORDER_PERMISSION_SETS = {
  // WAREHOUSE_STAFF: không có quyền sales-orders nào
  none: [],
  viewOnly: ["sales-orders:VIEW_PAGE"],
  salesStaff: ["sales-orders:VIEW_PAGE", "sales-orders:READ"],
  coordinator: ["sales-orders:VIEW_PAGE", "sales-orders:READ", ORDER_PERMISSIONS.cancel],
} satisfies Record<string, PermissionCode[]>;

/** Handler theo path: trả data, hoặc throw (vd ApiError) để giả lập lỗi. */
export type RouteHandler = (params: URLSearchParams | undefined) => unknown;

export function mockOrderApiGet(
  permissions: readonly PermissionCode[],
  routes: Record<string, RouteHandler>,
) {
  return vi
    .spyOn(api, "get")
    .mockImplementation(async (url: string, config?: { params?: unknown }) => {
      if (url === "/identity/me/permissions") {
        return { data: { roles: ["TEST"], permissions: [...permissions], dataScope: "ALL" } };
      }
      const handler = routes[url];
      if (!handler) throw new Error(`Không có mock cho GET ${url}`);
      const params = config?.params instanceof URLSearchParams ? config.params : undefined;
      return { data: handler(params) };
    });
}

export function renderOrderScreen(ui: React.ReactElement, searchParams = "") {
  useAuthStore.setState({
    user: {
      userId: "u-test",
      fullName: "Test",
      email: "t@t.vn",
      roles: [],
      username: "test",
      status: "ACTIVE",
      lastLoginAt: null,
    },
    isAuthenticated: true,
    status: "authenticated",
    impersonatedRole: null,
  });
  const client = new QueryClient({
    // retryDelay 0: hook order tự retry lỗi 5xx — test không phải chờ backoff thật
    defaultOptions: { queries: { retry: false, retryDelay: 0 }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <NuqsTestingAdapter searchParams={searchParams}>
        <Suspense fallback={<div>loading</div>}>{ui}</Suspense>
      </NuqsTestingAdapter>
    </QueryClientProvider>,
  );
}
