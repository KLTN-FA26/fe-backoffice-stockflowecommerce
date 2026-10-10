import { z } from "zod";

import { permissionCodeSchema } from "@/lib/auth/me-permissions";

export const dataScopeSchema = z.enum(["OWN", "TEAM", "WAREHOUSE", "ALL"]);

export const permissionActionSchema = z.enum([
  "VIEW_PAGE",
  "READ",
  "CREATE",
  "UPDATE",
  "DELETE",
  "APPROVE",
  "EXPORT",
]);

export const roleResponseSchema = z.object({
  code: z.string(),
  name: z.string(),
  description: z.string().nullish(),
  createdAt: z.string(),
  createdBy: z.string().nullish(),
  lastModifiedAt: z.string().nullish(),
  lastModifiedBy: z.string().nullish(),
});

export const roleMatrixActionSchema = z.object({
  action: permissionActionSchema,
  label: z.string(),
  granted: z.boolean(),
  sensitive: z.boolean(),
});

export const roleMatrixResourceSchema = z.object({
  code: z.string(),
  label: z.string(),
  route: z.string(),
  apiPath: z.string(),
  grantedCount: z.number(),
  totalCount: z.number(),
  actions: z.array(roleMatrixActionSchema),
});

export const roleMatrixGroupSchema = z.object({
  name: z.string(),
  grantedCount: z.number(),
  totalCount: z.number(),
  resources: z.array(roleMatrixResourceSchema),
});

export const roleMatrixSchema = z.object({
  roleCode: z.string(),
  roleLabel: z.string(),
  systemRole: z.boolean(),
  editable: z.boolean(),
  version: z.number().int().nonnegative(),
  dataScope: dataScopeSchema,
  grantedCount: z.number(),
  totalCount: z.number(),
  groups: z.array(roleMatrixGroupSchema),
});

export type RoleResponse = z.infer<typeof roleResponseSchema>;
export type RoleMatrixAction = z.infer<typeof roleMatrixActionSchema>;
export type RoleMatrixResource = z.infer<typeof roleMatrixResourceSchema>;
export type RoleMatrixGroup = z.infer<typeof roleMatrixGroupSchema>;
export type RoleMatrix = z.infer<typeof roleMatrixSchema>;

// BE UpdateRolePermissionsRequest: complete visible grants, expected matrix version.
export const updateRolePermissionsSchema = z.object({
  version: z.number().int().nonnegative(),
  permissions: z.array(permissionCodeSchema).max(2000),
});
export type UpdateRolePermissions = z.infer<typeof updateRolePermissionsSchema>;
