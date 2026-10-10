import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { ApiError } from "@/lib/api/error";
import { meKeys } from "@/lib/auth/me-permissions";

import { updateRolePermissions } from "./api";
import { RBAC_EDITOR, RBAC_ERRORS } from "./constants";
import { permissionManagementKeys } from "./queries";

import type { UpdateRolePermissions } from "./types";

export function useUpdateRolePermissions() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ roleCode, input }: { roleCode: string; input: UpdateRolePermissions }) =>
      updateRolePermissions(roleCode, input),
    retry: false,
    onSuccess: (matrix) => {
      client.setQueryData(permissionManagementKeys.matrix(matrix.roleCode), matrix);
      void client.invalidateQueries({ queryKey: meKeys.permissions() });
      toast.success(RBAC_EDITOR.saved);
    },
    onError: (error, { roleCode }) => {
      if (!(error instanceof ApiError)) return;
      if (error.status === 403)
        void client.invalidateQueries({ queryKey: meKeys.permissions() }, { cancelRefetch: false });
      if (error.code === RBAC_ERRORS.notEditable)
        void client.invalidateQueries({ queryKey: permissionManagementKeys.matrix(roleCode) });
    },
  });
}
