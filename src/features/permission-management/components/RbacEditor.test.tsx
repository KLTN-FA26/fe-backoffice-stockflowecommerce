import { QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AUTH_PATHS } from "@/constants/auth";
import { IDENTITY_PERMISSIONS } from "@/constants/permissions";

import { api } from "@/lib/api/client";
import { ApiError } from "@/lib/api/error";
import { makeQueryClient } from "@/lib/api/query-client";
import { bootstrapSession } from "@/lib/auth/auth-session";
import { AuthGuard } from "@/lib/auth/components/AuthGuard";
import { useAuthStore } from "@/lib/auth/auth-store";
import { PermissionBoundary } from "@/lib/auth/components/PermissionBoundary";

import { editorMatrix } from "../__fixtures__/matrix";
import { RBAC_EDITOR } from "../constants";
import { permissionManagementKeys } from "../queries";

import { PermissionManagementPage } from "./PermissionManagementPage";

import type { RoleMatrix } from "../types";

const navigation = vi.hoisted(() => ({ replace: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => navigation }));

vi.mock("sonner", () => ({ toast: { success: vi.fn() } }));
let matrix: RoleMatrix;
let permissions: string[];
const label = "Permission matrix: View (VIEW_PAGE)";
function setup(guarded = false) {
  const client = makeQueryClient();
  client.setDefaultOptions({ queries: { retry: false } });
  const content = (
    <PermissionBoundary permissions={[IDENTITY_PERMISSIONS.rbacRead]}>
      <PermissionManagementPage />
    </PermissionBoundary>
  );
  const view = render(
    <QueryClientProvider client={client}>
      {guarded ? <AuthGuard>{content}</AuthGuard> : content}
    </QueryClientProvider>,
  );
  return { ...view, client, user: userEvent.setup() };
}
beforeEach(() => {
  matrix = editorMatrix();
  permissions = [
    IDENTITY_PERMISSIONS.rbacRead,
    IDENTITY_PERMISSIONS.rbacApprove,
    IDENTITY_PERMISSIONS.rolesRead,
  ];
  useAuthStore.getState().login(
    {
      userId: "editor-test",
      username: "editor",
      fullName: "Editor",
      email: "editor@example.test",
      status: "ACTIVE",
      roles: ["display-context"],
      lastLoginAt: null,
    },
    false,
  );
  Element.prototype.scrollIntoView = vi.fn();
  vi.spyOn(api, "get").mockImplementation(async (path) => {
    if (path === AUTH_PATHS.me)
      return {
        data: {
          userId: "editor-test",
          username: "editor",
          fullName: "Editor",
          email: "editor@example.test",
          status: "ACTIVE",
          roles: ["display-context"],
          lastLoginAt: null,
        },
      };
    if (path === "/identity/me/permissions")
      return { data: { roles: [], permissions: [...permissions], dataScope: "ALL" } };
    if (path === "/identity/roles")
      return {
        data: [
          { code: "ROLE_A", name: "Role A", createdAt: "2026-09-03T00:00:00Z" },
          { code: "ROLE_B", name: "Role B", createdAt: "2026-09-03T00:00:00Z" },
        ],
      };
    return {
      data:
        path === "/identity/roles/ROLE_B/permissions"
          ? { ...editorMatrix(9), roleCode: "ROLE_B", roleLabel: "Role B" }
          : matrix,
    };
  });
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  useAuthStore.getState().logout(false);
});

