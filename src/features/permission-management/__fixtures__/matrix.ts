import type { RoleMatrix } from "../types";

/** Synthetic contract fixture: actions/counts intentionally exercise editor behavior. */
export function editorMatrix(version = 7, editable = true): RoleMatrix {
  return {
    roleCode: "ROLE_A",
    roleLabel: "Role A",
    systemRole: true,
    editable,
    version,
    dataScope: "ALL",
    grantedCount: 2,
    totalCount: 4,
    groups: [
      {
        name: "Platform",
        grantedCount: 2,
        totalCount: 4,
        resources: [
          {
            code: "identity-rbac",
            label: "Permission matrix",
            route: "/admin/permissions",
            apiPath: "/api/v1/identity/rbac",
            grantedCount: 2,
            totalCount: 4,
            actions: [
              { action: "READ", label: "Read", granted: true, sensitive: false },
              { action: "VIEW_PAGE", label: "View", granted: false, sensitive: false },
              { action: "APPROVE", label: "Approve", granted: true, sensitive: true },
              { action: "DELETE", label: "Delete", granted: false, sensitive: true },
            ],
          },
        ],
      },
    ],
  };
}
