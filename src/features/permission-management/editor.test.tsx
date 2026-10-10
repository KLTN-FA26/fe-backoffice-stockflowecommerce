import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { api } from "@/lib/api/client";
import { ApiError } from "@/lib/api/error";

import { clearRbacEditor, useRbacEditorStore } from "./editor-store";
import { useAuthStore } from "@/lib/auth/auth-store";
import { meKeys } from "@/lib/auth/me-permissions";

import { editorMatrix } from "./__fixtures__/matrix";
import { updateRolePermissions } from "./api";
import { RBAC_EDITOR, RBAC_ERRORS } from "./constants";
import { permissionManagementKeys } from "./queries";
import { roleMatrixSchema } from "./schemas";
import { bulkGrants, draftMatrix, matrixGrants } from "./selectors";
import { usePermissionEditor } from "./use-permission-editor";

import type { ReactNode } from "react";

const auth = vi.hoisted(() => ({ approve: true }));
vi.mock("@/lib/auth/components/Can", () => ({ useCan: () => auth.approve }));
vi.mock("sonner", () => ({ toast: { success: vi.fn() } }));
function setup(matrix = editorMatrix()) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const invalidate = vi.spyOn(client, "invalidateQueries");
  const view = renderHook(({ value }) => usePermissionEditor(value), {
    initialProps: { value: matrix },
    wrapper: ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    ),
  });
  return { ...view, client, invalidate };
}
beforeEach(() => {
  clearRbacEditor();
  auth.approve = true;
});
afterEach(() => vi.restoreAllMocks());

