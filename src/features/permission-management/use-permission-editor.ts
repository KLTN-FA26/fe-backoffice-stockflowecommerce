"use client";

import { useState } from "react";

import { IDENTITY_PERMISSIONS } from "@/constants/permissions";

import { ApiError } from "@/lib/api/error";
import { useCan } from "@/lib/auth/components/Can";

import { RBAC_EDITOR, RBAC_ERRORS } from "./constants";
import { useRbacEditorStore } from "./editor-store";
import { useUpdateRolePermissions } from "./mutations";
import { bulkGrants, draftMatrix, matrixGrants, sameGrants } from "./selectors";

import type { PermissionCode } from "@/lib/auth/me-permissions";
import type { RoleMatrix, RoleMatrixResource } from "./types";

function snapshot(matrix: RoleMatrix) {
  return { base: matrix, grants: matrixGrants(matrix) };
}
function saveError(error: unknown): string {
  if (!(error instanceof ApiError)) return RBAC_EDITOR.failed;
  switch (error.code) {
    case RBAC_ERRORS.conflict:
      return RBAC_EDITOR.changed;
    case RBAC_ERRORS.notEditable:
      return RBAC_EDITOR.readOnly;
    case RBAC_ERRORS.lockout:
      return RBAC_EDITOR.lockout;
    case RBAC_ERRORS.unknown:
      return RBAC_EDITOR.unknown;
    case RBAC_ERRORS.privilegeEscalation:
      return RBAC_EDITOR.privilegeEscalation;
    default:
      return error.status === 403 ? RBAC_EDITOR.forbidden : RBAC_EDITOR.failed;
  }
}

/** A dirty draft and its expected version always belong to the same server snapshot. */
export function usePermissionEditor(matrix: RoleMatrix | undefined) {
  const canApprove = useCan(IDENTITY_PERMISSIONS.rbacApprove);
  const mutation = useUpdateRolePermissions();
  const {
    draft,
    message,
    blocked,
    operation,
    epoch,
    setDraft,
    setMessage,
    setBlocked,
    setOperation,
  } = useRbacEditorStore();
  const dirty = draft !== null && !sameGrants(draft.grants, matrixGrants(draft.base));
  const signature = matrix ? JSON.stringify(matrix) : "";
  const [observed, setObserved] = useState<string | null>(null);
  // Observe each server snapshot once; dirty memory survives same-user guard remounts.
  if (signature !== observed) {
    setObserved(signature);
    if (matrix && (!draft || draft.base.roleCode !== matrix.roleCode || !dirty)) {
      setDraft(snapshot(matrix));
      setMessage("");
      setBlocked(false);
    }
  }
  const roleReadOnly = blocked || !draft?.base.editable || matrix?.editable !== true;
  const canEdit = canApprove && !!draft?.base.editable && matrix?.editable === true && !blocked;
  const reloading = operation === "reloading";
  const pending = operation !== null || mutation.isPending;
  const displayed = draft ? draftMatrix(draft.base, draft.grants) : undefined;
  const changed =
    dirty &&
    matrix !== undefined &&
    draft?.base.roleCode === matrix.roleCode &&
    matrix.version !== draft.base.version;
  const toggle = (code: PermissionCode) => {
    if (!canEdit || pending || useRbacEditorStore.getState().operation !== null || !draft) return;
    const grants = new Set(draft.grants);
    if (grants.has(code)) grants.delete(code);
    else grants.add(code);
    setDraft({ ...draft, grants });
  };
  const bulk = (resources: readonly RoleMatrixResource[], grant: boolean) => {
    if (!canEdit || pending || useRbacEditorStore.getState().operation !== null || !draft) return;
    setDraft({ ...draft, grants: bulkGrants(draft.grants, resources, grant) });
  };
  const save = async () => {
    if (!canEdit || !dirty || pending || useRbacEditorStore.getState().operation !== null || !draft)
      return;
    setOperation("saving");
    setMessage("");
    try {
      const result = await mutation.mutateAsync({
        roleCode: draft.base.roleCode,
        input: { version: draft.base.version, permissions: [...draft.grants].sort() },
      });
      if (useRbacEditorStore.getState().epoch !== epoch) return;
      setDraft(snapshot(result));
      setMessage("");
      setBlocked(false);
    } catch (error: unknown) {
      if (useRbacEditorStore.getState().epoch !== epoch) return;
      setMessage(saveError(error));
      if (error instanceof ApiError && error.code === RBAC_ERRORS.notEditable) setBlocked(true);
    } finally {
      if (useRbacEditorStore.getState().epoch === epoch) setOperation(null);
    }
  };
  const reload = async (fetchLatest: () => Promise<{ data?: RoleMatrix; isError?: boolean }>) => {
    if (pending || useRbacEditorStore.getState().operation !== null) return;
    setOperation("reloading");
    try {
      const result = await fetchLatest();
      if (!result.data || result.isError) throw new Error("Matrix reload failed");
      if (useRbacEditorStore.getState().epoch !== epoch) return;
      setDraft(snapshot(result.data));
      setMessage("");
      setBlocked(false);
    } catch {
      if (useRbacEditorStore.getState().epoch !== epoch) return;
      setMessage(RBAC_EDITOR.refetchFailed);
    } finally {
      if (useRbacEditorStore.getState().epoch === epoch) setOperation(null);
    }
  };
  return {
    matrix: displayed,
    dirty,
    canEdit,
    roleReadOnly,
    pending,
    reloading,
    message,
    changed,
    toggle,
    bulk,
    save,
    reload,
  };
}
export type PermissionEditor = ReturnType<typeof usePermissionEditor>;
