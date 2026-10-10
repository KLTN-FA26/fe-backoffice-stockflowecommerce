import { IDENTITY_PERMISSIONS } from "@/constants/permissions";

import { PermissionBoundary } from "@/lib/auth/components/PermissionBoundary";

import { PermissionManagementPage } from "@/features/permission-management/components/PermissionManagementPage";

export default function PermissionsPage() {
  return (
    <PermissionBoundary
      permissions={[IDENTITY_PERMISSIONS.rbacRead, IDENTITY_PERMISSIONS.rolesRead]}
    >
      <PermissionManagementPage />
    </PermissionBoundary>
  );
}
