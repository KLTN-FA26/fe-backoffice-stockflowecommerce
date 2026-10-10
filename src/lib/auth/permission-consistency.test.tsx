import { focusManager, QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, render, renderHook, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  PERMISSION_QUERY,
  PRODUCT_PERMISSIONS,
  SUPPLIER_PERMISSIONS,
} from "@/constants/permissions";

import { api } from "@/lib/api/client";
import { ApiError } from "@/lib/api/error";

import { useAuthStore } from "./auth-store";
import { Can, useCan } from "./components/Can";
import { PermissionBoundary } from "./components/PermissionBoundary";
import {
  fetchMyPermissions,
  meKeys,
  myPermissionsSchema,
  useMyPermissions,
} from "./me-permissions";

import type { ReactNode } from "react";

const user = {
  userId: "A",
  username: "staff",
  email: "staff@example.com",
  fullName: null,
  status: "ACTIVE",
  roles: ["ROLE_SYSTEM_ADMIN"],
  lastLoginAt: null,
};
const response = (permissions: string[]) => ({
  data: { roles: user.roles, permissions, dataScope: "ALL" },
});
let client: QueryClient;
function Wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
const gate = () =>
  render(
    <Can permission={PRODUCT_PERMISSIONS.create} fallback={<span>Denied action</span>}>
      <span>Protected action</span>
    </Can>,
    { wrapper: Wrapper },
  );

beforeEach(() => {
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  useAuthStore.getState().login(user, false);
});
afterEach(() => {
  cleanup();
  client.clear();
  useAuthStore.getState().logout(false);
  vi.restoreAllMocks();
  focusManager.setFocused(undefined);
});

