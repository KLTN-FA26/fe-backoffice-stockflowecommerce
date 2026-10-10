import type { PermissionCode } from "@/lib/auth/me-permissions";
import type { RoleMatrix, RoleMatrixResource } from "./types";

export function matrixPermissionCode(
  resource: string,
  action: RoleMatrixResource["actions"][number]["action"],
): PermissionCode {
  return `${resource}:${action}`;
}
export function matrixGrants(matrix: RoleMatrix): Set<PermissionCode> {
  return new Set(
    matrix.groups.flatMap((group) =>
      group.resources.flatMap((resource) =>
        resource.actions
          .filter((action) => action.granted)
          .map((action) => matrixPermissionCode(resource.code, action.action)),
      ),
    ),
  );
}
export function sameGrants(
  left: ReadonlySet<PermissionCode>,
  right: ReadonlySet<PermissionCode>,
): boolean {
  return left.size === right.size && [...left].every((code) => right.has(code));
}
export function bulkGrants(
  current: ReadonlySet<PermissionCode>,
  resources: readonly RoleMatrixResource[],
  grant: boolean,
): Set<PermissionCode> {
  const next = new Set(current);
  for (const resource of resources)
    for (const action of resource.actions) {
      if (action.sensitive) continue;
      const code = matrixPermissionCode(resource.code, action.action);
      if (grant) next.add(code);
      else next.delete(code);
    }
  return next;
}
/** Preserve backend catalog ordering/structure; only display state and counts follow the draft. */
export function draftMatrix(base: RoleMatrix, grants: ReadonlySet<PermissionCode>): RoleMatrix {
  const groups = base.groups.map((group) => {
    const resources = group.resources.map((resource) => {
      const actions = resource.actions.map((action) => ({
        ...action,
        granted: grants.has(matrixPermissionCode(resource.code, action.action)),
      }));
      return {
        ...resource,
        actions,
        grantedCount: actions.filter((action) => action.granted).length,
      };
    });
    return {
      ...group,
      resources,
      grantedCount: resources.reduce((count, resource) => count + resource.grantedCount, 0),
    };
  });
  return {
    ...base,
    groups,
    grantedCount: groups.reduce((count, group) => count + group.grantedCount, 0),
  };
}