describe("RBAC editor interactions", () => {
  it("READ without APPROVE keeps matrix visible with semantically disabled controls", async () => {
    permissions = [IDENTITY_PERMISSIONS.rbacRead, IDENTITY_PERMISSIONS.rolesRead];
    setup();
    expect(await screen.findByRole("checkbox", { name: label })).toBeDisabled();
    expect(screen.getByRole("button", { name: RBAC_EDITOR.save })).toBeDisabled();
    expect(
      screen.queryByRole("button", { name: `Permission matrix: ${RBAC_EDITOR.select}` }),
    ).not.toBeInTheDocument();
  });
  it("APPROVE cannot override editable=false", async () => {
    matrix = editorMatrix(7, false);
    setup();
    expect(await screen.findByRole("checkbox", { name: label })).toBeDisabled();
    expect(screen.getByText(RBAC_EDITOR.readOnly)).toBeInTheDocument();
  });
  it("keyboard edits, dirty counters, sensitive-preserving bulk, and clean save state", async () => {
    const { user } = setup();
    const view = await screen.findByRole("checkbox", { name: label });
    expect(screen.getByRole("button", { name: RBAC_EDITOR.save })).toBeDisabled();
    view.focus();
    await user.keyboard(" ");
    expect(view).toBeChecked();
    expect(screen.getAllByText("3/4 quyền được cấp")).toHaveLength(3);
    await user.click(
      screen.getByRole("button", { name: `Permission matrix: ${RBAC_EDITOR.clear}` }),
    );
    expect(
      screen.getByRole("checkbox", { name: "Permission matrix: Approve (APPROVE)" }),
    ).toBeChecked();
    expect(
      screen.getByRole("checkbox", { name: "Permission matrix: Delete (DELETE)" }),
    ).not.toBeChecked();
    await user.click(
      screen.getByRole("button", { name: `Permission matrix: ${RBAC_EDITOR.select}` }),
    );
    expect(screen.getAllByText("3/4 quyền được cấp")).toHaveLength(3);
  });
  it("pending save disables saving, role switching and every permission control", async () => {
    let finish: ((value: { data: RoleMatrix }) => void) | undefined;
    vi.spyOn(api, "put").mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    const { user } = setup();
    await user.click(await screen.findByRole("checkbox", { name: label }));
    await user.click(screen.getByRole("button", { name: RBAC_EDITOR.save }));
    const saving = await screen.findByRole("button", { name: RBAC_EDITOR.saving });
    expect(saving).toBeDisabled();
    expect(saving).toHaveAttribute("aria-busy", "true");
    expect(screen.getByLabelText("Chọn vai trò để xem ma trận quyền")).toBeDisabled();
    for (const control of screen.getAllByRole("checkbox")) expect(control).toBeDisabled();
    await act(async () => {
      finish?.({ data: editorMatrix(24) });
    });
    await waitFor(() =>
      expect(screen.getByRole("button", { name: RBAC_EDITOR.save })).toBeDisabled(),
    );
  });
  it("dirty role switch cancel preserves draft; confirm loads the other role", async () => {
    const { user } = setup();
    await user.click(await screen.findByRole("checkbox", { name: label }));
    const select = screen.getByLabelText("Chọn vai trò để xem ma trận quyền");
    select.focus();
    await user.keyboard("{ArrowDown}");
    await user.click(screen.getByRole("option", { name: "Role B" }));
    const dialog = await screen.findByRole("dialog", { name: RBAC_EDITOR.switchTitle });
    await user.click(within(dialog).getByRole("button", { name: "Quay lại" }));
    expect(select).toHaveTextContent(/^Role A$/);
    expect(screen.getByRole("checkbox", { name: label })).toBeChecked();
    select.focus();
    await user.keyboard("{ArrowDown}");
    await user.click(screen.getByRole("option", { name: "Role B" }));
    await user.click(
      within(await screen.findByRole("dialog")).getByRole("button", { name: RBAC_EDITOR.discard }),
    );
    await waitFor(() => expect(select).toHaveTextContent(/^Role B$/));
    expect(await screen.findByRole("checkbox", { name: label })).not.toBeChecked();
    expect(screen.getByRole("button", { name: RBAC_EDITOR.save })).toBeDisabled();
  });
  it("real AuthGuard focus bootstrap/remount preserves selected role, dirty grants and base version", async () => {
    const put = vi
      .spyOn(api, "put")
      .mockResolvedValue({ data: { ...editorMatrix(22), roleCode: "ROLE_B" } });
    const { user } = setup(true);
    await screen.findByRole("checkbox", { name: label });
    const select = screen.getByLabelText("Chọn vai trò để xem ma trận quyền");
    select.focus();
    await user.keyboard("{ArrowDown}");
    await user.click(screen.getByRole("option", { name: "Role B" }));
    await user.click(await screen.findByRole("checkbox", { name: label }));
    await act(async () => {
      window.dispatchEvent(new Event("focus"));
      await bootstrapSession();
    });
    const restored = await screen.findByRole("checkbox", { name: label });
    expect(restored).toBeChecked();
    expect(screen.getByLabelText("Chọn vai trò để xem ma trận quyền")).toHaveTextContent(
      /^Role B$/,
    );
    await user.click(screen.getByRole("button", { name: RBAC_EDITOR.save }));
    await waitFor(() =>
      expect(put).toHaveBeenCalledWith("/identity/roles/ROLE_B/permissions", {
        version: 9,
        permissions: ["identity-rbac:APPROVE", "identity-rbac:READ", "identity-rbac:VIEW_PAGE"],
      }),
    );
  });
  it("conflict keeps checked draft and original version until confirmed reload", async () => {
    const put = vi
      .spyOn(api, "put")
      .mockRejectedValue(new ApiError(409, "ROLE_PERMISSIONS_CHANGED", "error"));
    const { user, client } = setup();
    await user.click(await screen.findByRole("checkbox", { name: label }));
    matrix = editorMatrix(8);
    act(() => client.setQueryData(permissionManagementKeys.matrix("ROLE_A"), matrix));
    expect(await screen.findByRole("alert")).toHaveTextContent(RBAC_EDITOR.changed);
    await user.click(screen.getByRole("button", { name: RBAC_EDITOR.save }));
    await waitFor(() => expect(put).toHaveBeenCalledOnce());
    expect(put.mock.calls[0]?.[1]).toMatchObject({ version: 7 });
    expect(screen.getByRole("checkbox", { name: label })).toBeChecked();
    await user.click(screen.getByRole("button", { name: RBAC_EDITOR.reload }));
    const dialog = await screen.findByRole("dialog", { name: RBAC_EDITOR.reloadTitle });
    expect(within(dialog).getByText(RBAC_EDITOR.reloadDescription)).toBeInTheDocument();
    await user.click(within(dialog).getByRole("button", { name: RBAC_EDITOR.discard }));
    await waitFor(() => expect(screen.getByRole("checkbox", { name: label })).not.toBeChecked());
    expect(screen.getByRole("button", { name: RBAC_EDITOR.save })).toBeDisabled();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
  it("background query failure leaves draft visible and intact", async () => {
    const { user, client } = setup();
    await user.click(await screen.findByRole("checkbox", { name: label }));
    vi.mocked(api.get).mockRejectedValue(new ApiError(500, "INTERNAL_ERROR", "error"));
    await act(() => client.refetchQueries({ queryKey: permissionManagementKeys.matrix("ROLE_A") }));
    expect(screen.getByRole("checkbox", { name: label })).toBeChecked();
    expect(await screen.findByRole("alert")).toHaveTextContent(RBAC_EDITOR.refetchFailed);
  });
  it.each([IDENTITY_PERMISSIONS.rbacApprove, IDENTITY_PERMISSIONS.rbacRead])(
    "successful save refreshes current grants and applies loss of %s",
    async (lost) => {
      vi.spyOn(api, "put").mockImplementation(async () => {
        permissions = permissions.filter((code) => code !== lost);
        matrix = editorMatrix(31);
        return { data: matrix };
      });
      const { user } = setup();
      await user.click(await screen.findByRole("checkbox", { name: label }));
      await user.click(screen.getByRole("button", { name: RBAC_EDITOR.save }));
      if (lost === IDENTITY_PERMISSIONS.rbacApprove) {
        await waitFor(() => expect(screen.getByRole("checkbox", { name: label })).toBeDisabled());
        expect(screen.getByRole("button", { name: RBAC_EDITOR.save })).toBeDisabled();
      } else {
        expect(await screen.findByRole("alert")).toHaveTextContent("Không có quyền truy cập");
        expect(screen.queryByRole("checkbox", { name: label })).not.toBeInTheDocument();
      }
      expect(useAuthStore.getState().status).toBe("authenticated");
      expect(
        vi.mocked(api.get).mock.calls.filter(([path]) => path === "/identity/me/permissions")
          .length,
      ).toBeGreaterThanOrEqual(2);
    },
  );
});