describe("backend permission ownership", () => {
  it("validates backend codes and the exact DataScope enum", () => {
    expect(myPermissionsSchema.parse(response([PRODUCT_PERMISSIONS.create]).data).dataScope).toBe(
      "ALL",
    );
    for (const dataScope of [null, undefined, "CUSTOM"])
      expect(myPermissionsSchema.safeParse({ ...response([]).data, dataScope }).success).toBe(
        false,
      );
    for (const permission of [
      "product.create",
      "product-products:FAKE",
      "product-products:READ:CREATE",
    ])
      expect(myPermissionsSchema.safeParse(response([permission]).data).success).toBe(false);
  });
  it("permissions use the existing BFF client with the backend-relative path", async () => {
    const get = vi.spyOn(api, "get").mockResolvedValue(response([]));
    await fetchMyPermissions();
    expect(get).toHaveBeenCalledWith("/identity/me/permissions", { signal: undefined });
    expect(api.defaults.baseURL).toBe("/api/backend");
  });
  it.each(["unknown", "unauthenticated"] as const)(
    "does not fetch for %s auth, even with a leftover identity",
    (status) => {
      useAuthStore.setState({ status });
      const get = vi.spyOn(api, "get");
      const { result } = renderHook(() => useCan(PRODUCT_PERMISSIONS.create), { wrapper: Wrapper });
      expect(result.current).toBe(false);
      expect(get).not.toHaveBeenCalled();
    },
  );
  it("loading fails closed and a returned grant renders the component", async () => {
    let finish: ((value: ReturnType<typeof response>) => void) | undefined;
    vi.spyOn(api, "get").mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    gate();
    expect(screen.queryByText("Protected action")).not.toBeInTheDocument();
    expect(screen.getByText("Denied action")).toBeInTheDocument();
    await act(async () => {
      finish?.(response([PRODUCT_PERMISSIONS.create]));
    });
    expect(await screen.findByText("Protected action")).toBeInTheDocument();
  });
  it("System Admin role with no returned grant cannot authorize an action", async () => {
    vi.spyOn(api, "get").mockResolvedValue(response([]));
    gate();
    await waitFor(() =>
      expect(
        client.getQueryState(
          meKeys.sessionPermissions(user.userId, useAuthStore.getState().authorizationVersion),
        )?.status,
      ).toBe("success"),
    );
    expect(screen.queryByText("Protected action")).not.toBeInTheDocument();
  });
  it("query failure fails closed even when an earlier response granted the action", async () => {
    const get = vi.spyOn(api, "get").mockResolvedValue(response([PRODUCT_PERMISSIONS.create]));
    gate();
    await screen.findByText("Protected action");
    get.mockRejectedValue(new ApiError(503, "UNAVAILABLE", "Unavailable"));
    await act(async () => {
      await client.invalidateQueries({ queryKey: meKeys.permissions() });
    });
    await waitFor(() => expect(screen.queryByText("Protected action")).not.toBeInTheDocument());
  });
  it("changing demo impersonation does not change grants or refetch using the fake role", async () => {
    const get = vi.spyOn(api, "get").mockResolvedValue(response([]));
    const { result } = renderHook(() => useMyPermissions(), { wrapper: Wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    act(() => useAuthStore.getState().setImpersonatedRole("System Admin"));
    expect(result.current.data?.permissions).toEqual([]);
    expect(get).toHaveBeenCalledTimes(1);
    const check = renderHook(() => useCan(PRODUCT_PERMISSIONS.create), { wrapper: Wrapper });
    expect(check.result.current).toBe(false);
  });
  it("User A grants cannot authorize User B while B permissions are loading", async () => {
    const get = vi.spyOn(api, "get").mockResolvedValue(response([PRODUCT_PERMISSIONS.create]));
    gate();
    await screen.findByText("Protected action");
    let finish: ((value: ReturnType<typeof response>) => void) | undefined;
    get.mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    act(() => {
      useAuthStore.getState().logout(false);
      useAuthStore.getState().login({ ...user, userId: "B" }, false);
    });
    expect(screen.queryByText("Protected action")).not.toBeInTheDocument();
    await act(async () => {
      finish?.(response([]));
    });
    await waitFor(() =>
      expect(
        client.getQueryState(
          meKeys.sessionPermissions("B", useAuthStore.getState().authorizationVersion),
        )?.status,
      ).toBe("success"),
    );
    expect(screen.queryByText("Protected action")).not.toBeInTheDocument();
  });
  it("logout and re-login as the same user never reuse the prior session grants", async () => {
    const get = vi.spyOn(api, "get").mockResolvedValue(response([PRODUCT_PERMISSIONS.create]));
    gate();
    await screen.findByText("Protected action");
    const version = useAuthStore.getState().authorizationVersion;
    get.mockResolvedValue(response([]));
    act(() => useAuthStore.getState().logout(false));
    expect(screen.queryByText("Protected action")).not.toBeInTheDocument();
    act(() => useAuthStore.getState().login(user, false));
    expect(useAuthStore.getState().authorizationVersion).toBeGreaterThan(version);
    await waitFor(() => expect(get).toHaveBeenCalledTimes(2));
    expect(screen.queryByText("Protected action")).not.toBeInTheDocument();
  });
  it("focus refreshes grants even inside the 30-second stale window", async () => {
    const get = vi.spyOn(api, "get").mockResolvedValue(response([PRODUCT_PERMISSIONS.create]));
    gate();
    await screen.findByText("Protected action");
    expect(PERMISSION_QUERY.staleTime).toBe(30_000);
    get.mockResolvedValue(response([]));
    act(() => {
      focusManager.setFocused(false);
      focusManager.setFocused(true);
    });
    await waitFor(() => expect(get).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(screen.queryByText("Protected action")).not.toBeInTheDocument());
  });
});

describe("direct page permission boundary", () => {
  const page = () =>
    render(
      <PermissionBoundary permissions={[SUPPLIER_PERMISSIONS.viewPage]}>
        <span>Protected page</span>
      </PermissionBoundary>,
      { wrapper: Wrapper },
    );
  it("waits for permissions without rendering page content", async () => {
    vi.spyOn(api, "get").mockResolvedValue(response([SUPPLIER_PERMISSIONS.viewPage]));
    page();
    expect(screen.queryByText("Protected page")).not.toBeInTheDocument();
    expect(await screen.findByText("Protected page")).toBeInTheDocument();
  });
  it("authenticated denial displays access denied and preserves the session", async () => {
    vi.spyOn(api, "get").mockResolvedValue(response([]));
    page();
    expect(await screen.findByText("Không có quyền truy cập")).toBeInTheDocument();
    expect(useAuthStore.getState().status).toBe("authenticated");
  });
  it("an ordinary 403 displays denial instead of clearing auth", async () => {
    vi.spyOn(api, "get").mockRejectedValue(new ApiError(403, "FORBIDDEN", "Denied"));
    page();
    expect(await screen.findByText("Không có quyền truy cập")).toBeInTheDocument();
    expect(useAuthStore.getState().status).toBe("authenticated");
  });
  it("unknown auth delegates navigation to AuthGuard and does not fetch", () => {
    useAuthStore.getState().beginBootstrap();
    const get = vi.spyOn(api, "get");
    page();
    expect(get).not.toHaveBeenCalled();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.queryByText("Protected page")).not.toBeInTheDocument();
  });
});
