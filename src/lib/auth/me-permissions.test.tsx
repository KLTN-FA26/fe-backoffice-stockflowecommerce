import { QueryClientProvider, useQuery } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { api } from "@/lib/api/client";
import { ApiError } from "@/lib/api/error";
import { makeQueryClient } from "@/lib/api/query-client";

import { useAuthStore } from "./auth-store";
import { useCan } from "./components/Can";
import { hasPermission, isPermissionCode, meKeys } from "./me-permissions";

import type { QueryClient } from "@tanstack/react-query";

function wrapperFor(client: QueryClient) {
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  };
}

function mockPermissions(permissions: unknown) {
  return vi.spyOn(api, "get").mockImplementation(async (url: string) => {
    if (url === "/identity/me/permissions")
      return { data: { roles: [], permissions, dataScope: "ALL" } };
    throw new ApiError(403, "FORBIDDEN", "Bạn không có quyền");
  });
}

beforeEach(() => {
  useAuthStore.setState({
    user: {
      userId: "u1",
      fullName: "U",
      email: "u@u.vn",
      roles: [],
      username: "test",
      status: "ACTIVE",
      lastLoginAt: null,
    },
    impersonatedRole: null,
    status: "authenticated",
    isAuthenticated: true,
  });
});

afterEach(() => vi.restoreAllMocks());

describe("isPermissionCode / hasPermission", () => {
  it("nhận dạng mã quyền BE, phân biệt với quyền cũ dạng module.action", () => {
    expect(isPermissionCode("procurement-suppliers:CREATE")).toBe(true);
    expect(isPermissionCode("product.create")).toBe(false);
  });

  it("chưa có dữ liệu quyền → coi như không có quyền", () => {
    expect(hasPermission(undefined, "procurement-suppliers:READ")).toBe(false);
  });
});

describe("useCan với mã quyền thật", () => {
  it("đang tải → false (không nháy nút), tải xong → theo /me/permissions", async () => {
    mockPermissions(["procurement-suppliers:READ"]);
    const client = makeQueryClient();
    const { result } = renderHook(
      () => [useCan("procurement-suppliers:READ"), useCan("procurement-suppliers:DELETE")],
      { wrapper: wrapperFor(client) },
    );

    expect(result.current).toEqual([false, false]);
    await waitFor(() => expect(result.current).toEqual([true, false]));
  });

  it("dữ liệu quyền sai định dạng → không có quyền", async () => {
    mockPermissions("không phải mảng");
    const client = makeQueryClient();
    client.setDefaultOptions({ queries: { retry: false } });
    const { result } = renderHook(() => useCan("procurement-suppliers:READ"), {
      wrapper: wrapperFor(client),
    });
    await waitFor(() =>
      expect(
        client.getQueryState(
          meKeys.sessionPermissions("u1", useAuthStore.getState().authorizationVersion),
        )?.status,
      ).toBe("error"),
    );
    expect(result.current).toBe(false);
  });
});

describe("tải lại quyền khi gặp 403 (BE PR #39)", () => {
  it("một query khác bị 403 → invalidate /me/permissions", async () => {
    const get = mockPermissions(["procurement-suppliers:READ"]);
    const client = makeQueryClient();
    const wrapper = wrapperFor(client);
    renderHook(() => useCan("procurement-suppliers:READ"), { wrapper });
    await waitFor(() => expect(get).toHaveBeenCalledTimes(1));

    const invalidate = vi.spyOn(client, "invalidateQueries");
    await act(async () => {
      renderHook(
        () =>
          useQuery({
            queryKey: ["suppliers", "list"],
            queryFn: () => api.get("/suppliers"),
            retry: false,
          }),
        { wrapper },
      );
    });

    await waitFor(() =>
      expect(invalidate).toHaveBeenCalledWith({ queryKey: meKeys.permissions() }),
    );
  });
});
