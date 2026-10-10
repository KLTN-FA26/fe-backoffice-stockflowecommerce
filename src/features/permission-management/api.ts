import { api } from "@/lib/api/client";

import { roleMatrixSchema, roleResponseSchema, updateRolePermissionsSchema } from "./schemas";

import type { RoleMatrix, RoleResponse, UpdateRolePermissions } from "./schemas";

const roleMatrixPath = (roleCode: string) =>
  `/identity/roles/${encodeURIComponent(roleCode)}/permissions`;

export async function listRoles(signal?: AbortSignal): Promise<RoleResponse[]> {
  const { data } = await api.get<unknown>("/identity/roles", { signal });
  return roleResponseSchema.array().parse(data);
}

export async function getRolePermissionMatrix(
  roleCode: string,
  signal?: AbortSignal,
): Promise<RoleMatrix> {
  const { data } = await api.get<unknown>(roleMatrixPath(roleCode), { signal });
  return roleMatrixSchema.parse(data);
}

export async function updateRolePermissions(
  roleCode: string,
  input: UpdateRolePermissions,
): Promise<RoleMatrix> {
  const { data } = await api.put<unknown>(
    roleMatrixPath(roleCode),
    updateRolePermissionsSchema.parse(input),
  );
  return roleMatrixSchema.parse(data);
}
