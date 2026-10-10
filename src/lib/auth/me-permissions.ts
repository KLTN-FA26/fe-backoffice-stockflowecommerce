/**
 * Quyền của người đang đăng nhập — đọc từ BE `GET /identity/me/permissions` (BE PR #39).
 *
 * Mã quyền dạng `<resource>:<ACTION>` (vd `procurement-suppliers:CREATE`). Admin tick quyền trên
 * màn Phân quyền là có hiệu lực ngay, nên FE không gắn cứng theo tên vai trò.
 * Đây là server state → React Query, không lưu zustand/localStorage. Tải lại khi gặp 403
 * (xem `query-client.ts`).
 *
 * UI-only: ẩn/hiện nút. Backend luôn re-check từng request.
 */

import { useQuery } from "@tanstack/react-query";
import { z } from "zod";

import { PERMISSION_QUERY } from "@/constants/permissions";

import { api } from "@/lib/api/client";

import { useAuthStore } from "./auth-store";

export const PERMISSION_ACTIONS = [
  "VIEW_PAGE",
  "READ",
  "CREATE",
  "UPDATE",
  "DELETE",
  "APPROVE",
  "EXPORT",
] as const;

export type PermissionAction = (typeof PERMISSION_ACTIONS)[number];
export type PermissionCode = `${string}:${PermissionAction}`;

// BE develop MyPermissionsResponse, PermissionCode, Action and DataScope.
export const permissionCodeSchema = z.templateLiteral([
  z.string().regex(/^[a-z0-9-]{2,64}$/),
  ":",
  z.enum(PERMISSION_ACTIONS),
]);
export const myPermissionsSchema = z.object({
  roles: z.array(z.string()),
  permissions: z.array(permissionCodeSchema),
  dataScope: z.enum(["OWN", "TEAM", "WAREHOUSE", "ALL"]),
});

export type MyPermissions = z.infer<typeof myPermissionsSchema>;

export const meKeys = {
  all: ["identity", "me"] as const,
  permissions: () => [...meKeys.all, "permissions"] as const,
  sessionPermissions: (userId: string | null, version: number) =>
    [...meKeys.permissions(), userId, version] as const,
};

export function isPermissionCode(value: string): value is PermissionCode {
  return permissionCodeSchema.safeParse(value).success;
}

export async function fetchMyPermissions(signal?: AbortSignal): Promise<MyPermissions> {
  const { data } = await api.get<unknown>(PERMISSION_QUERY.path, { signal });
  return myPermissionsSchema.parse(data);
}

/** Đang tải / lỗi / parse sai → coi như không có quyền (ẩn nút, không nháy nút rồi mất). */
export function hasPermission(perms: MyPermissions | undefined, code: PermissionCode): boolean {
  return perms?.permissions.includes(code) ?? false;
}

export function useMyPermissions(enabled = true) {
  const userId = useAuthStore((state) => state.user?.userId ?? null);
  const status = useAuthStore((state) => state.status);
  const version = useAuthStore((state) => state.authorizationVersion);
  return useQuery({
    queryKey: meKeys.sessionPermissions(userId, version),
    queryFn: ({ signal }) => fetchMyPermissions(signal),
    enabled: enabled && status === "authenticated" && userId !== null,
    staleTime: PERMISSION_QUERY.staleTime,
    refetchOnWindowFocus: "always",
    // No old session cache or placeholder grants can authorize a new session.
    gcTime: 0,
    placeholderData: undefined,
    // Do not retry failed permission observers on each mount (error UI also uses Can).
    retryOnMount: false,
  });
}