describe("RBAC snapshot and replacement contract", () => {
  it("retains editor-critical schema fields and rejects missing version", () => {
    const matrix = roleMatrixSchema.parse(editorMatrix());
    expect(matrix).toMatchObject({ version: 7, editable: true });
    expect(matrix.groups[0]?.resources[0]?.actions[2]?.sensitive).toBe(true);
    expect(roleMatrixSchema.safeParse({ ...matrix, version: undefined }).success).toBe(false);
  });
  it("PUT uses BFF client, encoded role and same response validation", async () => {
    const put = vi.spyOn(api, "put").mockResolvedValue({ data: editorMatrix(12) });
    await expect(
      updateRolePermissions("ROLE/A", { version: 7, permissions: ["identity-rbac:READ"] }),
    ).resolves.toMatchObject({ version: 12 });
    expect(put).toHaveBeenCalledWith("/identity/roles/ROLE%2FA/permissions", {
      version: 7,
      permissions: ["identity-rbac:READ"],
    });
    put.mockResolvedValue({ data: { ...editorMatrix(), editable: undefined } });
    await expect(
      updateRolePermissions("ROLE_A", { version: 7, permissions: [] }),
    ).rejects.toThrow();
  });
  it.each([
    [false, true],
    [true, false],
  ])("APPROVE=%s/editable=%s cannot mutate", (approve, editable) => {
    auth.approve = approve;
    const { result } = setup(editorMatrix(7, editable));
    act(() => result.current.toggle("identity-rbac:VIEW_PAGE"));
    expect(result.current.canEdit).toBe(false);
    expect(result.current.dirty).toBe(false);
  });
  it("individual including sensitive toggle changes draft and all live counters without mutating query data", () => {
    const matrix = editorMatrix();
    const { result } = setup(matrix);
    act(() => result.current.toggle("identity-rbac:DELETE"));
    expect(result.current.dirty).toBe(true);
    expect(result.current.matrix?.grantedCount).toBe(3);
    expect(result.current.matrix?.groups[0]?.grantedCount).toBe(3);
    expect(result.current.matrix?.groups[0]?.resources[0]?.grantedCount).toBe(3);
    expect(matrix.grantedCount).toBe(2);
  });
  it("bulk grant and clear leave both granted and absent sensitive actions unchanged", () => {
    const matrix = editorMatrix();
    const resources = matrix.groups.flatMap((group) => group.resources);
    const granted = bulkGrants(matrixGrants(matrix), resources, true);
    expect([...granted].sort()).toEqual([
      "identity-rbac:APPROVE",
      "identity-rbac:READ",
      "identity-rbac:VIEW_PAGE",
    ]);
    expect([...bulkGrants(granted, resources, false)]).toEqual(["identity-rbac:APPROVE"]);
    expect(draftMatrix(matrix, granted).grantedCount).toBe(3);
  });
  it("bulk uses backend sensitivity flags even for READ, rather than a hard-coded action list", () => {
    const matrix = editorMatrix();
    const resources = matrix.groups
      .flatMap((group) => group.resources)
      .map((resource) => ({
        ...resource,
        actions: resource.actions.map((action) => ({
          ...action,
          sensitive: action.action === "READ",
        })),
      }));
    expect(bulkGrants(matrixGrants(matrix), resources, false).has("identity-rbac:READ")).toBe(true);
  });
  it("clean background update replaces snapshot", () => {
    const { result, rerender } = setup();
    rerender({ value: editorMatrix(8) });
    expect(result.current.matrix?.version).toBe(8);
    expect(result.current.dirty).toBe(false);
  });
  it("dirty background update cannot overwrite grants or advance expected version", async () => {
    const put = vi.spyOn(api, "put").mockResolvedValue({ data: editorMatrix(15) });
    const { result, rerender, client, invalidate } = setup();
    act(() => result.current.toggle("identity-rbac:VIEW_PAGE"));
    rerender({ value: { ...editorMatrix(8), grantedCount: 0, groups: [] } });
    expect(result.current.matrix?.version).toBe(7);
    expect(result.current.matrix?.grantedCount).toBe(3);
    expect(result.current.changed).toBe(true);
    await act(() => result.current.save());
    expect(put).toHaveBeenCalledExactlyOnceWith("/identity/roles/ROLE_A/permissions", {
      version: 7,
      permissions: ["identity-rbac:APPROVE", "identity-rbac:READ", "identity-rbac:VIEW_PAGE"],
    });
    expect(result.current.matrix?.version).toBe(15);
    expect(result.current.dirty).toBe(false);
    expect(client.getQueryData(permissionManagementKeys.matrix("ROLE_A"))).toMatchObject({
      version: 15,
    });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: meKeys.permissions() });
  });
  it.each([
    [RBAC_ERRORS.conflict, 409, RBAC_EDITOR.changed],
    [RBAC_ERRORS.lockout, 409, RBAC_EDITOR.lockout],
    [RBAC_ERRORS.unknown, 400, RBAC_EDITOR.unknown],
    [RBAC_ERRORS.privilegeEscalation, 403, RBAC_EDITOR.privilegeEscalation],
  ])("%s preserves dirty version/grants and never retries", async (code, status, message) => {
    const put = vi
      .spyOn(api, "put")
      .mockRejectedValue(new ApiError(status, code, "different backend message"));
    const { result } = setup();
    act(() => result.current.toggle("identity-rbac:DELETE"));
    await act(() => result.current.save());
    expect(put).toHaveBeenCalledOnce();
    expect(result.current.message).toBe(message);
    expect(result.current.matrix?.version).toBe(7);
    expect(result.current.matrix?.grantedCount).toBe(3);
    expect(result.current.dirty).toBe(true);
  });
  it("explicit reload resets conflict and draft to latest returned snapshot", async () => {
    vi.spyOn(api, "put").mockRejectedValue(new ApiError(409, RBAC_ERRORS.conflict, "error"));
    const { result } = setup();
    act(() => result.current.toggle("identity-rbac:DELETE"));
    await act(() => result.current.save());
    await act(() => result.current.reload(async () => ({ data: editorMatrix(19) })));
    expect(result.current.matrix?.version).toBe(19);
    expect(result.current.dirty).toBe(false);
    expect(result.current.message).toBe("");
  });
  it("reload/refetch failure cannot destroy dirty state", async () => {
    const { result } = setup();
    act(() => result.current.toggle("identity-rbac:DELETE"));
    await act(() => result.current.reload(async () => ({ isError: true })));
    expect(result.current.dirty).toBe(true);
    expect(result.current.matrix?.version).toBe(7);
    expect(result.current.message).toBe(RBAC_EDITOR.refetchFailed);
  });
  it("ROLE_NOT_EDITABLE blocks immediately, refetches, and follows server read-only truth", async () => {
    vi.spyOn(api, "put").mockRejectedValue(new ApiError(409, RBAC_ERRORS.notEditable, "error"));
    const { result, rerender, invalidate } = setup();
    act(() => result.current.toggle("identity-rbac:DELETE"));
    await act(() => result.current.save());
    expect(result.current.canEdit).toBe(false);
    expect(result.current.dirty).toBe(true);
    expect(invalidate).toHaveBeenCalledWith({
      queryKey: permissionManagementKeys.matrix("ROLE_A"),
    });
    rerender({ value: editorMatrix(8, false) });
    expect(result.current.canEdit).toBe(false);
    expect(result.current.matrix?.version).toBe(7);
  });
  it("403 refreshes permissions, keeps UI auth and draft, then loses editing capability", async () => {
    const logout = vi.spyOn(useAuthStore.getState(), "logout");
    vi.spyOn(api, "put").mockRejectedValue(new ApiError(403, "FORBIDDEN", "error"));
    const { result, rerender, invalidate } = setup();
    act(() => result.current.toggle("identity-rbac:DELETE"));
    await act(() => result.current.save());
    expect(logout).not.toHaveBeenCalled();
    expect(result.current.dirty).toBe(true);
    expect(invalidate).toHaveBeenCalledWith(
      { queryKey: meKeys.permissions() },
      { cancelRefetch: false },
    );
    auth.approve = false;
    rerender({ value: editorMatrix() });
    expect(result.current.canEdit).toBe(false);
  });
  it("logout or another authenticated identity clears cached draft; late save cannot restore it", async () => {
    let finish: ((value: { data: ReturnType<typeof editorMatrix> }) => void) | undefined;
    vi.spyOn(api, "put").mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    const { result } = setup();
    act(() => result.current.toggle("identity-rbac:DELETE"));
    let saving: Promise<void> | undefined;
    act(() => {
      saving = result.current.save();
    });
    await waitFor(() => expect(result.current.pending).toBe(true));
    act(() => useAuthStore.getState().logout(false));
    expect(useRbacEditorStore.getState().draft).toBeNull();
    await act(async () => {
      finish?.({ data: editorMatrix(30) });
      await saving;
    });
    expect(useRbacEditorStore.getState().draft).toBeNull();
    act(() =>
      useRbacEditorStore
        .getState()
        .setDraft({ base: editorMatrix(), grants: matrixGrants(editorMatrix()) }),
    );
    act(() =>
      useAuthStore.getState().login(
        {
          userId: "other-editor",
          username: "other",
          fullName: "Other",
          email: "other@example.test",
          status: "ACTIVE",
          roles: [],
          lastLoginAt: null,
        },
        false,
      ),
    );
    expect(useRbacEditorStore.getState().draft).toBeNull();
  });
  it("clean and pending saves cannot issue duplicate PUT or allow draft mutation", async () => {
    let finish: ((value: { data: ReturnType<typeof editorMatrix> }) => void) | undefined;
    const put = vi.spyOn(api, "put").mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    const { result } = setup();
    await act(() => result.current.save());
    expect(put).not.toHaveBeenCalled();
    act(() => result.current.toggle("identity-rbac:VIEW_PAGE"));
    let saving: Promise<void> | undefined;
    act(() => {
      saving = result.current.save();
    });
    await waitFor(() => expect(result.current.pending).toBe(true));
    act(() => result.current.toggle("identity-rbac:DELETE"));
    await act(() => result.current.save());
    expect(put).toHaveBeenCalledOnce();
    expect(result.current.matrix?.grantedCount).toBe(3);
    await act(async () => {
      finish?.({ data: editorMatrix(11) });
      await saving;
    });
    expect(result.current.matrix?.version).toBe(11);
  });
});
