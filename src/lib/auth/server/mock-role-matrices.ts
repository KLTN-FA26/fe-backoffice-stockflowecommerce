import "server-only";

import type { RoleMatrix } from "@/features/permission-management/types";

export const mockRoles = [
  {
    code: "ECOMMERCE_ADMIN",
    name: "E-commerce Admin",
    description: "Catalog and platform administration",
    createdAt: "2026-09-03T00:00:00Z",
    createdBy: "flyway",
    lastModifiedAt: null,
    lastModifiedBy: null,
  },
  {
    code: "WAREHOUSE_MANAGER",
    name: "Warehouse Manager",
    description: null,
    createdAt: "2026-09-03T00:00:00Z",
    createdBy: null,
    lastModifiedAt: "2026-09-04T00:00:00Z",
    lastModifiedBy: "admin@example.com",
  },
];

const normalRoleMatrix: RoleMatrix = {
  roleCode: "ECOMMERCE_ADMIN",
  roleLabel: "E-commerce Admin",
  systemRole: true,
  editable: true,
  version: 0,
  dataScope: "ALL",
  grantedCount: 2,
  totalCount: 3,
  groups: [
    {
      name: "Platform",
      grantedCount: 2,
      totalCount: 3,
      resources: [
        {
          code: "identity-rbac",
          label: "Permission matrix",
          route: "/admin/permissions",
          apiPath: "/api/v1/identity/rbac",
          grantedCount: 2,
          totalCount: 3,
          actions: [
            { action: "VIEW_PAGE", label: "Open page", granted: true, sensitive: false },
            { action: "READ", label: "Read data", granted: true, sensitive: false },
            { action: "APPROVE", label: "Approve", granted: false, sensitive: true },
          ],
        },
      ],
    },
  ],
};

export const initialMockRoleMatrices: Record<string, RoleMatrix> = {
  ECOMMERCE_ADMIN: normalRoleMatrix,
  WAREHOUSE_MANAGER: {
    ...normalRoleMatrix,
    roleCode: "WAREHOUSE_MANAGER",
    roleLabel: "Warehouse Manager",
    dataScope: "WAREHOUSE",
    grantedCount: 0,
    groups: normalRoleMatrix.groups.map((group) => ({
      ...group,
      grantedCount: 0,
      resources: group.resources.map((resource) => ({
        ...resource,
        grantedCount: 0,
        actions: resource.actions.map((action) => ({ ...action, granted: false })),
      })),
    })),
  },
  EMPTY_GROUPS: {
    roleCode: "EMPTY_GROUPS",
    roleLabel: "Empty Groups Fixture",
    systemRole: true,
    editable: false,
    version: 0,
    dataScope: "ALL",
    grantedCount: 0,
    totalCount: 0,
    groups: [],
  },
  EMPTY_RESOURCES: {
    roleCode: "EMPTY_RESOURCES",
    roleLabel: "Empty Resources Fixture",
    systemRole: true,
    editable: true,
    version: 0,
    dataScope: "OWN",
    grantedCount: 0,
    totalCount: 0,
    groups: [{ name: "Empty Group", grantedCount: 0, totalCount: 0, resources: [] }],
  },
  EMPTY_ACTIONS: {
    roleCode: "EMPTY_ACTIONS",
    roleLabel: "Empty Actions Fixture",
    systemRole: true,
    editable: true,
    version: 0,
    dataScope: "WAREHOUSE",
    grantedCount: 0,
    totalCount: 0,
    groups: [
      {
        name: "Empty Actions Group",
        grantedCount: 0,
        totalCount: 0,
        resources: [
          {
            code: "empty-resource",
            label: "Empty Resource",
            route: "/admin/empty",
            apiPath: "/api/v1/empty",
            grantedCount: 0,
            totalCount: 0,
            actions: [],
          },
        ],
      },
    ],
  },
};
